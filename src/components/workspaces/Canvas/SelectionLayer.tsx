'use client';

/**
 * Selection layer overlay.
 *
 * Sits on top of the WorkspaceCanvas as a transparent <div> sized to the
 * canvas. Owns:
 *   - Hit-testing for the `select` tool: highest-z element under the cursor.
 *   - Marquee (rubber-band) selection — drag in empty space to select multiple.
 *   - Shift+click to toggle individual elements in/out of the selection.
 *   - Drag-to-move + 8 resize handles (single-element only).
 *   - Group drag — when N>1 selected, drag any selected element to move all.
 *   - Snapping (alignment guides) during drag — magnetic to neighbour edges.
 *   - Inline text editor (a positioned <textarea>) on dbl-click of text/sticky.
 *
 * Wire format:
 *   - During drag we emit `transform` ops (the WorkspaceOps hook will throttle
 *     them to 30 Hz internally and apply optimistically).
 *   - On pointerup we emit a final `update` op so peers see the resting
 *     state on the reliable channel.
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
import { publishGuides } from './SnapGuides';
import { snapAgainstElements, type Bbox } from '@/lib/workspaces/snapping';
import type { Element } from '@/types/workspace';

const HANDLE_PX = 10;
/** Snap distance in screen pixels — converted to world via /viewport.zoom. */
const SNAP_THRESHOLD_PX = 6;

/** 8 handles around the bounding box: corners and edge midpoints. */
type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
const HANDLES: HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

interface SingleDragState {
  kind: 'single';
  /** What we're dragging. */
  mode: 'move' | { resize: HandleId };
  /** Element id at drag start. */
  elementId: string;
  /** Starting world position of the cursor. */
  startWorld: { x: number; y: number };
  /** Snapshot of element bbox at drag start. */
  origBbox: Bbox;
}

interface GroupDragState {
  kind: 'group';
  /** Element ids being moved together. */
  ids: string[];
  /** Starting world position of the cursor. */
  startWorld: { x: number; y: number };
  /** Snapshot of every element's bbox at drag start. */
  origBboxes: Map<string, Bbox>;
  /** Snapshot of the group bounding box at drag start. */
  origGroupBbox: Bbox;
}

interface MarqueeState {
  /** Starting world position of the marquee. */
  startWorld: { x: number; y: number };
  /** Current world position. */
  currentWorld: { x: number; y: number };
  /** Whether shift was held when the marquee started (additive). */
  additive: boolean;
}

type DragState = SingleDragState | GroupDragState;

export interface SelectionLayerProps {
  /** Forwarded `commitOp` from WorkspaceCanvas / useWorkspaceOps. */
  onCommit: (op: WorkspaceOpDraft) => void;
  /**
   * Right-click on an element. Receives the hit element + viewport-space
   * coordinates of the click. Used by `WorkspaceRoom` to open the
   * `ElementContextMenu`.
   */
  onElementContextMenu?: (element: Element, viewportX: number, viewportY: number) => void;
  /**
   * Optional callback to record drag start for undo/redo. Receives a snapshot
   * of every affected element BEFORE the drag mutates it.
   */
  onDragSnapshot?: (snapshots: Element[]) => void;
  /** Snap to grid (toggle from toolbar). 0 disables. */
  gridStep?: number;
  /** Disable snapping (e.g. when Alt is held — wired by WorkspaceCanvas). */
  snapDisabled?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function SelectionLayer({
  onCommit,
  onElementContextMenu,
  onDragSnapshot,
  gridStep = 0,
  snapDisabled = false,
  className,
  style,
}: SelectionLayerProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const tool = useWorkspaceStore((s) => s.tool);
  const selection = useWorkspaceStore((s) => s.selection);
  const elements = useWorkspaceStore((s) => s.elements);
  const viewport = useWorkspaceStore((s) => s.viewport);

  const dragRef = useRef<DragState | null>(null);
  const [marquee, setMarquee] = useState<MarqueeState | null>(null);
  /** Alt-disable: tracked here so the SelectionLayer can react in real time. */
  const altHeldRef = useRef(false);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Alt') altHeldRef.current = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt') altHeldRef.current = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  /** Resolve the single selected element. Multi-select returns null here. */
  const selected = useMemo<Element | null>(() => {
    if (selection.size !== 1) return null;
    const id = selection.values().next().value;
    return id ? elements[id] ?? null : null;
  }, [selection, elements]);

