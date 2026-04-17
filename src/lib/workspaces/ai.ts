/**
 * Workspace-domain AI helpers.
 *
 * Three concerns, three small functions:
 *
 *   1. `generateElementCommands` — given a free-form instruction (often
 *      from the side chat), ask the LLM to either chat OR emit a list of
 *      `WorkspaceOp` commands that the UI can apply with one button click.
 *
 *   2. `editElementWithAI` — given a single element + an instruction,
 *      ask the LLM for a sparse patch (Partial<Element>) that the UI then
 *      applies as a local op via the existing op pipeline.
 *
 *   3. `generateImage` — call the OpenRouter image model and return the
 *      raw bytes + dimensions. We deliberately do NOT persist the asset
 *      here: persistence lives in `lib/workspaces/assets.ts` (y24.6),
 *      kept separate so this module has zero filesystem side-effects and
 *      can be unit-tested with a single OpenAI mock.
 *
 * Why a thin layer instead of inlining into routes?
 *   - The same intent-detection prompt is reused by `/chat` and the
 *     future quick-action buttons in the toolbar.
 *   - `editElementWithAI` whitelists the patch keys before returning so
 *     the route does not have to re-implement the security check.
 *   - The image function decodes the base64 data URL once for callers
 *     and exposes a simple `{ buffer, mime, width, height }` contract.
 */

import { z } from 'zod';
import OpenAI from 'openai';
import { randomUUID } from 'node:crypto';
import { generateStructured } from '@/lib/ai/structured';
import { AIError } from '@/lib/ai/client';
import type { Element, WorkspaceOp } from '@/types/workspace';

// ==================== Models ====================

const TEXT_MODEL = 'x-ai/grok-4.1-fast';
const IMAGE_MODEL = 'google/gemini-2.5-flash-image-preview';

// ==================== Shared schemas ====================

/** Visual style on every element. Mirrors `ElementStyle` in `types/workspace.ts`. */
const styleSchema = z
  .object({
    stroke: z.string().optional(),
    fill: z.string().optional(),
    strokeWidth: z.number().optional(),
    opacity: z.number().min(0).max(1).optional(),
  })
  .strict();

const baseFieldsSchema = {
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  rot: z.number().optional(),
  z: z.number().default(0),
  style: styleSchema.default({}),
};

/**
 * Subset of element kinds the LLM is allowed to emit. We keep this in
 * lock-step with the renderer's switch (`drawElement`). `image` is
 * deliberately omitted — image elements are produced by the dedicated
 * `generateImage` flow because the LLM cannot mint asset ids on its own.
 */
const aiElementSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('rect'),
    ...baseFieldsSchema,
  }),
  z.object({
    kind: z.literal('ellipse'),
    ...baseFieldsSchema,
  }),
  z.object({
    kind: z.literal('line'),
    ...baseFieldsSchema,
  }),
  z.object({
    kind: z.literal('arrow'),
    ...baseFieldsSchema,
  }),
  z.object({
    kind: z.literal('text'),
    ...baseFieldsSchema,
    content: z.string(),
    fontSize: z.number().min(8).max(96).default(16),
  }),
  z.object({
    kind: z.literal('sticky'),
    ...baseFieldsSchema,
    content: z.string(),
    color: z.string().optional(),
  }),
  z.object({
    kind: z.literal('table'),
    ...baseFieldsSchema,
    rows: z.number().int().min(1).max(50),
    cols: z.number().int().min(1).max(20),
    cells: z.array(z.array(z.string())),
  }),
]);

type AIElement = z.infer<typeof aiElementSchema>;

// ==================== generateElementCommands ====================

/**
 * The whole response from the chat-with-commands flow. `text` is the
 * markdown the LLM wants to display in the chat bubble, `commands` is
 * the optional list of ops to apply when the user clicks "Применить".
 *
 * We model `commands` as `add` ops only — the UI never trusts the LLM to
 * mutate or delete existing elements via chat. Updates / deletes go
 * through the per-element AI flow which is more constrained.
 */
const chatResponseSchema = z.object({
  text: z.string().describe('Сообщение для отображения в чате (markdown).'),
  commands: z
    .array(aiElementSchema)
    .nullable()
    .describe(
      'Опционально — массив новых элементов для добавления на доску. null если просто разговор.'
    ),
});

