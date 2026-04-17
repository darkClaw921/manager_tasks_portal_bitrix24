/**
 * Structured-output wrapper around OpenRouter's chat completions.
 *
 * `generateStructured<T>` takes a Zod schema, sends it to the model as a
 * `response_format: { type: 'json_schema', ... }` constraint, parses the
 * returned JSON and validates it via `schema.safeParse`. On validation
 * failure we retry up to `maxRetries` times, prepending the validation
 * error to the next system prompt so the model can self-correct.
 *
 * Why a separate module:
 *   - `client.ts` exposes raw text completions (chat / stream). Structured
 *     calls deserve their own surface so the typing stays sharp:
 *     `Promise<T>` rather than `Promise<string>`.
 *   - The retry-with-error-feedback loop is non-trivial and we re-use it
 *     from `lib/workspaces/ai.ts`, the chat command extractor, the per-
 *     element editor, and probably the upcoming meeting-summary work.
 *
 * Conversion from Zod → JSON Schema uses Zod 4's built-in `z.toJSONSchema`
 * (no extra dependency). We pass `target: 'draft-7'` because OpenRouter's
 * structured-output enforcement is rooted in JSON Schema 7 (any other
 * draft sometimes leaks `$ref` constructs the upstream provider rejects).
 */

import { z } from 'zod';
import OpenAI from 'openai';
import { AIError, isAIAvailable } from './client';

// ==================== Configuration ====================

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const DEFAULT_MODEL = 'x-ai/grok-4.1-fast';
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_MAX_RETRIES = 2;

// ==================== Singleton Client ====================
//
// Mirrors `client.ts` so we don't compete with that module for the
// connection pool and so the retry / referer headers stay consistent.

let clientInstance: OpenAI | null = null;

function getClient(): OpenAI {
  if (!clientInstance) {
    if (!OPENROUTER_API_KEY) {
      throw new AIError(
        'OPENROUTER_API_KEY is not configured. Set it in .env.local to enable AI features.',
        'missing_api_key'
      );
    }
    clientInstance = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: OPENROUTER_API_KEY,
      maxRetries: 2,
      defaultHeaders: {
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        'X-Title': 'TaskHub',
      },
    });
  }
  return clientInstance;
}

// ==================== Public API ====================

export interface GenerateStructuredOptions<T> {
  /** Zod schema describing the response shape. Drives both the JSON schema
   *  sent to the model AND the post-parse validation. */
  schema: z.ZodType<T>;
  /** Top-level instructions for the model. Will be augmented by the schema
   *  hint and (on retry) the previous error. */
  systemPrompt: string;
  /** The user / task message to act on. */
  userPrompt: string;
  /** Override OpenRouter model id. Defaults to the same Grok model the
   *  rest of the app uses. */
  model?: string;
  /** Number of additional attempts if parsing or validation fails.
   *  Total calls = 1 + maxRetries. Defaults to 2. */
  maxRetries?: number;
  /** Cap on response tokens. Defaults to 4096. */
  maxTokens?: number;
  /** Sampling temperature. Defaults to 0.2 (low — we want deterministic
   *  structured output). */
  temperature?: number;
  /** A short identifier the upstream service uses as a label for the
   *  schema (alphanumeric / underscore only). Defaults to "response". */
  schemaName?: string;
}

/**
 * Call OpenRouter with a JSON-schema constraint and return a validated
 * value of type `T`. Throws `AIError` on missing API key, parsing failure
 * after retries, or transport errors.
 *
 * Important: the model's response sometimes contains pre/post text even
 * when `strict: true` is set. We always run JSON-extract + safeParse and
 * trust the schema, not the model's framing.
 */
export async function generateStructured<T>(
  opts: GenerateStructuredOptions<T>
): Promise<T> {
  if (!isAIAvailable()) {
    throw new AIError(
      'AI features are disabled (OPENROUTER_API_KEY missing)',
      'missing_api_key'
    );
  }

  const {
    schema,
    systemPrompt,
    userPrompt,
    model = DEFAULT_MODEL,
    maxRetries = DEFAULT_MAX_RETRIES,
    maxTokens = DEFAULT_MAX_TOKENS,
    temperature = DEFAULT_TEMPERATURE,
    schemaName = 'response',
  } = opts;

  const jsonSchema = zodToJsonSchema(schema, schemaName);
  const safeName = sanitizeSchemaName(schemaName);

  let lastError: { stage: 'parse' | 'validate'; message: string; raw: string } | null = null;
  const client = getClient();

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const sys = lastError ? buildRetryPrompt(systemPrompt, lastError) : systemPrompt;

    let raw: string;
    try {
      const response = await client.chat.completions.create({
        model,
        max_tokens: maxTokens,
        temperature,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: userPrompt },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: safeName,
            strict: true,
            schema: jsonSchema,
          },
          // OpenAI SDK's strongest typing only knows `text` / `json_object`.
          // We cast through unknown so TypeScript stops complaining about
          // the `json_schema` discriminator that OpenRouter accepts.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      });
      raw = response.choices[0]?.message?.content ?? '';
      if (!raw.trim()) {
        throw new AIError('Empty response from model', 'empty_response');
      }
    } catch (error) {
      // Transport / API errors are not retried here — they have their own
      // SDK-level retry loop. Surface immediately so the caller gets a
      // single coherent failure.
      if (error instanceof AIError) throw error;
      if (error instanceof OpenAI.APIError) {
        const code = mapAPIErrorCode(error.status);
        console.error(`[ai/structured] API Error ${error.status}: ${error.message}`);
        throw new AIError(getErrorMessage(error.status, error.message), code);
      }
      console.error('[ai/structured] Unexpected error:', error);
      throw new AIError(
        'Произошла непредвиденная ошибка при обращении к AI',
        'unexpected_error'
      );
    }

    // Some providers wrap JSON in markdown fences even when strict is on.
    const candidate = extractJson(raw);
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'JSON.parse failed';
      lastError = { stage: 'parse', message: msg, raw };
      console.warn(
        `[ai/structured] attempt ${attempt + 1}/${maxRetries + 1} parse failed: ${msg}`
      );
      continue;
    }

    const validation = schema.safeParse(parsed);
    if (validation.success) {
      return validation.data;
    }
    const issuesText = formatZodIssues(validation.error);
    lastError = { stage: 'validate', message: issuesText, raw };
    console.warn(
      `[ai/structured] attempt ${attempt + 1}/${maxRetries + 1} validation failed: ${issuesText}`
    );
  }

  // Exhausted retries.
  const summary = lastError
    ? `${lastError.stage === 'parse' ? 'JSON parse' : 'schema validation'} failed: ${lastError.message}`
    : 'unknown failure';
  console.error(`[ai/structured] giving up after ${maxRetries + 1} attempts: ${summary}`);
  throw new AIError(
    `Не удалось получить корректный JSON от AI после ${maxRetries + 1} попыток: ${summary}`,
    'structured_failed'
  );
}

