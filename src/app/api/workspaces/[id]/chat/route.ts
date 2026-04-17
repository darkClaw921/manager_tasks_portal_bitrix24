import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { canJoinWorkspace } from '@/lib/workspaces/access';
import { getWorkspace, getSnapshot } from '@/lib/workspaces/workspaces';
import { db } from '@/lib/db';
import { workspaceChatMessages } from '@/lib/db/schema';
import { and, desc, eq, lt } from 'drizzle-orm';
import { streamCompletion, isAIAvailable, AIError } from '@/lib/ai/client';
import { generateElementCommands } from '@/lib/workspaces/ai';
import { fromSnapshot } from '@/lib/workspaces/ops';
import type { WorkspaceSnapshot, WorkspaceOp } from '@/types/workspace';

type RouteContext = { params: Promise<{ id: string }> };

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_CONTENT_LENGTH = 4000;
/** How many prior messages to include as conversational context for the LLM. */
const HISTORY_FOR_CONTEXT = 20;

/**
 * Russian-language keywords that nudge intent classification toward
 * "create elements on the board". The system prompt is the primary
 * mechanism — this is a cheap pre-filter so we skip the second LLM call
 * for purely conversational messages.
 *
 * False positives are fine (we just do an extra structured call). False
 * negatives mean a missed apply suggestion — better than spamming
 * commands on every "привет".
 */
const INTENT_KEYWORDS = [
  'нарисуй',
  'нарисуйте',
  'создай',
  'создайте',
  'добавь',
  'добавьте',
  'сделай',
  'сделайте',
  'покажи на доске',
  'набросай',
  'сгенерируй',
  'построй',
  'постройте',
  'набросать',
  'набросок',
  'таблиц',
  'диаграмм',
  'схем',
  'mind map',
  'майндмеп',
  'майндмап',
  'kanban',
  'канбан',
];

function looksLikeBoardIntent(text: string): boolean {
  const lower = text.toLowerCase();
  return INTENT_KEYWORDS.some((kw) => lower.includes(kw));
}