  /** Group bounding box for multi-select (≥2 selected). null otherwise. */
  const groupBbox = useMemo<Bbox | null>(() => {
    if (selection.size < 2) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let any = false;
    for (const id of selection) {
      const el = elements[id];
      if (!el) continue;
      const x1 = Math.min(el.x, el.x + el.w);
      const y1 = Math.min(el.y, el.y + el.h);
      const x2 = Math.max(el.x, el.x + el.w);
      const y2 = Math.max(el.y, el.y + el.h);
      if (x1 < minX) minX = x1;
      if (y1 < minY) minY = y1;
      if (x2 > maxX) maxX = x2;
      if (y2 > maxY) maxY = y2;
      any = true;
    }
    if (!any) return null;
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
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
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const elementsMapRef = useRef(elements);
  elementsMapRef.current = elements;
  const onDragSnapshotRef = useRef(onDragSnapshot);
  onDragSnapshotRef.current = onDragSnapshot;
  const gridStepRef = useRef(gridStep);
  gridStepRef.current = gridStep;
  const snapDisabledRef = useRef(snapDisabled);
  snapDisabledRef.current = snapDisabled;

  const hitTest = useCallback((screenX: number, screenY: number): Element | null => {
    const v = viewportRef.current;
    const world = screenToWorld({ x: screenX, y: screenY }, v);
    for (const el of elementsRef.current) {
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

  // ==================== Snap helper ====================
  /**
   * Apply snapping to a freshly-computed bbox, publish guides, return adjusted.
   * The exclude set ensures we don't snap to elements that are themselves
   * being moved (group drag).
   */
  const snapBbox = useCallback(
    (bbox: Bbox, excludeIds: ReadonlySet<string>): Bbox => {
      if (snapDisabledRef.current || altHeldRef.current) {
        publishGuides([]);
        return bbox;
      }
      const v = viewportRef.current;
      const result = snapAgainstElements(
        bbox,
        elementsMapRef.current,
        excludeIds,
        {
          threshold: SNAP_THRESHOLD_PX / v.zoom,
          gridStep: gridStepRef.current > 0 ? gridStepRef.current : undefined,
        }
      );
      publishGuides(result.guides);
      return result.bbox;
    },
    []
  );

  // ==================== Pointer handlers ====================

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (tool !== 'select') return;
      if (e.button !== 0) return;
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const rect = wrapper.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      // 1. Resize handle on the currently single-selected element?
      if (selected) {
        const handle = hitHandle(selected, sx, sy, viewportRef.current);
        if (handle) {
          const startWorld = screenToWorld({ x: sx, y: sy }, viewportRef.current);
          dragRef.current = {
            kind: 'single',
            mode: { resize: handle },
            elementId: selected.id,
            startWorld,
            origBbox: { x: selected.x, y: selected.y, w: selected.w, h: selected.h },
          };
          // Snapshot for undo/redo.
          onDragSnapshotRef.current?.([{ ...selected }]);
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          e.stopPropagation();
          return;
        }
      }

      const target = hitTest(sx, sy);
      const shift = e.shiftKey;

      // 2. Group drag: clicked on an already-selected element while there are
      //    multiple selected → start a group move (no shift).
      if (target && !shift && selectionRef.current.has(target.id) && selectionRef.current.size > 1) {
        const startWorld = screenToWorld({ x: sx, y: sy }, viewportRef.current);
        const origBboxes = new Map<string, Bbox>();
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const snapshots: Element[] = [];
        for (const id of selectionRef.current) {
          const el = elementsMapRef.current[id];
          if (!el) continue;
          origBboxes.set(id, { x: el.x, y: el.y, w: el.w, h: el.h });
          if (el.x < minX) minX = el.x;
          if (el.y < minY) minY = el.y;
          if (el.x + el.w > maxX) maxX = el.x + el.w;
          if (el.y + el.h > maxY) maxY = el.y + el.h;
          snapshots.push({ ...el });
        }
        dragRef.current = {
          kind: 'group',
          ids: Array.from(selectionRef.current),
          startWorld,
          origBboxes,
          origGroupBbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
        };
        onDragSnapshotRef.current?.(snapshots);
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        e.stopPropagation();
        return;
      }

      // 3. Empty space (no hit): start a marquee selection.
      if (!target) {
        const startWorld = screenToWorld({ x: sx, y: sy }, viewportRef.current);
        if (!shift) {
          // Click in empty space without shift: clear selection.
          useWorkspaceStore.getState().clearSelection();
        }
        setMarquee({ startWorld, currentWorld: startWorld, additive: shift });
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        e.stopPropagation();
        return;
      }

      // 4. Click on an element.
      if (shift) {
        // Toggle this element in/out of selection.
        useWorkspaceStore.getState().toggleSelectElement(target.id);
        // No drag follow-through on shift+click.
        e.stopPropagation();
        return;
      }
      // Plain click on an element: select it (replacing current selection if
      // it wasn't already selected) and start a single-move drag.
      if (!selectionRef.current.has(target.id) || selectionRef.current.size > 1) {
        useWorkspaceStore.getState().selectElement(target.id);
      }
      const startWorld = screenToWorld({ x: sx, y: sy }, viewportRef.current);
      dragRef.current = {
        kind: 'single',
        mode: 'move',
        elementId: target.id,
        startWorld,
        origBbox: { x: target.x, y: target.y, w: target.w, h: target.h },
      };
      onDragSnapshotRef.current?.([{ ...target }]);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      e.stopPropagation();
    },
    [tool, selected, hitTest]
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const rect = wrapper.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const world = screenToWorld({ x: sx, y: sy }, viewportRef.current);

      // Marquee?
      if (marquee) {
        setMarquee({ ...marquee, currentWorld: world });
        return;
      }

      const drag = dragRef.current;
      if (!drag) return;

      const dx = world.x - drag.startWorld.x;
      const dy = world.y - drag.startWorld.y;

      if (drag.kind === 'single') {
        if (drag.mode === 'move') {
          // Snap the moving bbox.
          const proposed: Bbox = {
            x: drag.origBbox.x + dx,
            y: drag.origBbox.y + dy,
            w: drag.origBbox.w,
            h: drag.origBbox.h,
          };
          const excludes = new Set([drag.elementId]);
          const snapped = snapBbox(proposed, excludes);
          onCommit({
            type: 'transform',
            id: drag.elementId,
            xy: [snapped.x, snapped.y],
          });
          return;
        }
        const handle = drag.mode.resize;
        const next = applyHandleResize(drag.origBbox, handle, dx, dy);
        // Resize: snap the relevant edge being dragged.
        const snapped = snapBbox(next, new Set([drag.elementId]));
        onCommit({
          type: 'transform',
          id: drag.elementId,
          xy: [snapped.x, snapped.y],
          size: [snapped.w, snapped.h],
        });
        return;
      }

      // Group drag.
      const proposedGroup: Bbox = {
        x: drag.origGroupBbox.x + dx,
        y: drag.origGroupBbox.y + dy,
        w: drag.origGroupBbox.w,
        h: drag.origGroupBbox.h,
      };
      const excludeSet = new Set(drag.ids);
      const snappedGroup = snapBbox(proposedGroup, excludeSet);
      const groupDx = snappedGroup.x - drag.origGroupBbox.x;
      const groupDy = snappedGroup.y - drag.origGroupBbox.y;
      // Apply the same offset to every element in the group.
      for (const id of drag.ids) {
        const orig = drag.origBboxes.get(id);
        if (!orig) continue;
        onCommit({
          type: 'transform',
          id,
          xy: [orig.x + groupDx, orig.y + groupDy],
        });
      }
    },
    [onCommit, marquee, snapBbox]
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }

      // Marquee completion: select intersecting elements.
      if (marquee) {
        const ax = Math.min(marquee.startWorld.x, marquee.currentWorld.x);
        const ay = Math.min(marquee.startWorld.y, marquee.currentWorld.y);
        const bx = Math.max(marquee.startWorld.x, marquee.currentWorld.x);
        const by = Math.max(marquee.startWorld.y, marquee.currentWorld.y);
        // Tiny marquees (basically clicks): no-op.
        const minSizePx = 4;
        const v = viewportRef.current;
        const widthPx = (bx - ax) * v.zoom;
        const heightPx = (by - ay) * v.zoom;
        if (widthPx >= minSizePx || heightPx >= minSizePx) {
          const hit: string[] = [];
          for (const el of Object.values(elementsMapRef.current)) {
            const elX1 = Math.min(el.x, el.x + el.w);
            const elY1 = Math.min(el.y, el.y + el.h);
            const elX2 = Math.max(el.x, el.x + el.w);
            const elY2 = Math.max(el.y, el.y + el.h);
            // Intersection (NOT containment).
            if (elX2 < ax || elX1 > bx || elY2 < ay || elY1 > by) continue;
            hit.push(el.id);
          }
          if (marquee.additive) {
            useWorkspaceStore.getState().addToSelection(hit);
          } else {
            useWorkspaceStore.getState().setSelection(hit);
          }
        }
        setMarquee(null);
        return;
      }

      const drag = dragRef.current;
      if (!drag) return;

      // Clear snap guides.
      publishGuides([]);

      if (drag.kind === 'single') {
        const cur = useWorkspaceStore.getState().elements[drag.elementId];
        if (cur) {
          onCommit({
            type: 'update',
            id: drag.elementId,
            patch: { x: cur.x, y: cur.y, w: cur.w, h: cur.h, updatedAt: Date.now() },
          });
        }
      } else {
        // Final reliable update for every group member.
        for (const id of drag.ids) {
          const cur = useWorkspaceStore.getState().elements[id];
          if (!cur) continue;
          onCommit({
            type: 'update',
            id,
            patch: { x: cur.x, y: cur.y, updatedAt: Date.now() },
          });
        }
      }
      dragRef.current = null;
    },
    [onCommit, marquee]
  );