export interface ChatCommandResult {
  /** Display text for the chat bubble. */
  text: string;
  /**
   * Workspace ops ready to commit. Empty when the LLM produced a chat-
   * only reply.
   */
  commands: WorkspaceOp[];
}

const CHAT_SYSTEM_PROMPT = `Ты AI-ассистент в коллаборативной доске TaskHub (Excalidraw-style canvas).

Твоя задача:
1. Если пользователь просит создать что-то на доске (диаграмму, таблицу, заметки, схему) — верни массив commands с новыми элементами.
2. Если пользователь просто болтает или задаёт вопрос — верни text и commands: null.

Координаты в canvas-пикселях. Стандартный viewport ~1200x800. Размещай элементы НЕ перекрывая друг друга, по возможности группируй логически.

Поддерживаемые kind:
- "rect" — прямоугольник, ширина 100-400, высота 60-200
- "ellipse" — эллипс
- "line" / "arrow" — линия (w/h задают вектор от x,y)
- "text" — текст, fontSize 14-32
- "sticky" — заметка, ширина ~180, высота ~120
- "table" — таблица с rows/cols/cells (cells: string[rows][cols])

Стили:
- stroke: HEX цвет рамки (напр. "#1f2937")
- fill: HEX цвет заливки или undefined для прозрачной
- strokeWidth: 1-4

Отвечай на русском. Текст в text — короткий, дружелюбный. JSON компактный, без лишних полей.`;

/**
 * Decide whether to emit canvas commands. Returns the chat text plus a
 * (possibly empty) list of ready-to-commit ops.
 *
 * `currentElements` is supplied as context so the model can avoid
 * overlapping new shapes with existing ones; we cap it at 50 entries
 * to keep prompt size bounded.
 */
export async function generateElementCommands(input: {
  instruction: string;
  currentElements?: Element[];
  userId: number;
  baseVersion: number;
  /** Override OpenRouter model id. */
  model?: string;
}): Promise<ChatCommandResult> {
  const trimmed = input.instruction.trim();
  if (!trimmed) {
    throw new AIError('instruction must not be empty', 'bad_request');
  }

  const ctx = formatElementsContext(input.currentElements ?? []);
  const userPrompt = ctx ? `${trimmed}\n\nКонтекст текущей доски:\n${ctx}` : trimmed;

  const result = await generateStructured({
    schema: chatResponseSchema,
    systemPrompt: CHAT_SYSTEM_PROMPT,
    userPrompt,
    model: input.model ?? TEXT_MODEL,
    schemaName: 'workspace_chat_with_commands',
    maxRetries: 2,
    temperature: 0.4,
  });

  const ops: WorkspaceOp[] = (result.commands ?? []).map((aiEl) =>
    aiElementToAddOp(aiEl, input.userId, input.baseVersion)
  );

  return { text: result.text, commands: ops };
}

// ==================== editElementWithAI ====================

/** Whitelist of fields the LLM is allowed to mutate via per-element AI. */
const ALLOWED_PATCH_KEYS: Readonly<Set<string>> = new Set([
  'x',
  'y',
  'w',
  'h',
  'rot',
  'z',
  'style',
  'content',
  'fontSize',
  'color',
  'rows',
  'cols',
  'cells',
  'points',
]);

/**
 * Schema the model sees. Permissive — we whitelist on read so adding a
 * new safe field later only requires touching `ALLOWED_PATCH_KEYS`.
 */
const editPatchSchema = z.object({
  patch: z.record(z.string(), z.unknown()),
  explanation: z.string().describe('Короткое описание что было изменено.'),
});

export interface EditElementResult {
  /** Sparse field updates to apply via an `update` op. */
  patch: Partial<Element>;
  /** Short human-readable explanation for the chat / toast. */
  explanation: string;
}

const EDIT_SYSTEM_PROMPT = `Ты редактируешь ОДИН элемент на доске Excalidraw-style.

Тебе дадут JSON элемента и инструкцию пользователя.
Верни ТОЛЬКО патч (Partial) — поля которые надо изменить.

ЗАПРЕЩЕНО менять: id, kind, createdBy, updatedAt.
РАЗРЕШЕНО менять: x, y, w, h, rot, z, style, content, fontSize, color, rows, cols, cells, points.

Если инструкция бессмысленна для этого типа элемента — верни пустой patch и объясни в explanation.

Отвечай на русском. Объяснение — одно короткое предложение.`;

