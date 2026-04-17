'use client';

/**
 * Top-level canvas surface for the workspace.
 *
 * Renders three concentric layers in z-order:
 *   1. The HTML5 `<canvas>` itself, drawn imperatively from
 *      `workspaceStore.elements` via the helpers in `ElementRenderer.tsx`.
 *      Drawing happens in a rAF loop that ticks only when something has
 *      changed (`isDirtyRef`) — the React component does NOT re-render on
 *      every store mutation, the loop pulls fresh state from the store.
 *   2. `SelectionLayer` — DOM overlay for selection handles and the
 *      marquee/in-progress preview (uses the same world↔screen helpers).
 *   3. `CursorsLayer` — DOM overlay for remote cursors.
 *
 * Pointer model:
 *   - Pan: middle-mouse drag, OR `Space + left drag` (Figma convention).
 *   - Zoom: `Ctrl/Cmd + wheel` zooms about the cursor; plain wheel pans.
 *   - Click + drag with a creation tool (rect/ellipse/etc) builds a new
 *     element in `inProgressRef`, committed on mouseup via `commitOp`.
 *   - With the `select` tool, clicks pass to the SelectionLayer (rendered
 *     above the canvas) — that layer owns the actual hit-test.
 *
 * Coords:
 *   - Screen coords have origin at the canvas top-left.
 *   - World coords come from `viewport.{x,y,zoom}`:
 *       worldX = viewport.x + screenX / viewport.zoom
 *       screenX = (worldX - viewport.x) * viewport.zoom
 */

import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  type ReactNode,
} from 'react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import {
  drawElements,
  type RenderContext,
} from './ElementRenderer';
import type {
  Element,
  ElementKind,
  ElementStyle,
  OpAdd,
  OpDelete,
  OpTransform,
  OpUpdate,
  OpZ,
} from '@/types/workspace';

/**
 * Distributive `Omit<WorkspaceOp, 'opId' | 'v'>` — preserves the discriminated
 * union when removing the bookkeeping fields. The plain `Omit` collapses to
 * just the common fields and loses `el`/`ids`/etc, so commit callbacks need
 * this distributive variant.
 */
export type WorkspaceOpDraft =
  | Omit<OpAdd, 'opId' | 'v'>
  | Omit<OpUpdate, 'opId' | 'v'>
  | Omit<OpTransform, 'opId' | 'v'>
  | Omit<OpDelete, 'opId' | 'v'>
  | Omit<OpZ, 'opId' | 'v'>;