function parseId(raw: string): number | null {
  const n = parseInt(raw, 10);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

/**
 * GET /api/workspaces/[id]/chat
 *
 * Newest-first paginated history. Same cursor pattern as meeting messages:
 * `?limit=50&before=<createdAt-iso>`.
 *
 * Response: `{ items: WorkspaceChatMessage[], nextBefore: string | null }`.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { id } = await context.params;
    const wsId = parseId(id);
    if (wsId == null) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid workspace id' },
        { status: 400 }
      );
    }

    const ws = getWorkspace(wsId);
    if (!ws) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Workspace not found' },
        { status: 404 }
      );
    }

    const allowed = await canJoinWorkspace(auth.user.userId, wsId);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'You do not have access to this workspace' },
        { status: 403 }
      );
    }

    const url = new URL(request.url);
    const limitRaw = url.searchParams.get('limit');
    const beforeRaw = url.searchParams.get('before');

    let limit = DEFAULT_LIMIT;
    if (limitRaw !== null) {
      const parsed = Number.parseInt(limitRaw, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return NextResponse.json(
          { error: 'Validation', message: 'limit must be a positive integer' },
          { status: 400 }
        );
      }
      limit = Math.min(parsed, MAX_LIMIT);
    }

    let beforeIso: string | null = null;
    if (beforeRaw !== null) {
      const parsed = new Date(beforeRaw);
      if (!Number.isFinite(parsed.getTime())) {
        return NextResponse.json(
          { error: 'Validation', message: 'before must be a valid ISO date' },
          { status: 400 }
        );
      }
      beforeIso = parsed.toISOString();
    }

    const where = beforeIso
      ? and(
          eq(workspaceChatMessages.workspaceId, wsId),
          lt(workspaceChatMessages.createdAt, beforeIso)
        )
      : eq(workspaceChatMessages.workspaceId, wsId);

    const items = db
      .select()
      .from(workspaceChatMessages)
      .where(where)
      .orderBy(desc(workspaceChatMessages.createdAt), desc(workspaceChatMessages.id))
      .limit(limit)
      .all();

    const nextBefore =
      items.length === limit ? items[items.length - 1]?.createdAt ?? null : null;

    return NextResponse.json({ items, nextBefore });
  } catch (error) {
    console.error('[workspaces/[id]/chat] GET error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to load chat history' },
      { status: 500 }
    );
  }
}

const SYSTEM_PROMPT = `Ты AI-ассистент в коллаборативной доске TaskHub.
Помогай пользователю обсуждать идеи, планировать структуру доски, генерировать
текст и таблицы, отвечать на вопросы по содержимому. Используй markdown для
форматирования. Отвечай на русском языке кратко и по делу.

Если пользователь явно просит создать что-то НА ДОСКЕ (диаграмму, таблицу,
заметки, схему) — отвечай как обычно, а после отдельной системной обработки
доска получит готовые элементы. Не нужно вставлять JSON в свой текст.`;

/**
 * POST /api/workspaces/[id]/chat
 *
 * Streams an SSE-style response with typed events:
 *
 *   data: {"type":"chunk","text":"…"}\n\n     -- assistant text chunk
 *   data: {"type":"commands","commands":[…]}\n\n  -- optional, after text
 *   data: {"type":"done"}\n\n
 *   data: {"type":"error","message":"…"}\n\n
 *
 * Each frame is a single JSON object on its own line, prefixed with
 * `data: ` and terminated by `\n\n` so EventSource semantics work even
 * if the client switches to it later. The current client uses a plain
 * Fetch reader and `JSON.parse` per `data:` line.
 *
 * Body: `{ content: string }`.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { id } = await context.params;
    const wsId = parseId(id);
    if (wsId == null) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid workspace id' },
        { status: 400 }
      );
    }

    const ws = getWorkspace(wsId);
    if (!ws) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Workspace not found' },
        { status: 404 }
      );
    }

    const allowed = await canJoinWorkspace(auth.user.userId, wsId);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'You do not have access to this workspace' },
        { status: 403 }
      );
    }

    if (!isAIAvailable()) {
      return NextResponse.json(
        { error: 'Unavailable', message: 'AI features are disabled (OPENROUTER_API_KEY missing)' },
        { status: 503 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Validation', message: 'Body must be valid JSON' },
        { status: 400 }
      );
    }
    const content =
      typeof body === 'object' && body !== null && 'content' in body
        ? (body as { content: unknown }).content
        : null;
    if (typeof content !== 'string') {
      return NextResponse.json(
        { error: 'Validation', message: 'content must be a string' },
        { status: 400 }
      );
    }
    const trimmed = content.trim();
    if (!trimmed) {
      return NextResponse.json(
        { error: 'Validation', message: 'content must not be empty' },
        { status: 400 }
      );
    }
    if (trimmed.length > MAX_CONTENT_LENGTH) {
      return NextResponse.json(
        { error: 'Validation', message: `content exceeds ${MAX_CONTENT_LENGTH} characters` },
        { status: 400 }
      );
    }

    // 1) Persist the user message — gives every subsequent GET a stable view.
    db.insert(workspaceChatMessages)
      .values({
        workspaceId: wsId,
        userId: auth.user.userId,
        role: 'user',
        content: trimmed,
      })
      .run();

    // 2) Build LLM history (chronological).
    const recent = db
      .select({
        role: workspaceChatMessages.role,
        content: workspaceChatMessages.content,
      })
      .from(workspaceChatMessages)
      .where(eq(workspaceChatMessages.workspaceId, wsId))
      .orderBy(desc(workspaceChatMessages.createdAt), desc(workspaceChatMessages.id))
      .limit(HISTORY_FOR_CONTEXT)
      .all()
      .reverse();

    // Drop the message we just inserted (it will be supplied as `userMessage`).
    const history = recent
      .slice(0, Math.max(0, recent.length - 1))
      .filter((m): m is { role: 'user' | 'assistant'; content: string } => {
        return m.role === 'user' || m.role === 'assistant';
      });

    // 3) Decide whether we'll generate canvas commands after the text stream.
    const wantsCommands = looksLikeBoardIntent(trimmed);
    const userId = auth.user.userId;

    // 4) Stream the assistant response and persist on close.
    const aiStream = streamCompletion(SYSTEM_PROMPT, trimmed, history, {
      maxTokens: 2048,
      temperature: 0.5,
    });

    const encoder = new TextEncoder();
    let assembled = '';

    const responseStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (frame: Record<string, unknown>): void => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
        };

        const reader = aiStream.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            assembled += value;
            send({ type: 'chunk', text: value });
          }

          // 5) After the text reply, optionally produce structured commands.
          let commands: WorkspaceOp[] | null = null;
          if (wantsCommands) {
            try {
              const snap = getSnapshot(wsId);
              const baseVersion = snap?.version ?? 0;
              const state = snap?.payload
                ? fromSnapshot(safeParseSnapshot(snap.payload))
                : { elements: {} };
              const elements = Object.values(state.elements);
              const result = await generateElementCommands({
                instruction: trimmed,
                currentElements: elements,
                userId,
                baseVersion,
              });
              if (result.commands.length > 0) {
                commands = result.commands;
                send({ type: 'commands', commands });
              }
            } catch (err) {
              console.warn('[workspaces/[id]/chat] commands generation failed:', err);
              const message =
                err instanceof AIError ? err.message : err instanceof Error ? err.message : 'commands failed';
              send({ type: 'commands_error', message });
            }
          }

          // 6) Persist assistant turn (text + commands JSON in attachments).
          if (assembled.trim() || commands) {
            try {
              db.insert(workspaceChatMessages)
                .values({
                  workspaceId: wsId,
                  userId,
                  role: 'assistant',
                  content: assembled,
                  attachments: commands ? JSON.stringify({ commands }) : null,
                })
                .run();
            } catch (saveErr) {
              console.error('[workspaces/[id]/chat] persist assistant failed:', saveErr);
            }
          }

          send({ type: 'done' });
          controller.close();
        } catch (err) {
          console.error('[workspaces/[id]/chat] stream error:', err);
          // Persist whatever we have so the user can re-read it.
          if (assembled.trim()) {
            try {
              db.insert(workspaceChatMessages)
                .values({
                  workspaceId: wsId,
                  userId,
                  role: 'assistant',
                  content: assembled + '\n\n*[Ответ прерван из-за ошибки]*',
                })
                .run();
            } catch {
              // best-effort
            }
          }
          const message =
            err instanceof AIError
              ? err.message
              : err instanceof Error
                ? err.message
                : 'AI stream failed';
          try {
            send({ type: 'error', message });
          } catch {
            // controller already closed
          }
          controller.close();
        }
      },
    });

    return new Response(responseStream, {
      status: 200,
      headers: {
        // SSE-shaped frames; clients that don't use EventSource still
        // get newline-delimited JSON they can parse.
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store, no-transform',
        'X-Accel-Buffering': 'no',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('[workspaces/[id]/chat] POST error:', error);
    const message = error instanceof Error ? error.message : 'Failed to chat';
    return NextResponse.json({ error: 'Internal', message }, { status: 500 });
  }
}

/** Tolerant JSON.parse for a stored snapshot payload. */
function safeParseSnapshot(raw: string): WorkspaceSnapshot | null {
  try {
    return JSON.parse(raw) as WorkspaceSnapshot;
  } catch {
    return null;
  }
}
