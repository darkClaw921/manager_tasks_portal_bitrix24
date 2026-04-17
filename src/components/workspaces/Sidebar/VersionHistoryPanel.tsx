'use client';

/**
 * Version history sidebar tab.
 *
 * Shows the list of past snapshots (newest first), with metadata and a
 * one-click "Restore" button for the workspace owner. Restore POSTs to
 * `/api/workspaces/[id]/history/[historyId]` which copies the historic
 * payload back into the live snapshot.
 *
 * After a successful restore the page reloads — the simplest reliable way
 * to make every connected client re-fetch the snapshot. (The websocket-
 * based catch-up flow already exists for op deltas; for a forced restore
 * we don't have a notification topic, so a hard refresh is the safe play.)
 */

import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface HistoryRow {
  id: number;
  version: number;
  createdAt: string;
  createdBy: number | null;
  authorName: string;
}

export interface VersionHistoryPanelProps {
  workspaceId: number;
  isOwner: boolean;
  className?: string;
}

export function VersionHistoryPanel({ workspaceId, isOwner, className }: VersionHistoryPanelProps) {
  const [items, setItems] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<number | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/history`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data: { history: HistoryRow[] } };
      setItems(json.data.history);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить историю');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const restore = useCallback(
    async (id: number) => {
      if (!confirm('Восстановить эту версию? Текущее состояние будет перезаписано (другие участники должны перезагрузить страницу).')) {
        return;
      }
      setRestoring(id);
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/history/${id}`, {
          method: 'POST',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        // Hard reload — simplest reliable way to re-bootstrap the canvas
        // from the new snapshot.
        window.location.reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Восстановление не удалось');
      } finally {
        setRestoring(null);
      }
    },
    [workspaceId]
  );

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      <div className="border-b border-border p-2 flex items-center justify-between">
        <div className="text-xs text-text-secondary">История снапшотов</div>
        <button
          type="button"
          onClick={refetch}
          disabled={loading}
          className="text-[11px] underline text-text-secondary hover:text-foreground"
        >
          Обновить
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
        {loading && <div className="text-xs text-text-secondary">Загрузка…</div>}
        {error && <div className="text-xs text-danger">{error}</div>}
        {!loading && items.length === 0 && (
          <div className="text-xs text-text-secondary">История пуста — снапшоты появятся после первого автосохранения</div>
        )}
        {items.map((row) => (
          <div key={row.id} className="rounded-input border border-border p-2 text-xs bg-surface">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold text-foreground">v{row.version}</div>
              <div className="text-[10px] text-text-secondary">{new Date(row.createdAt).toLocaleString()}</div>
            </div>
            <div className="text-[11px] text-text-secondary mt-0.5">{row.authorName}</div>
            {isOwner && (
              <div className="mt-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => restore(row.id)}
                  disabled={restoring !== null}
                  className="text-[11px] px-2 py-0.5 rounded-input bg-warning/15 text-warning hover:bg-warning/25 disabled:opacity-60"
                >
                  {restoring === row.id ? 'Восстанавливаем…' : 'Восстановить'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