// ==================== Helpers ====================

/** Convert a Zod schema to a JSON Schema OpenRouter will accept. */
function zodToJsonSchema(schema: z.ZodType<unknown>, name: string): Record<string, unknown> {
  // Zod 4 ships `z.toJSONSchema`. We pull out `$schema`/`$id` because
  // OpenRouter (some providers) gag on the `$schema` URI.
  const jsonSchema = z.toJSONSchema(schema, {
    target: 'draft-7',
  }) as Record<string, unknown>;
  delete jsonSchema['$schema'];
  delete jsonSchema['$id'];
  if (!jsonSchema.title && name) jsonSchema.title = name;
  return jsonSchema;
}

/** Schema names must match `^[a-zA-Z0-9_-]+$`. */
function sanitizeSchemaName(name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
  return safe || 'response';
}

/**
 * Strip common LLM JSON wrappers: triple-backtick fences, language hints,
 * leading/trailing prose. Conservative — if we can't find an obvious
 * boundary we return the raw input and let `JSON.parse` fail.
 */
function extractJson(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  // ```json …` or ``` …`
  const fenceMatch = trimmed.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  if (fenceMatch && fenceMatch[1]) return fenceMatch[1].trim();
  // First {...} or [...] block.
  const firstObj = trimmed.indexOf('{');
  const firstArr = trimmed.indexOf('[');
  let start = -1;
  if (firstObj >= 0 && firstArr >= 0) start = Math.min(firstObj, firstArr);
  else if (firstObj >= 0) start = firstObj;
  else if (firstArr >= 0) start = firstArr;
  if (start < 0) return trimmed;
  const lastObj = trimmed.lastIndexOf('}');
  const lastArr = trimmed.lastIndexOf(']');
  const end = Math.max(lastObj, lastArr);
  if (end <= start) return trimmed;
  return trimmed.slice(start, end + 1);
}

function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .map((iss) => {
      const path = iss.path.length > 0 ? iss.path.join('.') : '<root>';
      return `${path}: ${iss.message}`;
    })
    .join('; ');
}

function buildRetryPrompt(
  baseSystemPrompt: string,
  prev: { stage: 'parse' | 'validate'; message: string; raw: string }
): string {
  const trimmedRaw =
    prev.raw.length > 1500 ? `${prev.raw.slice(0, 1500)}…` : prev.raw;
  const reason =
    prev.stage === 'parse'
      ? `Твой предыдущий ответ не является валидным JSON: ${prev.message}`
      : `Твой предыдущий ответ не прошёл валидацию схемы: ${prev.message}`;
  return [
    baseSystemPrompt,
    '',
    '⚠️ ПОВТОРНАЯ ПОПЫТКА. Исправь свой предыдущий ответ.',
    reason,
    'Верни ТОЛЬКО валидный JSON, без markdown-обёрток и пояснений.',
    'Предыдущий ответ был такой:',
    '---',
    trimmedRaw,
    '---',
  ].join('\n');
}

function mapAPIErrorCode(status: number | undefined): string {
  if (!status) return 'api_error';
  if (status === 429) return 'rate_limited';
  if (status === 401) return 'invalid_api_key';
  if (status === 400) return 'bad_request';
  if (status === 408) return 'timeout';
  if (status >= 500) return 'server_error';
  return 'api_error';
}

function getErrorMessage(status: number | undefined, originalMessage: string): string {
  switch (status) {
    case 429:
      return 'AI сервис временно перегружен. Попробуйте через минуту.';
    case 401:
      return 'Неверный API ключ OpenRouter. Проверьте настройки.';
    case 400:
      return `Ошибка запроса к AI: ${originalMessage}`;
    case 408:
      return 'Превышено время ожидания ответа от AI.';
    default:
      if (status && status >= 500) {
        return 'AI сервис временно недоступен. Попробуйте позже.';
      }
      return `Ошибка AI: ${originalMessage}`;
  }
}

// ==================== Test hook ====================

/**
 * Reset the cached singleton. Exported only for tests — production code
 * should never need this. Mirrors the same approach in `client.ts`.
 */
export function __resetClientForTests(): void {
  clientInstance = null;
}
