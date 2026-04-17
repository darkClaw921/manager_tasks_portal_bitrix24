'use client';

/**
 * Selection layer overlay.
 *
 * Sits on top of the WorkspaceCanvas as a transparent <div> sized to the
 * canvas. Owns:
 *   - Hit-testing for the `select` tool: highest-z element under the cursor.
 *   - Drag-to-move + 8 resize handles.
 *   - Inline text editor (a positioned <textarea>) that appears on
 *     double-click of a `text` or `sticky` element.
 *
 * Wire format:
 *   - During drag we emit `transform` ops (the WorkspaceOps hook will throttle
 *     them to 30 Hz internally and apply optimistically).
 *   - On pointerup we emit a final `update` op so peers see the resting
 *     state on the reliable channel.
 *
 * Phase 1 scope: single-select only. The store's selection is already a Set
 * so multi-select can be added in Phase 3 with no schema changes.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import {
  worldToScreen,
  screenToWorld,
  type WorkspaceOpDraft,
} from './WorkspaceCanvas';
import { TableEditor } from './TableEditor';
import type { Element } from '@/types/workspace';

const HANDLE_PX = 10;

/** 8 handles around the bounding box: corners and edge midpoints. */
type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
const HANDLES: HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

interface DragState {
  /** What we're dragging. */
  mode: 'move' | { resize: HandleId };
  /** Element id at drag start. */
  elementId: string;
  /** Starting world position of the cursor. */
  startWorld: { x: number; y: number };
  /** Snapshot of element bbox at drag start. */
  origBbox: { x: number; y: number; w: number; h: number };
}

export interface SelectionLayerProps {
  /** Forwarded `commitOp` from WorkspaceCanvas / useWorkspaceOps. */
  onCommit: (op: WorkspaceOpDraft) => void;
  /**
   * Right-click on an element. Receives the hit element + viewport-space
   * coordinates of the click. Used by `WorkspaceRoom` to open the
   * `ElementContextMenu`. When omitted, native browser context menu is
   * suppressed but no app-level menu is shown.
   */
  onElementContextMenu?: (element: Element, viewportX: number, viewportY: number) => void;
  className?: string;
  style?: CSSProperties;
}

