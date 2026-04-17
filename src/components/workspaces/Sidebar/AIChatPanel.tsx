'use client';

/**
 * Streaming AI chat panel for the workspace sidebar.
 *
 * Phase 2 scope: in addition to the streaming text reply, the assistant
 * can attach a structured `commands` block (Workspace ops). When present,
 * the message renders an "Применить" / "Отклонить" affordance below the
 * bubble. Clicking Применить calls `onApplyCommands(commands)` which is
 * wired by `WorkspaceRoom` to the live `commitOp` from `useWorkspaceOps`.
 *
 * The applied/rejected flags are local-only (per session) — re-opening
 * the workspace shows the buttons again. Cross-session persistence
 * would require a PATCH endpoint and is intentionally out of scope.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { useWorkspaceChat, type ChatMessage } from '@/hooks/useWorkspaceChat';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import type { WorkspaceOp } from '@/types/workspace';

const NEAR_BOTTOM_PX = 80;

export interface AIChatPanelProps {
  workspaceId: number;
  /**
   * Apply a batch of canvas commands. Called when the user clicks
   * "Применить" on an assistant message that emitted a `commands` block.
   * The wiring lives in `WorkspaceRoom` so we don't have to know about
   * the LiveKit room or the Zustand store here.
   */
  onApplyCommands?: (commands: WorkspaceOp[]) => void;
}

/** Compact human description of a commands block, e.g. "3 элемента: rect, text". */
function describeCommands(commands: WorkspaceOp[]): string {
  if (commands.length === 0) return 'Нет элементов';
  const kinds: string[] = [];
  for (const op of commands) {
    if (op.type === 'add' && op.el?.kind) kinds.push(op.el.kind);
  }
  const seen: Record<string, number> = {};
  for (const k of kinds) seen[k] = (seen[k] ?? 0) + 1;
  const summary = Object.entries(seen)
    .map(([k, n]) => (n > 1 ? `${k} ×${n}` : k))
    .join(', ');
  return `${commands.length} элемент${commands.length === 1 ? '' : commands.length < 5 ? 'а' : 'ов'}${summary ? `: ${summary}` : ''}`;
}

export function AIChatPanel({ workspaceId, onApplyCommands }: AIChatPanelProps) {
  const chat = useWorkspaceChat({ workspaceId });
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const atBottomRef = useRef(true);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  }, []);

  useEffect(() => {
    if (!atBottomRef.current) return;
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, [chat.messages]);

  const onSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const text = draft.trim();
      if (!text || chat.isStreaming) return;
      setDraft('');
      atBottomRef.current = true;
      try {
        await chat.sendMessage(text);
      } catch {
        // already surfaced via chat.error
      }
    },
    [draft, chat]
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const form = (e.target as HTMLTextAreaElement).form;
        if (form) form.requestSubmit();
      }
    },
    []
  );

  const onLoadEarlier = useCallback(async () => {
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    const prevTop = el?.scrollTop ?? 0;
    await chat.loadEarlier();
    requestAnimationFrame(() => {
      const el2 = scrollRef.current;
      if (!el2) return;
      const delta = el2.scrollHeight - prevHeight;
      el2.scrollTop = prevTop + delta;
    });
  }, [chat]);

  const onApply = useCallback(
    (m: ChatMessage) => {
      if (!m.commands || m.commands.length === 0) return;
      if (!onApplyCommands) return;
      try {
        onApplyCommands(m.commands);
        chat.markCommandsApplied(m.id);
      } catch (err) {
        console.error('[AIChatPanel] apply failed:', err);
      }
    },
    [onApplyCommands, chat]
  );

  const onReject = useCallback(
    (m: ChatMessage) => {
      chat.markCommandsRejected(m.id);
    },
    [chat]
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-small font-semibold text-foreground">AI Чат</span>
      </div>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2"
      >
        {chat.hasMore && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={onLoadEarlier}
              disabled={chat.isLoadingMore}
              className="rounded border border-border bg-background px-3 py-1 text-small text-text-secondary hover:bg-surface disabled:opacity-60"
            >
              {chat.isLoadingMore ? 'Загрузка…' : 'Показать раньше'}
            </button>
          </div>
        )}
        {chat.isLoadingInitial && (
          <div className="text-small text-text-secondary">Загрузка истории…</div>
        )}
        {!chat.isLoadingInitial && chat.messages.length === 0 && (
          <div className="text-small text-text-secondary">
            Пока пусто. Задайте вопрос — AI поможет с идеями для доски.
          </div>
        )}
        {chat.messages.map((m) => {
          const isUser = m.role === 'user';
          const hasCommands = !isUser && Array.isArray(m.commands) && m.commands.length > 0;
          return (
            <div
              key={m.id}
              className={cn('flex w-full flex-col', isUser ? 'items-end' : 'items-start')}
            >
              <div
                className={cn(
                  'max-w-[85%] rounded-card px-3 py-2 text-small whitespace-pre-wrap break-words',
                  isUser
                    ? 'bg-primary text-text-inverse'
                    : 'bg-background text-foreground border border-border'
                )}
              >
                {m.content}
                {!isUser && chat.isStreaming && m.id < 0 && m.content.length === 0 && (
                  <span className="inline-block animate-pulse">…</span>
                )}
              </div>
              {hasCommands && (
                <div className="mt-1 max-w-[85%] rounded-card border border-primary/40 bg-primary/5 px-3 py-2 text-small">
                  <div className="text-text-secondary mb-1">
                    AI предлагает добавить на доску: {describeCommands(m.commands!)}
                  </div>
                  {m.commandsApplied ? (
                    <span className="inline-block rounded bg-success/10 px-2 py-0.5 text-xs text-success">
                      Применено
                    </span>
                  ) : m.commandsRejected ? (
                    <span className="inline-block rounded bg-surface px-2 py-0.5 text-xs text-text-secondary">
                      Отклонено
                    </span>
                  ) : (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={() => onApply(m)}
                        disabled={!onApplyCommands}
                        title={
                          onApplyCommands
                            ? undefined
                            : 'Доска ещё не подключена'
                        }
                      >
                        Применить
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => onReject(m)}
                      >
                        Отклонить
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {chat.error && (
          <div className="rounded-card bg-red-50 px-3 py-2 text-small text-danger">
            {chat.error}
          </div>
        )}
      </div>
      <form
        onSubmit={onSubmit}
        className="flex items-end gap-2 border-t border-border p-2 bg-surface"
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder="Спросите AI…"
          className="flex-1 resize-none rounded-input border border-border bg-background px-2 py-1.5 text-small text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          disabled={chat.isStreaming}
          maxLength={4000}
        />
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={chat.isStreaming || draft.trim().length === 0}
        >
          {chat.isStreaming ? '…' : 'Отправить'}
        </Button>
      </form>
    </div>
  );
}
