'use client';

/**
 * Workspace LLM chat hook.
 *
 * Bridges the cursor-paginated GET history endpoint with the streaming POST
 * endpoint. The streaming response (SSE-shaped, `text/event-stream`) is
 * parsed line-by-line; each `data: {…}` frame is a typed event:
 *
 *   { type: 'chunk',          text:    string }     -- assistant text delta
 *   { type: 'commands',       commands: WorkspaceOp[] }  -- optional, after text
 *   { type: 'commands_error', message: string }
 *   { type: 'done' }
 *   { type: 'error',          message: string }
 *
 * On stream end we refetch the history once so the assistant message we
 * built optimistically is replaced by the canonical persisted row (id +
 * createdAt come from the server, attachments JSON is parsed into
 * `commands`).
 *
 * The optimistic assistant bubble carries `commands` directly so the
 * "Применить" button shows up the instant the LLM emits the structured
 * payload — without waiting for the GET refetch to round-trip.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorkspaceChatMessage, WorkspaceOp } from '@/types/workspace';

const PAGE_SIZE = 50;

export interface UseWorkspaceChatOptions {
  workspaceId: number;
}

/**
 * Local extension of the persisted message shape — `commands` is parsed
 * out of `attachments` (or carried inline during streaming) and
 * `commandsApplied` is a per-session UI flag tracked in memory.
 */
export interface ChatMessage extends WorkspaceChatMessage {
  /** Workspace ops the assistant suggested. Empty/undefined when none. */
  commands?: WorkspaceOp[];
  /** Local UI flag: user has clicked "Применить" — hide the buttons. */
  commandsApplied?: boolean;
  /** Local UI flag: user dismissed the suggestion — hide the buttons. */
  commandsRejected?: boolean;
}

export interface UseWorkspaceChatResult {
  messages: ChatMessage[];
  isLoadingInitial: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  /** True while we're streaming an assistant reply. */
  isStreaming: boolean;
  /** Last error from any operation (cleared on next success). */
  error: string | null;
  loadEarlier: () => Promise<void>;
  /** Send a user message; streams the assistant reply into `messages`. */
  sendMessage: (content: string) => Promise<void>;
  /** Force a refetch of the latest page (used after stream completes). */
  refresh: () => Promise<void>;
  /** Mark the suggestion as applied — hides Apply/Reject buttons. */
  markCommandsApplied: (messageId: number) => void;
  /** Mark the suggestion as rejected. */
  markCommandsRejected: (messageId: number) => void;
}

interface FetchPageResponse {
  items: WorkspaceChatMessage[];
  nextBefore: string | null;
}