  // ==================== Right-click context menu ====================

  const onContextMenu = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (tool !== 'select') return;
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const rect = wrapper.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const target = hitTest(sx, sy);
      e.preventDefault();
      if (!target) return;
      // If the element is part of an existing multi-selection, keep it; else
      // collapse to single-select on this element.
      if (!selectionRef.current.has(target.id) || selectionRef.current.size === 0) {
        useWorkspaceStore.getState().selectElement(target.id);
      }
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

  // Group bounding box in screen coords.
  let groupBboxScreen: { left: number; top: number; w: number; h: number } | null = null;
  if (groupBbox) {
    const tl = worldToScreen({ x: groupBbox.x, y: groupBbox.y }, viewport);
    groupBboxScreen = {
      left: tl.x,
      top: tl.y,
      w: groupBbox.w * viewport.zoom,
      h: groupBbox.h * viewport.zoom,
    };
  }

  // Marquee in screen coords.
  let marqueeScreen: { left: number; top: number; w: number; h: number } | null = null;
  if (marquee) {
    const ax = Math.min(marquee.startWorld.x, marquee.currentWorld.x);
    const ay = Math.min(marquee.startWorld.y, marquee.currentWorld.y);
    const bx = Math.max(marquee.startWorld.x, marquee.currentWorld.x);
    const by = Math.max(marquee.startWorld.y, marquee.currentWorld.y);
    const tl = worldToScreen({ x: ax, y: ay }, viewport);
    marqueeScreen = {
      left: tl.x,
      top: tl.y,
      w: (bx - ax) * viewport.zoom,
      h: (by - ay) * viewport.zoom,
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

      {/* Multi-selection group bounding box. Resize handles are intentionally
          omitted — group resize is out-of-scope for Phase 3 MVP. */}
      {groupBboxScreen && (
        <div
          style={{
            position: 'absolute',
            left: groupBboxScreen.left,
            top: groupBboxScreen.top,
            width: groupBboxScreen.w,
            height: groupBboxScreen.h,
            border: '1px dashed #3b82f6',
            background: 'rgba(59, 130, 246, 0.04)',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Marquee preview */}
      {marqueeScreen && (
        <div
          style={{
            position: 'absolute',
            left: marqueeScreen.left,
            top: marqueeScreen.top,
            width: marqueeScreen.w,
            height: marqueeScreen.h,
            border: '1px solid #3b82f6',
            background: 'rgba(59, 130, 246, 0.08)',
            pointerEvents: 'none',
          }}
        />
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
  orig: Bbox,
  handle: HandleId,
  dx: number,
  dy: number
): Bbox {
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
  if (w < 4) w = 4;
  if (h < 4) h = 4;
  return { x, y, w, h };
}

function handleCss(id: HandleId, sizePx: number): CSSProperties {
  const half = sizePx / 2;
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