/**
 * Ask the LLM to patch a single element. Returns only whitelisted fields
 * regardless of what the model emits — we never trust the model with
 * `id`, `kind`, `createdBy`, etc.
 */
export async function editElementWithAI(input: {
  element: Element;
  instruction: string;
  model?: string;
}): Promise<EditElementResult> {
  const trimmed = input.instruction.trim();
  if (!trimmed) {
    throw new AIError('instruction must not be empty', 'bad_request');
  }

  const userPrompt = [
    'Текущий элемент:',
    '```json',
    JSON.stringify(input.element, null, 2),
    '```',
    '',
    `Инструкция: ${trimmed}`,
  ].join('\n');

  const result = await generateStructured({
    schema: editPatchSchema,
    systemPrompt: EDIT_SYSTEM_PROMPT,
    userPrompt,
    model: input.model ?? TEXT_MODEL,
    schemaName: 'workspace_element_patch',
    maxRetries: 2,
    temperature: 0.3,
  });

  const filtered: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(result.patch ?? {})) {
    if (ALLOWED_PATCH_KEYS.has(k)) filtered[k] = v;
  }

  return {
    patch: filtered as Partial<Element>,
    explanation: result.explanation,
  };
}

// ==================== generateImage ====================

export interface GeneratedImage {
  /** Decoded image bytes ready to be written to disk. */
  buffer: Buffer;
  /** MIME type from the data URL (e.g. `image/png`). */
  mime: string;
  /** Best-effort width in pixels (read from upstream metadata if present, else null). */
  width: number | null;
  /** Best-effort height in pixels. */
  height: number | null;
}

let imageClient: OpenAI | null = null;
function getImageClient(): OpenAI {
  if (!imageClient) {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new AIError(
        'OPENROUTER_API_KEY is not configured',
        'missing_api_key'
      );
    }
    imageClient = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
      maxRetries: 2,
      defaultHeaders: {
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        'X-Title': 'TaskHub',
      },
    });
  }
  return imageClient;
}

/**
 * Generate a single image via OpenRouter (`google/gemini-2.5-flash-image-preview`).
 *
 * Returns raw bytes — the caller is responsible for persisting them via
 * `assets.ts`. We accept either:
 *   - `message.images[0].image_url.url` data URL (Gemini's standard shape)
 *   - `message.content` containing a base64 data URL inline
 *
 * Throws `AIError` on transport failures, missing API key, or when the
 * response contains no decodable image.
 */
export async function generateImage(input: {
  prompt: string;
  model?: string;
}): Promise<GeneratedImage> {
  const trimmed = input.prompt.trim();
  if (!trimmed) {
    throw new AIError('prompt must not be empty', 'bad_request');
  }

  const client = getImageClient();
  const model = input.model ?? IMAGE_MODEL;

  let response;
  try {
    response = await client.chat.completions.create(
      {
        model,
        messages: [{ role: 'user', content: trimmed }],
        // OpenRouter image models require both modalities to enable image output.
        // The OpenAI SDK type doesn't know about `modalities` so we cast.
        modalities: ['image', 'text'],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any
    );
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      console.error(`[ai/image] API Error ${error.status}: ${error.message}`);
      throw new AIError(
        `Ошибка генерации изображения: ${error.message}`,
        mapImageErrorCode(error.status)
      );
    }
    if (error instanceof AIError) throw error;
    console.error('[ai/image] Unexpected error:', error);
    throw new AIError(
      'Не удалось сгенерировать изображение',
      'unexpected_error'
    );
  }

  // Extract data URL from either shape.
  const message = response.choices?.[0]?.message as
    | { content?: unknown; images?: unknown }
    | undefined;
  if (!message) {
    throw new AIError('Empty response from image model', 'empty_response');
  }

  const dataUrl = pickImageDataUrl(message);
  if (!dataUrl) {
    throw new AIError(
      'Image model did not return a usable image',
      'empty_response'
    );
  }

  const decoded = decodeDataUrl(dataUrl);
  if (!decoded) {
    throw new AIError('Failed to decode image data URL', 'bad_response');
  }

  return {
    buffer: decoded.buffer,
    mime: decoded.mime,
    // Width/height are not on the data URL — caller can probe with sharp.
    width: null,
    height: null,
  };
}

