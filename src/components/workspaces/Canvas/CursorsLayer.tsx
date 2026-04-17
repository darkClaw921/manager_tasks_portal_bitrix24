'use client';

/**
 * Remote cursors overlay.
 *
 * Reads `workspaceStore.presence` and renders one absolutely-positioned
 * SVG arrow + name label per remote participant. We deliberately use DOM
 * (instead of compositing into the main canvas) so the cursor labels can
 * pick up CSS — easy to swap to Tailwind text styles later.
 *
 * Smooth interpolation:
 *   The presence map is updated at ~20 Hz which can look jerky on a 60+ Hz
 *   display. We lerp from the rendered position toward the latest target
 *   each animation frame (lerp factor ≈ 0.3). State for the lerped position
 *   lives in a ref so we don't re-render on every tick — instead we mutate
 *   DOM `transform` directly.
 */

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
} from 'react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import type { PresenceEntry } from '@/stores/workspaceStore';

export interface CursorsLayerProps {
  /** Local user id — that cursor is not rendered. */
  currentUserId: number;
  className?: string;
  style?: CSSProperties;
}

interface CursorRefs {
  el: HTMLDivElement;
  /** Last interpolated screen position. */
  cur: { x: number; y: number };
  /** Last target position (from presence). */
  target: { x: number; y: number };
}

const LERP = 0.3;

export function CursorsLayer({ currentUserId, className, style }: CursorsLayerProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const refsRef = useRef<Map<string, CursorRefs>>(new Map());
  const localIdentity = useMemo(() => String(currentUserId), [currentUserId]);

  // We subscribe to presence to know which cursors to render but pull the
  // latest coords imperatively in the rAF loop to keep DOM updates cheap.
  const presence = useWorkspaceStore((s) => s.presence);
  const presenceRef = useRef(presence);
  presenceRef.current = presence;

  // ==================== Lerp loop ====================

  useEffect(() => {
    let raf: number;
    const step = () => {
      const wrapper = wrapperRef.current;
      const w = wrapper?.clientWidth ?? 0;
      const h = wrapper?.clientHeight ?? 0;
      const map = refsRef.current;
      const presence = presenceRef.current;
      for (const [identity, entry] of Object.entries(presence)) {
        if (identity === localIdentity) continue;
        const refs = map.get(identity);
        if (!refs) continue;
        // Map normalised → screen coords.
        refs.target = { x: entry.x * w, y: entry.y * h };
        refs.cur.x += (refs.target.x - refs.cur.x) * LERP;
        refs.cur.y += (refs.target.y - refs.cur.y) * LERP;
        refs.el.style.transform = `translate(${refs.cur.x}px, ${refs.cur.y}px)`;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [localIdentity]);

  const visible = useMemo<PresenceEntry[]>(() => {
    return Object.values(presence).filter((p) => p.identity !== localIdentity);
  }, [presence, localIdentity]);

  // Reset refs map on visibility change so we don't keep stale handles.
  useLayoutEffect(() => {
    const map = refsRef.current;
    const seen = new Set<string>();
    for (const p of visible) seen.add(p.identity);
    for (const id of Array.from(map.keys())) {
      if (!seen.has(id)) map.delete(id);
    }
  }, [visible]);

  return (
    <div
      ref={wrapperRef}
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        ...style,
      }}
    >
      {visible.map((entry) => (
        <RemoteCursor
          key={entry.identity}
          entry={entry}
          register={(el) => {
            const map = refsRef.current;
            if (!el) {
              map.delete(entry.identity);
              return;
            }
            const wrapper = wrapperRef.current;
            const w = wrapper?.clientWidth ?? 0;
            const h = wrapper?.clientHeight ?? 0;
            const x = entry.x * w;
            const y = entry.y * h;
            map.set(entry.identity, {
              el,
              cur: { x, y },
              target: { x, y },
            });
            // Initial position so it doesn't flash from (0,0).
            el.style.transform = `translate(${x}px, ${y}px)`;
          }}
        />
      ))}
    </div>
  );
}

interface RemoteCursorProps {
  entry: PresenceEntry;
  register: (el: HTMLDivElement | null) => void;
}

function RemoteCursor({ entry, register }: RemoteCursorProps) {
  return (
    <div
      ref={register}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        willChange: 'transform',
        transition: 'opacity 200ms ease',
        pointerEvents: 'none',
      }}
    >
      <svg
        width={18}
        height={20}
        viewBox="0 0 18 20"
        fill="none"
        style={{ display: 'block', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.25))' }}
      >
        <path
          d="M0 0 L0 16 L4 12 L7 19 L9 18 L6 11 L12 11 Z"
          fill={entry.color}
          stroke="#fff"
          strokeWidth={1}
          strokeLinejoin="round"
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          left: 16,
          top: 14,
          background: entry.color,
          color: '#fff',
          fontSize: 11,
          padding: '1px 6px',
          borderRadius: 4,
          whiteSpace: 'nowrap',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        }}
      >
        {entry.name}
      </div>
    </div>
  );
}
