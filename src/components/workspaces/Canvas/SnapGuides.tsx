'use client';

/**
 * Transparent overlay that draws snap-alignment guide lines while a drag is
 * in progress.
 *
 * Decoupled from `SelectionLayer` via a tiny module-local subscriber so the
 * pointer-event-handling layer doesn't have to thread `setState` through every
 * pointer move (avoids React reconciliation per drag tick).
 *
 * Usage:
 *   - Render `<SnapGuides />` alongside `SelectionLayer` inside `WorkspaceCanvas`.
 *   - Drag handlers call `publishGuides([...])` on each move and
 *     `publishGuides([])` on pointer-up to clear.
 */

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { worldToScreen } from './WorkspaceCanvas';
import type { Guide } from '@/lib/workspaces/snapping';

// ==================== Pub/sub for guides ====================
//
// We avoid React state churn by keeping the guides in a module-local store
// and subscribing the renderer once. Drag handlers call `publishGuides` at
// pointer-event frequency (~60 Hz) without ever touching React.

type Listener = (guides: Guide[]) => void;
let currentGuides: Guide[] = [];
const listeners = new Set<Listener>();

export function publishGuides(guides: Guide[]) {
  // Reference-skip when nothing changed (saves a render tick on idle frames).
  if (guides.length === 0 && currentGuides.length === 0) return;
  currentGuides = guides;
  for (const l of listeners) l(guides);
}

function subscribeGuides(listener: Listener): () => void {
  listeners.add(listener);
  // Push current state to the new subscriber so it's not stuck on stale.
  listener(currentGuides);
  return () => {
    listeners.delete(listener);
  };
}

// ==================== Component ====================

export interface SnapGuidesProps {
  className?: string;
  style?: CSSProperties;
}

export function SnapGuides({ className, style }: SnapGuidesProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const viewport = useWorkspaceStore((s) => s.viewport);
  const [guides, setGuides] = useState<Guide[]>([]);

  useEffect(() => subscribeGuides(setGuides), []);

  if (guides.length === 0) {
    return null;
  }

  return (
    <div
      ref={wrapperRef}
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        ...style,
      }}
    >
      <svg
        width="100%"
        height="100%"
        style={{ position: 'absolute', inset: 0, overflow: 'visible' }}
      >
        {guides.map((g, idx) => {
          if (g.axis === 'v') {
            // Vertical line at world `g.pos`, spanning `g.start..g.end` in y.
            const top = worldToScreen({ x: g.pos, y: g.start }, viewport);
            const bottom = worldToScreen({ x: g.pos, y: g.end }, viewport);
            return (
              <line
                key={`v-${idx}-${g.pos}`}
                x1={top.x}
                y1={top.y - 8}
                x2={bottom.x}
                y2={bottom.y + 8}
                stroke="#ec4899"
                strokeWidth={1}
                strokeDasharray="4 3"
                opacity={0.85}
              />
            );
          }
          // Horizontal: constant `y`, spanning `start..end` on x.
          const left = worldToScreen({ x: g.start, y: g.pos }, viewport);
          const right = worldToScreen({ x: g.end, y: g.pos }, viewport);
          return (
            <line
              key={`h-${idx}-${g.pos}`}
              x1={left.x - 8}
              y1={left.y}
              x2={right.x + 8}
              y2={right.y}
              stroke="#ec4899"
              strokeWidth={1}
              strokeDasharray="4 3"
              opacity={0.85}
            />
          );
        })}
      </svg>
    </div>
  );
}