// ==================== Internals ====================

/**
 * Convert an LLM-emitted element into a wire-format `add` op. Generates
 * a fresh client UUID for both the element id (so collisions are
 * impossible) and the op id (for dedup on POST /ops).
 */
function aiElementToAddOp(
  aiEl: AIElement,
  userId: number,
  baseVersion: number
): WorkspaceOp {
  const now = Date.now();
  // The discriminated union narrows by `kind` so we get all per-kind
  // fields (content/fontSize/color/rows/cols/cells) for free.
  const el = {
    ...aiEl,
    id: randomUUID(),
    createdBy: userId,
    updatedAt: now,
    z: typeof aiEl.z === 'number' ? aiEl.z : 0,
    style: aiEl.style ?? {},
  } as Element;
  return {
    type: 'add',
    el,
    opId: randomUUID(),
    v: baseVersion,
  };
}

/**
 * Compact textual representation of the current canvas, capped at 50
 * elements so the prompt does not blow past the model's context. Each
 * row is `kind @ (x,y) [WxH] "snippet"`.
 */
function formatElementsContext(elements: Element[]): string {
  if (elements.length === 0) return '';
  const sorted = [...elements].sort((a, b) => a.z - b.z).slice(0, 50);
  const rows = sorted.map((el) => {
    const snippet = elementSnippet(el);
    return `- ${el.kind} @ (${Math.round(el.x)},${Math.round(el.y)}) [${Math.round(el.w)}x${Math.round(el.h)}]${snippet ? ` "${snippet}"` : ''}`;
  });
  return rows.join('\n');
}

function elementSnippet(el: Element): string {
  if (el.kind === 'text' || el.kind === 'sticky') {
    const c = el.content?.replace(/\s+/g, ' ').trim() ?? '';
    return c.length > 32 ? `${c.slice(0, 32)}…` : c;
  }
  if (el.kind === 'table') {
    return `${el.rows}x${el.cols}`;
  }
  return '';
}

function pickImageDataUrl(
  message: { content?: unknown; images?: unknown }
): string | null {
  // Standard shape: { images: [{ image_url: { url: 'data:…' } }] }
  if (Array.isArray(message.images)) {
    for (const im of message.images) {
      if (im && typeof im === 'object') {
        const imageUrl = (im as { image_url?: { url?: unknown } }).image_url;
        if (imageUrl && typeof imageUrl.url === 'string' && imageUrl.url.startsWith('data:')) {
          return imageUrl.url;
        }
      }
    }
  }
  // Fallback: model put the data URL in content (string or {type,text} array).
  if (typeof message.content === 'string') {
    const m = message.content.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=]+/);
    if (m) return m[0];
  }
  if (Array.isArray(message.content)) {
    for (const part of message.content) {
      if (part && typeof part === 'object') {
        const p = part as { type?: unknown; text?: unknown; image_url?: { url?: unknown } };
        if (typeof p.text === 'string') {
          const m = p.text.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=]+/);
          if (m) return m[0];
        }
        if (p.image_url && typeof p.image_url.url === 'string' && p.image_url.url.startsWith('data:')) {
          return p.image_url.url;
        }
      }
    }
  }
  return null;
}

function decodeDataUrl(
  dataUrl: string
): { buffer: Buffer; mime: string } | null {
  const m = dataUrl.match(/^data:([a-zA-Z0-9.+/-]+);base64,(.+)$/);
  if (!m) return null;
  const mime = m[1];
  try {
    const buffer = Buffer.from(m[2], 'base64');
    if (buffer.byteLength === 0) return null;
    return { buffer, mime };
  } catch {
    return null;
  }
}

function mapImageErrorCode(status: number | undefined): string {
  if (!status) return 'image_error';
  if (status === 429) return 'rate_limited';
  if (status === 401) return 'invalid_api_key';
  if (status === 400) return 'bad_request';
  if (status >= 500) return 'server_error';
  return 'image_error';
}

// ==================== Test hooks ====================

export function __resetImageClientForTests(): void {
  imageClient = null;
}