async function fetchPage(
  workspaceId: number,
  before?: string
): Promise<FetchPageResponse> {
  const url = before
    ? `/api/workspaces/${workspaceId}/chat?limit=${PAGE_SIZE}&before=${encodeURIComponent(before)}`
    : `/api/workspaces/${workspaceId}/chat?limit=${PAGE_SIZE}`;
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GET chat failed: ${res.status} ${text}`);
  }
  return (await res.json()) as FetchPageResponse;
}

/** Parse a stored `attachments` JSON column into commands, tolerating bad input. */
function parseAttachments(raw: string | null | undefined): WorkspaceOp[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as { commands?: unknown };
    if (Array.isArray(parsed?.commands)) {
      return parsed.commands as WorkspaceOp[];
    }
  } catch {
    // ignore — corrupt attachments shouldn't break the chat list
  }
  return undefined;
}

function hydrate(messages: WorkspaceChatMessage[]): ChatMessage[] {
  return messages.map((m) => {
    const commands = parseAttachments(m.attachments ?? undefined);
    return commands ? { ...m, commands } : (m as ChatMessage);
  });
}

function mergeUnique(
  existing: ChatMessage[],
  incoming: ChatMessage[]
): ChatMessage[] {
  if (incoming.length === 0) return existing;
  const byId = new Map<number, ChatMessage>();
  for (const m of existing) byId.set(m.id, m);
  for (const m of incoming) {
    const prev = byId.get(m.id);
    if (prev) {
      // Preserve local UI flags from the optimistic copy.
      byId.set(m.id, {
        ...m,
        commandsApplied: prev.commandsApplied ?? m.commandsApplied,
        commandsRejected: prev.commandsRejected ?? m.commandsRejected,
        commands: m.commands ?? prev.commands,
      });
    } else {
      byId.set(m.id, m);
    }
  }
  const merged = Array.from(byId.values());
  merged.sort((a, b) => {
    if (a.createdAt === b.createdAt) return a.id - b.id;
    return a.createdAt < b.createdAt ? -1 : 1;
  });
  return merged;
}

export function useWorkspaceChat({
  workspaceId,
}: UseWorkspaceChatOptions): UseWorkspaceChatResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoadingInitial, setLoadingInitial] = useState(true);
  const [isLoadingMore, setLoadingMore] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const beforeRef = useRef<string | null>(null);
  const scopeRef = useRef<number>(workspaceId);
  /**
   * Optimistic ids used for the in-flight user/assistant messages while we
   * wait for the server to assign real ones. Negative numbers so they never
   * collide with auto-increment row ids.
   */
  const nextOptimisticIdRef = useRef(-1);

  // Reset on workspace change.
  useEffect(() => {
    scopeRef.current = workspaceId;
    setMessages([]);
    setHasMore(false);
    setError(null);
    setLoadingInitial(true);
    beforeRef.current = null;
  }, [workspaceId]);

  // Initial page load.
  useEffect(() => {
    const scope = workspaceId;
    let cancelled = false;
    (async () => {
      try {
        const page = await fetchPage(scope);
        if (cancelled || scopeRef.current !== scope) return;
        const chrono = hydrate([...page.items].reverse());
        setMessages(chrono);
        beforeRef.current = page.nextBefore;
        setHasMore(page.nextBefore !== null);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load chat');
      } finally {
        if (!cancelled && scopeRef.current === scope) {
          setLoadingInitial(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const loadEarlier = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    const cursor = beforeRef.current;
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await fetchPage(workspaceId, cursor);
      const chrono = hydrate([...page.items].reverse());
      setMessages((prev) => mergeUnique(prev, chrono));
      beforeRef.current = page.nextBefore;
      setHasMore(page.nextBefore !== null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load earlier');
    } finally {
      setLoadingMore(false);
    }
  }, [workspaceId, hasMore, isLoadingMore]);

  const refresh = useCallback(async () => {
    const scope = scopeRef.current;
    try {
      const page = await fetchPage(scope);
      if (scopeRef.current !== scope) return;
      // Drop any optimistic rows (id < 0) and merge with the canonical page.
      setMessages((prev) => {
        const real = prev.filter((m) => m.id > 0);
        return mergeUnique(real, hydrate([...page.items].reverse()));
      });
      beforeRef.current = page.nextBefore;
      setHasMore(page.nextBefore !== null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh');
    }
  }, []);

  const sendMessage = useCallback<UseWorkspaceChatResult['sendMessage']>(
    async (content) => {
      const trimmed = content.trim();
      if (!trimmed) return;
      const scope = scopeRef.current;

      // Optimistic user bubble.
      const userId = nextOptimisticIdRef.current--;
      const assistantId = nextOptimisticIdRef.current--;
      const nowIso = new Date().toISOString();
      setMessages((prev) =>
        mergeUnique(prev, [
          {
            id: userId,
            workspaceId: scope,
            userId: 0,
            role: 'user',
            content: trimmed,
            attachments: null,
            createdAt: nowIso,
          },
          {
            id: assistantId,
            workspaceId: scope,
            userId: 0,
            role: 'assistant',
            content: '',
            attachments: null,
            createdAt: nowIso,
          },
        ])
      );

      setIsStreaming(true);
      let assembled = '';
      try {
        const res = await fetch(`/api/workspaces/${scope}/chat`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: trimmed }),
        });
        if (!res.ok || !res.body) {
          const text = await res.text().catch(() => '');
          throw new Error(`POST chat failed: ${res.status} ${text}`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          // Parse SSE-style frames: each frame ends with a blank line.
          let frameEnd = buffer.indexOf('\n\n');
          while (frameEnd >= 0) {
            const frame = buffer.slice(0, frameEnd);
            buffer = buffer.slice(frameEnd + 2);
            handleFrame(frame, assistantId, (delta) => {
              assembled += delta;
            });
            frameEnd = buffer.indexOf('\n\n');
          }
        }
        // Flush any trailing partial frame.
        if (buffer.trim().length > 0) {
          handleFrame(buffer, assistantId, (delta) => {
            assembled += delta;
          });
        }
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Stream failed');
      } finally {
        setIsStreaming(false);
        // Replace optimistic rows with the canonical persisted ones.
        await refresh();
      }

      // Inner helper — closes over `setMessages` so we can update the
      // optimistic assistant bubble in place.
      function handleFrame(
        frame: string,
        targetId: number,
        onTextDelta: (text: string) => void
      ): void {
        // Each frame may contain multiple `data: ` lines (per SSE spec we
        // would join with `\n`, but we always emit single-line JSON here).
        const lines = frame.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const json = line.slice(5).trim();
          if (!json) continue;
          let evt: { type?: string; text?: string; commands?: unknown; message?: string };
          try {
            evt = JSON.parse(json);
          } catch {
            continue;
          }
          if (evt.type === 'chunk' && typeof evt.text === 'string') {
            onTextDelta(evt.text);
            const snapshot = assembled + evt.text;
            setMessages((prev) =>
              prev.map((m) => (m.id === targetId ? { ...m, content: snapshot } : m))
            );
          } else if (evt.type === 'commands' && Array.isArray(evt.commands)) {
            const commands = evt.commands as WorkspaceOp[];
            setMessages((prev) =>
              prev.map((m) => (m.id === targetId ? { ...m, commands } : m))
            );
          } else if (evt.type === 'commands_error' && typeof evt.message === 'string') {
            setError(`Не удалось сгенерировать команды для доски: ${evt.message}`);
          } else if (evt.type === 'error' && typeof evt.message === 'string') {
            setError(evt.message);
          }
          // 'done' has no payload — we just let the stream close.
        }
      }
    },
    [refresh]
  );

  const markCommandsApplied = useCallback((messageId: number) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, commandsApplied: true } : m))
    );
  }, []);

  const markCommandsRejected = useCallback((messageId: number) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, commandsRejected: true } : m))
    );
  }, []);

  return {
    messages,
    isLoadingInitial,
    isLoadingMore,
    hasMore,
    isStreaming,
    error,
    loadEarlier,
    sendMessage,
    refresh,
    markCommandsApplied,
    markCommandsRejected,
  };
}