export function SelectionLayer({
  onCommit,
  onElementContextMenu,
  className,
  style,
}: SelectionLayerProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const tool = useWorkspaceStore((s) => s.tool);
  const selection = useWorkspaceStore((s) => s.selection);
  const elements = useWorkspaceStore((s) => s.elements);
  const viewport = useWorkspaceStore((s) => s.viewport);

  const dragRef = useRef<DragState | null>(null);

  /** Resolve the single selected element. Phase 1 = single select. */
  const selected = useMemo<Element | null>(() => {
    if (selection.size !== 1) return null;
    const id = selection.values().next().value;
    return id ? elements[id] ?? null : null;
  }, [selection, elements]);

  const sortedByZ = useMemo(() => {
    const all = Object.values(elements);
    all.sort((a, b) => b.z - a.z);
    return all;
  }, [elements]);

  // ==================== Hit-test ====================

  const elementsRef = useRef(sortedByZ);
  elementsRef.current = sortedByZ;
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  const hitTest = useCallback((screenX: number, screenY: number): Element | null => {
    const v = viewportRef.current;
    const world = screenToWorld({ x: screenX, y: screenY }, v);
    for (const el of elementsRef.current) {
      // Bbox hit; for line/arrow we still use bbox in Phase 1 — proper
      // distance-to-segment is Phase 3.
      const minX = Math.min(el.x, el.x + el.w);
      const maxX = Math.max(el.x, el.x + el.w);
      const minY = Math.min(el.y, el.y + el.h);
      const maxY = Math.max(el.y, el.y + el.h);
      // Pad lines/arrows for easier picking.
      const pad = el.kind === 'line' || el.kind === 'arrow' ? 6 / v.zoom : 0;
      if (
        world.x >= minX - pad &&
        world.x <= maxX + pad &&
        world.y >= minY - pad &&
        world.y <= maxY + pad
      ) {
        return el;
      }
    }
    return null;
  }, []);

  // ==================== Pointer handlers (only when tool === 'select') ====================

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (tool !== 'select') return;
      if (e.button !== 0) return;
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const rect = wrapper.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      // First: handle hit on currently selected element.
      const handle = selected ? hitHandle(selected, sx, sy, viewportRef.current) : null;
      if (handle && selected) {
        const startWorld = screenToWorld({ x: sx, y: sy }, viewportRef.current);
        dragRef.current = {
          mode: { resize: handle },
          elementId: selected.id,
          startWorld,
          origBbox: { x: selected.x, y: selected.y, w: selected.w, h: selected.h },
        };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        e.stopPropagation();
        return;
      }
      const target = hitTest(sx, sy);
      if (!target) {
        useWorkspaceStore.getState().clearSelection();
        return;
      }
      useWorkspaceStore.getState().selectElement(target.id);
      const startWorld = screenToWorld({ x: sx, y: sy }, viewportRef.current);
      dragRef.current = {
        mode: 'move',
        elementId: target.id,
        startWorld,
        origBbox: { x: target.x, y: target.y, w: target.w, h: target.h },
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      e.stopPropagation();
    },
    [tool, selected, hitTest]
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const rect = wrapper.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const world = screenToWorld({ x: sx, y: sy }, viewportRef.current);
      const dx = world.x - drag.startWorld.x;
      const dy = world.y - drag.startWorld.y;

      if (drag.mode === 'move') {
        onCommit({
          type: 'transform',
          id: drag.elementId,
          xy: [drag.origBbox.x + dx, drag.origBbox.y + dy],
        });
        return;
      }

      const handle = drag.mode.resize;
      const next = applyHandleResize(drag.origBbox, handle, dx, dy);
      onCommit({
        type: 'transform',
        id: drag.elementId,
        xy: [next.x, next.y],
        size: [next.w, next.h],
      });
    },
    [onCommit]
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      // Final reliable update: read the element from the store (already
      // optimistically updated by the transform ops).
      const cur = useWorkspaceStore.getState().elements[drag.elementId];
      if (cur) {
        onCommit({
          type: 'update',
          id: drag.elementId,
          patch: { x: cur.x, y: cur.y, w: cur.w, h: cur.h, updatedAt: Date.now() },
        });
      }
      dragRef.current = null;
    },
    [onCommit]
  );

  // ==================== Right-click context menu ====================

  const onContextMenu = useCallback(
    (e: ReactPointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => {
      if (tool !== 'select') return;
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const rect = wrapper.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const target = hitTest(sx, sy);
      // Always suppress the native menu while in select mode — we want
      // a clean canvas context. If nothing was hit we just close.
      e.preventDefault();
      if (!target) return;
      useWorkspaceStore.getState().selectElement(target.id);
      onElementContextMenu?.(target, e.clientX, e.clientY);
    },
    [tool, hitTest, onElementContextMenu]
  );

  // ==================== Inline text editor ====================

  const [editing, setEditing] = useState<{ id: string } | null>(null);

  const onDoubleClick = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (tool !== 'select') return;
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const rect = wrapper.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const target = hitTest(sx, sy);
      if (!target) return;
      if (target.kind !== 'text' && target.kind !== 'sticky' && target.kind !== 'table') {
        return;
      }
      useWorkspaceStore.getState().selectElement(target.id);
      setEditing({ id: target.id });
      e.stopPropagation();
    },
    [tool, hitTest]
  );

  // Cancel editing when selection changes elsewhere.
  useEffect(() => {
    if (!editing) return;
    if (!selection.has(editing.id)) setEditing(null);
  }, [editing, selection]);

  // ==================== Render ====================

  // Pointer-events: respect transparency — only intercept when tool === 'select'.
  const pointerStyle: CSSProperties = {
    pointerEvents: tool === 'select' ? 'auto' : 'none',
  };

  let bboxScreen: { left: number; top: number; w: number; h: number } | null = null;
  if (selected) {
    const tl = worldToScreen({ x: selected.x, y: selected.y }, viewport);
    bboxScreen = {
      left: tl.x,
      top: tl.y,
      w: selected.w * viewport.zoom,
      h: selected.h * viewport.zoom,
    };
  }

  return (
    <div
      ref={wrapperRef}
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        ...pointerStyle,
        ...style,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      {bboxScreen && selected && (
        <div
          style={{
            position: 'absolute',
            left: bboxScreen.left,
            top: bboxScreen.top,
            width: bboxScreen.w,
            height: bboxScreen.h,
            pointerEvents: 'none',
          }}
        >
          {HANDLES.map((h) => (
            <div
              key={h}
              style={handleCss(h, HANDLE_PX)}
            />
          ))}
        </div>
      )}

      {editing && selected && (selected.kind === 'text' || selected.kind === 'sticky') && (
        <InlineEditor
          element={selected}
          viewport={viewport}
          onCommit={(content) => {
            setEditing(null);
            onCommit({
              type: 'update',
              id: selected.id,
              patch: { content, updatedAt: Date.now() } as Partial<Element>,
            });
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {editing && selected && selected.kind === 'table' && (
        <TableEditor
          element={selected}
          viewport={viewport}
          onCommit={(cells) => {
            setEditing(null);
            onCommit({
              type: 'update',
              id: selected.id,
              patch: { cells, updatedAt: Date.now() } as Partial<Element>,
            });
          }}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}

// ==================== Helpers ====================

function hitHandle(
  el: Element,
  screenX: number,
  screenY: number,
  viewport: { x: number; y: number; zoom: number }
): HandleId | null {
  const tl = worldToScreen({ x: el.x, y: el.y }, viewport);
  const w = el.w * viewport.zoom;
  const h = el.h * viewport.zoom;
  const r = HANDLE_PX;
  const positions: Record<HandleId, [number, number]> = {
    nw: [tl.x, tl.y],
    n: [tl.x + w / 2, tl.y],
    ne: [tl.x + w, tl.y],
    e: [tl.x + w, tl.y + h / 2],
    se: [tl.x + w, tl.y + h],
    s: [tl.x + w / 2, tl.y + h],
    sw: [tl.x, tl.y + h],
    w: [tl.x, tl.y + h / 2],
  };
  for (const id of HANDLES) {
    const [px, py] = positions[id];
    if (
      screenX >= px - r &&
      screenX <= px + r &&
      screenY >= py - r &&
      screenY <= py + r
    ) {
      return id;
    }
  }
  return null;
}

function applyHandleResize(
  orig: { x: number; y: number; w: number; h: number },
  handle: HandleId,
  dx: number,
  dy: number
): { x: number; y: number; w: number; h: number } {
  let { x, y, w, h } = orig;
  switch (handle) {
    case 'nw':
      x = orig.x + dx;
      y = orig.y + dy;
      w = orig.w - dx;
      h = orig.h - dy;
      break;
    case 'n':
      y = orig.y + dy;
      h = orig.h - dy;
      break;
    case 'ne':
      y = orig.y + dy;
      w = orig.w + dx;
      h = orig.h - dy;
      break;
    case 'e':
      w = orig.w + dx;
      break;
    case 'se':
      w = orig.w + dx;
      h = orig.h + dy;
      break;
    case 's':
      h = orig.h + dy;
      break;
    case 'sw':
      x = orig.x + dx;
      w = orig.w - dx;
      h = orig.h + dy;
      break;
    case 'w':
      x = orig.x + dx;
      w = orig.w - dx;
      break;
  }
  // Clamp to a minimum size — flipping a bbox by dragging past the opposite
  // handle is Phase 3 polish.
  if (w < 4) w = 4;
  if (h < 4) h = 4;
  return { x, y, w, h };
}

function handleCss(id: HandleId, sizePx: number): CSSProperties {
  const half = sizePx / 2;
  // Map handle id → top/left percentage offsets.
  const positions: Record<HandleId, { left: string; top: string; cursor: string }> = {
    nw: { left: '0%', top: '0%', cursor: 'nwse-resize' },
    n: { left: '50%', top: '0%', cursor: 'ns-resize' },
    ne: { left: '100%', top: '0%', cursor: 'nesw-resize' },
    e: { left: '100%', top: '50%', cursor: 'ew-resize' },
    se: { left: '100%', top: '100%', cursor: 'nwse-resize' },
    s: { left: '50%', top: '100%', cursor: 'ns-resize' },
    sw: { left: '0%', top: '100%', cursor: 'nesw-resize' },
    w: { left: '0%', top: '50%', cursor: 'ew-resize' },
  };
  const p = positions[id];
  return {
    position: 'absolute',
    width: sizePx,
    height: sizePx,
    background: '#fff',
    border: '1px solid #3b82f6',
    borderRadius: 2,
    transform: `translate(-${half}px, -${half}px)`,
    left: p.left,
    top: p.top,
    cursor: p.cursor,
    pointerEvents: 'auto',
  };
}

// ==================== Inline editor ====================

interface InlineEditorProps {
  element: Element;
  viewport: { x: number; y: number; zoom: number };
  onCommit: (content: string) => void;
  onCancel: () => void;
}

function InlineEditor({ element, viewport, onCommit, onCancel }: InlineEditorProps) {
  const tl = worldToScreen({ x: element.x, y: element.y }, viewport);
  const w = element.w * viewport.zoom;
  const h = element.h * viewport.zoom;
  const initial =
    element.kind === 'text' || element.kind === 'sticky' ? element.content ?? '' : '';
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  // Latest value + initial captured in refs so the unmount cleanup can still
  // commit when the textarea is removed before its DOM `blur` event fires
  // (happens when the parent setEditing(null)s synchronously on selection change).
  const valueRef = useRef(value);
  const initialRef = useRef(initial);
  const onCommitRef = useRef(onCommit);
  const cancelledRef = useRef(false);
  const committedRef = useRef(false);
  valueRef.current = value;
  onCommitRef.current = onCommit;

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  useEffect(() => {
    return () => {
      if (cancelledRef.current || committedRef.current) return;
      if (valueRef.current !== initialRef.current) {
        onCommitRef.current(valueRef.current);
      }
    };
  }, []);

  const commitNow = (v: string) => {
    committedRef.current = true;
    onCommit(v);
  };

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => commitNow(value)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          cancelledRef.current = true;
          onCancel();
        }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          commitNow(value);
        }
      }}
      style={{
        position: 'absolute',
        left: tl.x,
        top: tl.y,
        width: w,
        height: h,
        padding: 4,
        margin: 0,
        font:
          element.kind === 'text'
            ? `${element.fontSize * viewport.zoom}px ui-sans-serif, system-ui, sans-serif`
            : `${14 * viewport.zoom}px ui-sans-serif, system-ui, sans-serif`,
        background:
          element.kind === 'sticky' ? element.color || '#fef08a' : 'rgba(255,255,255,0.92)',
        border: '1px solid #3b82f6',
        outline: 'none',
        resize: 'none',
        boxSizing: 'border-box',
      }}
    />
  );
}
