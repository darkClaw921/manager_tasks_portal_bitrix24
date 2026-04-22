'use client';

/**
 * Meeting → Workspaces sidebar panel.
 *
 * Lists boards attached to the current meeting (via `workspaces.meetingId`)
 * and provides:
 *   - Open in new tab → opens `/workspaces/<id>` so the meeting view stays
 *     intact (people are usually on a call when they need a board).
 *   - "+ Новая доска" → POST `/api/meetings/<id>/workspaces` (creates a
 *     workspace already attached) and immediately opens it in a new tab.
 *
 * The panel re-fetches whenever the meeting or activity counter changes;
 * we keep the implementation simple (no TanStack Query) because the
 * list is small and rarely mutated.
 */

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { Workspace } from '@/types/workspace';
import { Button } from '@/components/ui/Button';

export interface MeetingWorkspacesPanelProps {
  meetingId: number;
  /** Whether the panel is currently visible — drives reload-on-show. */
  isActive: boolean;
}

interface ListResponse {
  data?: Workspace[];
  message?: string;
}

interface CreateResponse {
  data?: Workspace;
  message?: string;
}

export function MeetingWorkspacesPanel({
  meetingId,
  isActive,
}: MeetingWorkspacesPanelProps) {
  const [items, setItems] = useState<Workspace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/workspaces`, {
        credentials: 'include',
      });
      const json = (await res.json().catch(() => null)) as ListResponse | null;
      if (!res.ok || !Array.isArray(json?.data)) {
        const msg = json?.message || `Ошибка ${res.status}`;
        throw new Error(msg);
      }
      setItems(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить доски');
    } finally {
      setIsLoading(false);
    }
  }, [meetingId]);

  // Initial load + reload when the tab becomes active.
  useEffect(() => {
    if (!isActive) return;
    void reload();
  }, [isActive, reload]);

  const onSubmitCreate = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const trimmed = title.trim();
      if (!trimmed || creating) return;
      setCreating(true);
      try {
        const res = await fetch(`/api/meetings/${meetingId}/workspaces`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: trimmed }),
        });
        const json = (await res.json().catch(() => null)) as CreateResponse | null;
        if (!res.ok || !json?.data) {
          const msg = json?.message || `Ошибка ${res.status}`;
          throw new Error(msg);
        }
        // Optimistic insert + open the new board in a tab.
        setItems((prev) => [json.data!, ...prev]);
        setShowCreate(false);
        setTitle('');
        if (typeof window !== 'undefined') {
          window.open(`/workspaces/${json.data.id}`, '_blank');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Не удалось создать доску');
      } finally {
        setCreating(false);
      }
    },
    [meetingId, title, creating]
  );

  return (
    <div className="flex h-full min-h-0 flex-col rounded-card bg-surface shadow-card border border-border overflow-hidden">
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-small font-semibold">Доски</span>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="text-xs text-primary hover:underline"
        >
          {showCreate ? 'Скрыть' : '+ Новая доска'}
        </button>
      </header>

      {showCreate && (
        <form
          onSubmit={onSubmitCreate}
          className="border-b border-border bg-background p-2 space-y-2"
        >
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Название доски"
            disabled={creating}
            maxLength={200}
            className="w-full rounded-input border border-border bg-surface px-2 py-1.5 text-small focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setShowCreate(false);
                setTitle('');
              }}
              disabled={creating}
            >
              Отмена
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={creating || title.trim().length === 0}
            >
              {creating ? '…' : 'Создать'}
            </Button>
          </div>
        </form>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
        {isLoading && (
          <div className="text-small text-text-secondary px-2 py-1">Загрузка…</div>
        )}
        {!isLoading && error && (
          <div className="text-small text-danger bg-red-50 rounded px-2 py-1">
            {error}
          </div>
        )}
        {!isLoading && !error && items.length === 0 && (
          <div className="text-small text-text-secondary px-2 py-1">
            К этой встрече ещё не привязано ни одной доски.
          </div>
        )}
        {items.map((ws) => (
          <a
            key={ws.id}
            href={`/workspaces/${ws.id}`}
            target="_blank"
            rel="noopener"
            className="block rounded-card border border-border bg-background px-3 py-2 hover:border-primary hover:bg-primary/5 transition"
          >
            <div className="text-small font-medium text-foreground truncate">
              {ws.title}
            </div>
            <div className="text-xs text-text-secondary mt-0.5">
              Создана: {new Date(ws.createdAt).toLocaleDateString('ru-RU')}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
