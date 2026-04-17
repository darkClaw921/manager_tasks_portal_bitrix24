'use client';

/**
 * Tiny dot overlay that shows which canvas elements have unresolved comments.
 *
 * Polls `/api/workspaces/[id]/comments?mode=counts` every ~30 s. Renders an
 * absolutely-positioned small dot above each element's top-right corner with
 * the comment count. Click forwards to `onSelect(elementId)`.
 *
 * Lightweight — no realtime; refresh on demand via `refreshKey`.
 */

import { useCallback, useEffect, useState } from 'react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { worldToScreen } from '@/components/workspaces/Canvas/WorkspaceCanvas';

const REFRESH_INTERVAL_MS = 30_000;

export interface CommentIndicatorsProps {
  workspaceId: number;
  /** When the user clicks the badge, the parent typically opens the comments tab. */
  onSelect?: (elementId: string) => void;
  /** Bump to force an immediate refresh after a write. */
  refreshKey?: number;
}

export function CommentIndicators({ workspaceId, onSelect, refreshKey = 0 }: CommentIndicatorsProps) {
  const elements = useWorkspaceStore((s) => s.elements);
  const viewport = useWorkspaceStore((s) => s.viewport);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/comments?mode=counts`);
      if (!res.ok) return;
      const json = (await res.json()) as { data: { counts: Record<string, number> } };
      setCounts(json.data.counts ?? {});
    } catch {
      // Comments are optional — silently skip on network errors.
    }
  }, [workspaceId]);

  useEffect(() => {
    void refresh();
    const id = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh, refreshKey]);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 5,
      }}
    >
      {Object.entries(counts).map(([id, count]) => {
        const el = elements[id];
        if (!el || count === 0) return null;
        const tl = worldToScreen({ x: el.x + el.w, y: el.y }, viewport);
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect?.(id)}
            style={{
              position: 'absolute',
              left: tl.x - 10,
              top: tl.y - 10,
              minWidth: 20,
              height: 20,
              padding: '0 4px',
              borderRadius: 10,
              background: '#3b82f6',
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
              border: '1px solid #fff',
              boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
              cursor: 'pointer',
              pointerEvents: 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title={`${count} комментариев`}
          >
            {count}
          </button>
        );
      })}
    </div>
  );
}
