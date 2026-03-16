import OpenAI from 'openai';

// ==================== Configuration ====================

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const DEFAULT_MODEL = 'x-ai/grok-4.1-fast';
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TEMPERATURE = 0.3;

// ==================== Singleton Client ====================

let clientInstance: OpenAI | null = null;

/**
 * Returns the OpenAI-compatible client singleton configured for OpenRouter.
 * Throws if OPENROUTER_API_KEY is not configured.
 */
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
      maxRetries: 3,
      defaultHeaders: {
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        'X-Title': 'TaskHub',
      },
    });
  }

  return clientInstance;
}

// ==================== Error Handling ====================

export class AIError extends Error {
  code: string;

  constructor(message: string, code: string = 'ai_error') {
    super(message);
    this.name = 'AIError';
    this.code = code;
  }
}

/**
 * Check if AI features are available (API key configured).
 */
export function isAIAvailable(): boolean {
  return !!OPENROUTER_API_KEY;
}

// ==================== Generate Completion ====================

/**
 * Generate a text completion using OpenRouter (Grok 4.1 Fast).
 *
 * @param systemPrompt - System-level instructions for the model
 * @param userMessage - The user's message/query
 * @param options - Optional model parameters
 * @returns The generated text response
 */
export async function generateCompletion(
  systemPrompt: string,
  userMessage: string,
  options?: {
    maxTokens?: number;
    temperature?: number;
    model?: string;
  }
): Promise<string> {
  const client = getClient();

  try {
    const response = await client.chat.completions.create({
      model: options?.model || DEFAULT_MODEL,
      max_tokens: options?.maxTokens || DEFAULT_MAX_TOKENS,
      temperature: options?.temperature ?? DEFAULT_TEMPERATURE,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      throw new AIError('No text content in AI response', 'empty_response');
    }

    return content;
  } catch (error) {
    if (error instanceof AIError) {
      throw error;
    }

    if (error instanceof OpenAI.APIError) {
      const code = mapAPIErrorCode(error.status);
      console.error(`[ai] API Error ${error.status}: ${error.message}`);
      throw new AIError(getErrorMessage(error.status, error.message), code);
    }

    console.error('[ai] Unexpected error:', error);
    throw new AIError(
      'Произошла непредвиденная ошибка при обращении к AI',
      'unexpected_error'
    );
  }
}

// ==================== Stream Completion ====================

/**
 * Stream a completion response from OpenRouter (Grok 4.1 Fast).
 *
 * Returns a ReadableStream<string> that yields text chunks as they arrive.
 * Suitable for SSE or streaming HTTP responses.
 *
 * @param systemPrompt - System-level instructions for the model
 * @param userMessage - The user's message/query
 * @param history - Optional conversation history (role/content pairs)
 * @param options - Optional model parameters
 * @returns ReadableStream of text chunks
 */
export function streamCompletion(
  systemPrompt: string,
  userMessage: string,
  history?: Array<{ role: 'user' | 'assistant'; content: string }>,
  options?: {
    maxTokens?: number;
    temperature?: number;
    model?: string;
  }
): ReadableStream<string> {
  const client = getClient();

  // Build messages array: system + history + current user message
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
    ...(history || []),
    { role: 'user', content: userMessage },
  ];

  return new ReadableStream<string>({
    async start(controller) {
      try {
        const stream = await client.chat.completions.create({
          model: options?.model || DEFAULT_MODEL,
          max_tokens: options?.maxTokens || DEFAULT_MAX_TOKENS,
          temperature: options?.temperature ?? DEFAULT_TEMPERATURE,
          messages,
          stream: true,
        });

        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content;
          if (text) {
            controller.enqueue(text);
          }
        }

        controller.close();
      } catch (error) {
        if (error instanceof OpenAI.APIError) {
          const msg = getErrorMessage(error.status, error.message);
          console.error(`[ai] Stream API Error ${error.status}: ${error.message}`);
          controller.error(new AIError(msg, mapAPIErrorCode(error.status)));
        } else {
          console.error('[ai] Stream unexpected error:', error);
          controller.error(
            new AIError(
              'Произошла ошибка при стриминге ответа AI',
              'stream_error'
            )
          );
        }
      }
    },
  });
}

// ==================== Helpers ====================

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