export interface WorkspaceCanvasProps {
  /** Local user id (becomes `Element.createdBy` for new elements). */
  userId: number;
  /** Called for each new/finalised op (rect drawn, element moved, deleted…). */
  onCommit: (op: WorkspaceOpDraft) => void;
  /** Called per pointermove with normalised [0..1] viewport coords. Optional. */
  onPointerMove?: (normX: number, normY: number) => void;
  /** Workspace id — forwarded to the renderer so image elements can fetch
   *  their bytes via `/api/workspaces/<id>/assets/<assetId>`. Optional only
   *  for backwards compatibility; in practice always supplied. */
  workspaceId?: number;
  /** Slot for SelectionLayer / CursorsLayer / InProgressOverlay (overlaid on canvas). */
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface WorldPoint {
  x: number;
  y: number;
}

/** World → screen helper (in canvas px, NOT device px). */
export function worldToScreen(
  world: WorldPoint,
  viewport: { x: number; y: number; zoom: number }
): ScreenPoint {
  return {
    x: (world.x - viewport.x) * viewport.zoom,
    y: (world.y - viewport.y) * viewport.zoom,
  };
}

/** Screen → world helper. Inverse of `worldToScreen`. */
export function screenToWorld(
  screen: ScreenPoint,
  viewport: { x: number; y: number; zoom: number }
): WorldPoint {
  return {
    x: viewport.x + screen.x / viewport.zoom,
    y: viewport.y + screen.y / viewport.zoom,
  };
}

interface PanState {
  /** Screen-space starting point of the pan. */
  startX: number;
  startY: number;
  /** Viewport state at pan start. */
  origViewportX: number;
  origViewportY: number;
}

interface DrawState {
  /** Tool that initiated the draw. */
  tool: ElementKind;
  /** Starting world coordinate. */
  startWorld: WorldPoint;
  /** Element id pre-allocated for the in-progress shape. */
  id: string;
  /** Snapshot of styleDefaults at start. */
  style: ElementStyle;
  /** Accumulated points (only for freehand). World coordinates. */
  freehandPoints: Array<[number, number]>;
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `el_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Map a WorkspaceTool to the element kind it produces (or null for select). */
function toolToKind(tool: string): ElementKind | null {
  switch (tool) {
    case 'rect':
      return 'rect';
    case 'ellipse':
      return 'ellipse';
    case 'line':
      return 'line';
    case 'arrow':
      return 'arrow';
    case 'text':
      return 'text';
    case 'sticky':
      return 'sticky';
    case 'pen':
      return 'freehand';
    default:
      return null;
  }
}

export function WorkspaceCanvas({
  userId,
  onCommit,
  onPointerMove,
  workspaceId,
  children,
  className,
  style,
}: WorkspaceCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dprRef = useRef(1);
  const sizeRef = useRef({ w: 1, h: 1 });
  const isDirtyRef = useRef(true);
  const rafRef = useRef<number | null>(null);
  // Subset of store state we read inside the render loop. Pulled imperatively
  // each tick so React doesn't re-render the canvas on every mutation.
  const storeRef = useRef(useWorkspaceStore.getState());
  useEffect(() => {
    return useWorkspaceStore.subscribe((state) => {
      storeRef.current = state;
      isDirtyRef.current = true;
    });
  }, []);

  // ==================== Pointer / interaction state ====================
  const panRef = useRef<PanState | null>(null);
  const drawRef = useRef<DrawState | null>(null);
  const isSpaceDownRef = useRef(false);
  const inProgressElRef = useRef<Element | null>(null);

  // ==================== Render loop ====================
  const render = useCallback(() => {
    rafRef.current = null;
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!isDirtyRef.current) {
      // Re-arm the loop only on the next dirty mark.
      return;
    }
    isDirtyRef.current = false;

    const dpr = dprRef.current;
    const w = sizeRef.current.w;
    const h = sizeRef.current.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const state = storeRef.current;
    ctx.save();
    // Reset transform; clear in device pixels.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w * dpr, h * dpr);
    // Apply DPR + viewport in one shot. Note: device-px = dpr * css-px.
    const z = state.viewport.zoom;
    ctx.setTransform(z * dpr, 0, 0, z * dpr, -state.viewport.x * z * dpr, -state.viewport.y * z * dpr);

    const renderCtx: RenderContext = {
      ctx,
      viewportZoom: z,
      isSelected: (id) => state.selection.has(id),
      workspaceId,
      requestRedraw: () => {
        isDirtyRef.current = true;
      },
    };

    // Sort by z each frame — small N (<=5000 cap), not a hot path.
    const elements = Object.values(state.elements);
    elements.sort((a, b) => a.z - b.z);
    drawElements(elements, renderCtx);

    // In-progress preview drawn on top.
    if (inProgressElRef.current) {
      drawElements([inProgressElRef.current], renderCtx);
    }

    ctx.restore();
  }, [workspaceId]);

  const requestRender = useCallback(() => {
    isDirtyRef.current = true;
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(render);
  }, [render]);

  // Keep the loop ticking while there are dirty frames.
  useEffect(() => {
    let id: number;
    const tick = () => {
      if (isDirtyRef.current) {
        render();
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [render]);

  // ==================== Resize ====================
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      sizeRef.current = { w: Math.max(1, rect.width), h: Math.max(1, rect.height) };
      dprRef.current = dpr;
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      requestRender();
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    window.addEventListener('resize', resize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [requestRender]);

  // ==================== Wheel: zoom or pan ====================
  const onWheel = useCallback(
    (e: ReactWheelEvent<HTMLDivElement>) => {
      const ctrlOrMeta = e.ctrlKey || e.metaKey;
      if (ctrlOrMeta) {
        e.preventDefault();
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const state = storeRef.current;
        const anchorWorld = screenToWorld({ x: sx, y: sy }, state.viewport);
        const factor = Math.exp(-e.deltaY * 0.0015);
        useWorkspaceStore.getState().zoomBy(factor, anchorWorld);
      } else {
        // Pan with deltas in world units — scale by zoom so a wheel notch
        // moves the same screen distance regardless of zoom.
        const z = storeRef.current.viewport.zoom;
        useWorkspaceStore.getState().pan(e.deltaX / z, e.deltaY / z);
      }
      requestRender();
    },
    [requestRender]
  );

  // ==================== Pointer events ====================
  const beginPan = useCallback((screenX: number, screenY: number) => {
    const v = storeRef.current.viewport;
    panRef.current = {
      startX: screenX,
      startY: screenY,
      origViewportX: v.x,
      origViewportY: v.y,
    };
  }, []);

  const beginDraw = useCallback(
    (kind: ElementKind, world: WorldPoint) => {
      const id = generateId();
      const styleDefaults = storeRef.current.styleDefaults;
      const style: ElementStyle = {
        stroke: styleDefaults.stroke,
        fill: styleDefaults.fill,
        strokeWidth: styleDefaults.strokeWidth,
        opacity: styleDefaults.opacity,
      };
      drawRef.current = {
        tool: kind,
        startWorld: world,
        id,
        style,
        freehandPoints: kind === 'freehand' ? [[0, 0]] : [],
      };
      // Seed the in-progress element with a 0-size bbox at the start point.
      inProgressElRef.current = buildElement(
        kind,
        id,
        world,
        world,
        style,
        userId,
        styleDefaults.fontSize,
        []
      );
      isDirtyRef.current = true;
    },
    [userId]
  );

  const updateDraw = useCallback((world: WorldPoint) => {
    const d = drawRef.current;
    if (!d) return;
    let freehand = d.freehandPoints;
    if (d.tool === 'freehand') {
      // Track points relative to the bbox top-left during draw, but keep
      // raw world coordinates for now — we'll re-normalise on commit.
      freehand = [...d.freehandPoints, [world.x - d.startWorld.x, world.y - d.startWorld.y]];
      d.freehandPoints = freehand;
    }
    inProgressElRef.current = buildElement(
      d.tool,
      d.id,
      d.startWorld,
      world,
      d.style,
      userId,
      storeRef.current.styleDefaults.fontSize,
      freehand
    );
    isDirtyRef.current = true;
  }, [userId]);

  const endDraw = useCallback(() => {
    const el = inProgressElRef.current;
    inProgressElRef.current = null;
    drawRef.current = null;
    if (!el) return;
    // Reject zero-area shapes (single click without drag) for non-text/sticky.
    if (el.kind !== 'text' && el.kind !== 'sticky' && el.w < 2 && el.h < 2) {
      isDirtyRef.current = true;
      return;
    }
    onCommit({ type: 'add', el });
    isDirtyRef.current = true;
  }, [onCommit]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      // Middle-button or space-pan → pan mode.
      if (e.button === 1 || (e.button === 0 && isSpaceDownRef.current)) {
        beginPan(sx, sy);
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }

      if (e.button !== 0) return;
      const tool = storeRef.current.tool;
      const kind = toolToKind(tool);
      if (kind === null) return; // 'select' tool — handled by overlay
      const world = screenToWorld({ x: sx, y: sy }, storeRef.current.viewport);
      beginDraw(kind, world);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [beginPan, beginDraw]
  );

  const onPointerMoveImpl = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      if (onPointerMove) {
        const w = rect.width || 1;
        const h = rect.height || 1;
        onPointerMove(sx / w, sy / h);
      }

      const pan = panRef.current;
      if (pan) {
        const z = storeRef.current.viewport.zoom;
        useWorkspaceStore.getState().setViewport({
          x: pan.origViewportX - (sx - pan.startX) / z,
          y: pan.origViewportY - (sy - pan.startY) / z,
          zoom: z,
        });
        requestRender();
        return;
      }

      const draw = drawRef.current;
      if (draw) {
        const world = screenToWorld({ x: sx, y: sy }, storeRef.current.viewport);
        updateDraw(world);
        requestRender();
      }
    },
    [onPointerMove, requestRender, updateDraw]
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // Ignore — capture may have been released by another listener.
      }
      if (panRef.current) {
        panRef.current = null;
        return;
      }
      if (drawRef.current) {
        endDraw();
        requestRender();
      }
    },
    [endDraw, requestRender]
  );

  // ==================== Keyboard ====================
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore keystrokes when the user is typing in an input/textarea.
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement | null)?.isContentEditable) {
        return;
      }
      if (e.code === 'Space') {
        isSpaceDownRef.current = true;
        return;
      }
      if (e.key === 'Escape') {
        useWorkspaceStore.getState().clearSelection();
        useWorkspaceStore.getState().setTool('select');
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const selection = useWorkspaceStore.getState().selection;
        if (selection.size === 0) return;
        e.preventDefault();
        const ids = Array.from(selection);
        onCommit({ type: 'delete', ids });
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        isSpaceDownRef.current = false;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [onCommit]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        userSelect: 'none',
        touchAction: 'none',
        background: '#fafafa',
        ...style,
      }}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMoveImpl}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <canvas ref={canvasRef} style={{ display: 'block', position: 'absolute', inset: 0 }} />
      {children}
    </div>
  );
}

// ==================== Element constructor used during in-progress draw ====================

function buildElement(
  kind: ElementKind,
  id: string,
  start: WorldPoint,
  end: WorldPoint,
  style: ElementStyle,
  userId: number,
  fontSize: number,
  freehandRelativePoints: Array<[number, number]>
): Element {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const w = Math.abs(end.x - start.x);
  const h = Math.abs(end.y - start.y);
  const updatedAt = Date.now();
  const z = Date.now(); // fresh elements draw on top by default

  switch (kind) {
    case 'rect':
      return { id, kind: 'rect', x, y, w, h, z, style, createdBy: userId, updatedAt };
    case 'ellipse':
      return { id, kind: 'ellipse', x, y, w, h, z, style, createdBy: userId, updatedAt };
    case 'line':
      return { id, kind: 'line', x: start.x, y: start.y, w: end.x - start.x, h: end.y - start.y, z, style, createdBy: userId, updatedAt };
    case 'arrow':
      return { id, kind: 'arrow', x: start.x, y: start.y, w: end.x - start.x, h: end.y - start.y, z, style, createdBy: userId, updatedAt };
    case 'text':
      return {
        id,
        kind: 'text',
        x,
        y,
        w: Math.max(w, 60),
        h: Math.max(h, fontSize + 8),
        z,
        style,
        createdBy: userId,
        updatedAt,
        content: 'Text',
        fontSize,
      };
    case 'sticky':
      return {
        id,
        kind: 'sticky',
        x,
        y,
        w: Math.max(w, 120),
        h: Math.max(h, 80),
        z,
        style,
        createdBy: userId,
        updatedAt,
        content: '',
        color: '#fef08a',
      };
    case 'freehand': {
      // Re-normalise points to [0..1] of bbox.
      const minX = Math.min(0, ...freehandRelativePoints.map((p) => p[0]));
      const minY = Math.min(0, ...freehandRelativePoints.map((p) => p[1]));
      const maxX = Math.max(0, ...freehandRelativePoints.map((p) => p[0]));
      const maxY = Math.max(0, ...freehandRelativePoints.map((p) => p[1]));
      const fw = Math.max(1, maxX - minX);
      const fh = Math.max(1, maxY - minY);
      const points = freehandRelativePoints.map<[number, number]>((p) => [
        (p[0] - minX) / fw,
        (p[1] - minY) / fh,
      ]);
      return {
        id,
        kind: 'freehand',
        x: start.x + minX,
        y: start.y + minY,
        w: fw,
        h: fh,
        z,
        style,
        createdBy: userId,
        updatedAt,
        points,
      };
    }
    default:
      // Fallback to rect for unknown — should never hit.
      return { id, kind: 'rect', x, y, w, h, z, style, createdBy: userId, updatedAt };
  }
}
