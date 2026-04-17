'use client';

/**
 * Comments panel for the workspace sidebar.
 *
 * Two display modes:
 *   1. `elementId` provided → show the thread for that element + a textarea
 *      to add a new comment.
 *   2. `elementId` null → show recent activity across the whole workspace
 *      with a hint to select an element to start a thread.
 *
 * No realtime — comments are loaded on demand and refetched after a write.
 * For Phase 3 polish this is fine; in a future revision we could broadcast
 * comment events on the LiveKit data channel.
 */

import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface CommentRow {
  id: number;
  workspaceId: number;
  elementId: string;
  userId: number;
  authorName: string;
  authorEmail: string;
  content: string;
  resolved: number;
  createdAt: string;
  updatedAt: string;
}

export interface CommentsPanelProps {
  workspaceId: number;
  elementId: string | null;
  currentUserId: number;
  className?: string;
}

export function CommentsPanel({ workspaceId, elementId, currentUserId, className }: CommentsPanelProps) {
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [showResolved, setShowResolved] = useState(false);

  const refetch = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const url = elementId
        ? `/api/workspaces/${workspaceId}/comments?elementId=${encodeURIComponent(elementId)}`
        : `/api/workspaces/${workspaceId}/comments`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data: { comments: CommentRow[] } };
      setComments(json.data.comments);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить комментарии');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, elementId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const submit = useCallback(async () => {
    if (!elementId) return;
    const text = draft.trim();
    if (text.length === 0) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ elementId, content: text }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDraft('');
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отправить');
    } finally {
      setPosting(false);
    }
  }, [draft, elementId, workspaceId, refetch]);

  const toggleResolved = useCallback(
    async (commentId: number, next: boolean) => {
      try {
        await fetch(`/api/workspaces/${workspaceId}/comments/${commentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resolved: next }),
        });
        await refetch();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Не удалось обновить');
      }
    },
    [workspaceId, refetch]
  );

  const remove = useCallback(
    async (commentId: number) => {
      try {
        await fetch(`/api/workspaces/${workspaceId}/comments/${commentId}`, {
          method: 'DELETE',
        });
        await refetch();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Не удалось удалить');
      }
    },
    [workspaceId, refetch]
  );

  const visible = comments.filter((c) => showResolved || c.resolved === 0);

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      <div className="border-b border-border p-2 flex items-center justify-between">
        <div className="text-xs text-text-secondary">
          {elementId ? (
            <>
              Тред элемента
              <span className="ml-1 font-mono text-[10px]">{elementId.slice(0, 8)}</span>
            </>
          ) : (
            'Выберите элемент, чтобы открыть тред'
          )}
        </div>
        <label className="text-xs text-text-secondary flex items-center gap-1">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
          />
          Решённые
        </label>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
        {loading && <div className="text-xs text-text-secondary">Загрузка…</div>}
        {error && <div className="text-xs text-danger">{error}</div>}
        {!loading && visible.length === 0 && (
          <div className="text-xs text-text-secondary">Пока нет комментариев</div>
        )}
        {visible.map((c) => (
          <div
            key={c.id}
            className={cn(
              'rounded-input border border-border p-2 text-xs',
              c.resolved ? 'opacity-60 bg-background' : 'bg-surface'
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold text-foreground">{c.authorName}</div>
              <div className="text-[10px] text-text-secondary">{new Date(c.createdAt).toLocaleString()}</div>
            </div>
            {!elementId && (
              <div className="text-[10px] text-text-secondary font-mono">элемент {c.elementId.slice(0, 8)}</div>
            )}
            <div className="mt-1 whitespace-pre-wrap text-foreground">{c.content}</div>
            <div className="mt-1 flex items-center gap-2">
              <button
                type="button"
                onClick={() => toggleResolved(c.id, c.resolved === 0)}
                className="text-[11px] underline text-text-secondary hover:text-foreground"
              >
                {c.resolved ? 'Вернуть' : 'Решить'}
              </button>
              {c.userId === currentUserId && (
                <button
                  type="button"
                  onClick={() => remove(c.id)}
                  className="text-[11px] underline text-danger hover:opacity-80"
                >
                  Удалить
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {elementId && (
        <div className="border-t border-border p-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Написать комментарий..."
            rows={2}
            disabled={posting}
            className="w-full rounded-input border border-border bg-background px-2 py-1.5 text-small focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
          />
          <div className="mt-1 flex justify-end">
            <button
              type="button"
              onClick={submit}
              disabled={posting || draft.trim().length === 0}
              className="px-3 py-1 text-small bg-primary text-text-inverse rounded-input disabled:opacity-60"
            >
              {posting ? 'Отправка…' : 'Отправить'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
