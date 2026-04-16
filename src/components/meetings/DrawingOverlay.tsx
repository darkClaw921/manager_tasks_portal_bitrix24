'use client';

/**
 * Canvas drawing layer that mounts on top of a screen-share <video>.
 *
 * Responsibilities:
 *  - Track the actual on-screen rectangle of the source `<video>` element via
 *    `ResizeObserver`, then size an HTML <canvas> to match it 1:1. This keeps
 *    pointer coordinates and rendered ink aligned with the visible pixels of
 *    the shared surface (the parent uses `object-contain`, so the video may
 *    be smaller than its container — see ScreenShareView).
 *  - Capture pointer events during a stroke. Coordinates are normalized to
 *    [0..1] of the canvas size before being sent on the wire so receivers
 *    with different display sizes render the stroke in the correct relative
 *    position.
 *  - Render every stroke from `meetingStore.annotations` (plus the local
 *    in-progress polyline) on every frame. Repaint is throttled with
 *    `requestAnimationFrame` to avoid stuttering on rapid pointermove events.
 *
 * The overlay accepts pointer input only when `enabled` is true (driven by
 * the toolbar). When disabled, `pointer-events: none` lets users interact
 * with the underlying video (right-click to copy, etc).
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Room } from 'livekit-client';
import { useMeetingStore } from '@/stores/meetingStore';
import { useDrawingSync } from '@/hooks/useDrawingSync';
import type { StrokeEvent } from '@/types/meeting';
import { cn } from '@/lib/utils';

export interface DrawingOverlayProps {
  /** The screen-share <video> element to draw on top of. */
  videoElement: HTMLVideoElement | null;
  /** Live LiveKit room — used to publish stroke events. */
  room: Room | null;
  /** App user id of the local participant. Stamped on outgoing strokes. */
  userId: number;
  /**
   * Whether pointer input is captured. When false, the canvas still renders
   * received strokes but lets clicks fall through to the video.
   */
  enabled: boolean;
  className?: string;
}

interface PointerStrokeState {
  /** Stable id assigned at pointerdown; used by Undo. */
  id: string;
  color: string;
  width: number;
  /** Normalized [0..1] points captured so far. */
  points: Array<{ x: number; y: number }>;
}

/**
 * Compute the absolute on-screen rectangle of `el` relative to a positioning
 * context that is its offsetParent. We use `getBoundingClientRect` of both
 * `el` and the canvas wrapper so we can size and position the canvas to
 * exactly cover the (letterboxed) video pixels.
 */
function getRelativeRect(el: HTMLElement, context: HTMLElement) {
  const elRect = el.getBoundingClientRect();
  const ctxRect = context.getBoundingClientRect();
  return {
    left: elRect.left - ctxRect.left,
    top: elRect.top - ctxRect.top,
    width: elRect.width,
    height: elRect.height,
  };
}

/**
 * Draw a single stroke as a smoothed polyline. The stroke's normalized
 * coordinates are scaled to the current canvas size and the stroke width is
 * scaled proportionally to keep line weight visually consistent across screen
 * sizes (using the canvas height as the reference axis — strokes thicken
 * with bigger surfaces, which matches user expectation).
 */
function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: { color: string; width: number; points: Array<{ x: number; y: number }> },
  canvasWidth: number,
  canvasHeight: number
) {
  if (stroke.points.length === 0) return;
  ctx.strokeStyle = stroke.color;
  // Scale the visual width by the canvas dimension so strokes look the same
  // size regardless of viewport; clamp to 0.5 px so it is always visible.
  const scaledWidth = Math.max(0.5, stroke.width * (canvasHeight / 720));
  ctx.lineWidth = scaledWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  const first = stroke.points[0];
  ctx.moveTo(first.x * canvasWidth, first.y * canvasHeight);
  if (stroke.points.length === 1) {
    // Single click — render as a dot.
    ctx.lineTo(first.x * canvasWidth + 0.01, first.y * canvasHeight + 0.01);
  } else {
    for (let i = 1; i < stroke.points.length; i += 1) {
      const p = stroke.points[i];
      ctx.lineTo(p.x * canvasWidth, p.y * canvasHeight);
    }
  }
  ctx.stroke();
}

export function DrawingOverlay({
  videoElement,
  room,
  userId,
  enabled,
  className,
}: DrawingOverlayProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  // Mutable pointer state — stored in a ref so pointermove handlers don't
  // trigger React re-renders on every sample (60-120/s).
  const inProgressRef = useRef<PointerStrokeState | null>(null);
  // Re-render flag when the in-progress polyline changes (used to repaint).
  const [strokeNonce, setStrokeNonce] = useState(0);
  // Tracked size of the visible video rect. Drives canvas width/height.
  const [rect, setRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  const annotations = useMeetingStore((s) => s.annotations);
  const tools = useMeetingStore((s) => s.tools);
  const { publishStroke, nextStrokeId } = useDrawingSync({ room, userId });

  // ===== Size sync: keep canvas matching the video's visible rect =====
  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!videoElement || !wrapper) return;

    const update = () => {
      const next = getRelativeRect(videoElement, wrapper);
      setRect((prev) => {
        if (
          prev &&
          prev.left === next.left &&
          prev.top === next.top &&
          prev.width === next.width &&
          prev.height === next.height
        ) {
          return prev;
        }
        return next;
      });
    };

    update();

    const ro = new ResizeObserver(update);
    ro.observe(videoElement);
    if (videoElement.parentElement) ro.observe(videoElement.parentElement);
    ro.observe(wrapper);

    // Window resize affects the wrapper rect (offset).
    const onWindowResize = () => update();
    window.addEventListener('resize', onWindowResize);
    // The video's intrinsic size only becomes known after `loadedmetadata`.
    videoElement.addEventListener('loadedmetadata', update);
    videoElement.addEventListener('resize', update);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onWindowResize);
      videoElement.removeEventListener('loadedmetadata', update);
      videoElement.removeEventListener('resize', update);
    };
  }, [videoElement]);

  // ===== Repaint: push pixels using requestAnimationFrame =====
  const requestRepaint = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Clear & redraw all strokes + the in-progress one.
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const w = canvas.width;
      const h = canvas.height;
      if (w === 0 || h === 0) return;

      for (const s of annotations) {
        drawStroke(ctx, s, w, h);
      }
      const live = inProgressRef.current;
      if (live) {
        drawStroke(ctx, live, w, h);
      }
    });
  }, [annotations]);

  // Resize the canvas backing store to match its CSS rect, accounting for
  // device pixel ratio so lines stay crisp on Retina/HiDPI displays.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !rect) return;
    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.max(0, Math.round(rect.width * dpr));
    const targetH = Math.max(0, Math.round(rect.height * dpr));
    if (canvas.width !== targetW) canvas.width = targetW;
    if (canvas.height !== targetH) canvas.height = targetH;
    requestRepaint();
  }, [rect, requestRepaint]);

  // Repaint whenever the strokes list changes or our in-progress state bumps.
  useEffect(() => {
    requestRepaint();
  }, [annotations, strokeNonce, requestRepaint]);

  // Cancel any pending RAF on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  // ===== Pointer handlers =====
  const toNormalized = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const r = canvas.getBoundingClientRect();
      const x = r.width === 0 ? 0 : (clientX - r.left) / r.width;
      const y = r.height === 0 ? 0 : (clientY - r.top) / r.height;
      // Clamp to [0..1] in case the pointer drifts outside the canvas mid-stroke.
      return {
        x: Math.min(1, Math.max(0, x)),
        y: Math.min(1, Math.max(0, y)),
      };
    },
    []
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!enabled) return;
      // Ignore non-primary buttons (e.g. right-click context).
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      e.preventDefault();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      const point = toNormalized(e.clientX, e.clientY);
      inProgressRef.current = {
        id: nextStrokeId(),
        color: tools.color,
        width: tools.width,
        points: [point],
      };
      setStrokeNonce((n) => n + 1);
    },
    [enabled, toNormalized, nextStrokeId, tools.color, tools.width]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!enabled) return;
      const live = inProgressRef.current;
      if (!live) return;
      e.preventDefault();
      const point = toNormalized(e.clientX, e.clientY);
      // Avoid duplicate points (some browsers fire pointermove without movement).
      const last = live.points[live.points.length - 1];
      if (last && last.x === point.x && last.y === point.y) return;
      live.points.push(point);
      requestRepaint();
    },
    [enabled, toNormalized, requestRepaint]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!enabled) return;
      const live = inProgressRef.current;
      if (!live) return;
      // Capture the final point at the release position too.
      const point = toNormalized(e.clientX, e.clientY);
      const last = live.points[live.points.length - 1];
      if (!last || last.x !== point.x || last.y !== point.y) {
        live.points.push(point);
      }
      const stroke: Omit<StrokeEvent, 'type' | 'userId' | 'timestamp'> = {
        id: live.id,
        color: live.color,
        width: live.width,
        points: live.points,
      };
      inProgressRef.current = null;
      setStrokeNonce((n) => n + 1);
      // Fire-and-forget — the hook handles its own logging on failure.
      void publishStroke(stroke);
    },
    [enabled, toNormalized, publishStroke]
  );

  // ===== Render =====
  // Wrapper covers the parent (matches the video container). Canvas is
  // positioned absolutely inside it to track the actual visible video rect.
  const canvasStyle = useMemo(() => {
    if (!rect) {
      return { display: 'none' as const };
    }
    return {
      position: 'absolute' as const,
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      touchAction: 'none' as const,
      cursor: enabled ? 'crosshair' : 'default',
    };
  }, [rect, enabled]);

  return (
    <div
      ref={wrapperRef}
      className={cn('absolute inset-0', className)}
      // Pointer events on the wrapper itself remain off — we only opt in on
      // the canvas while drawing is enabled, otherwise the underlying video
      // stays interactive.
      style={{ pointerEvents: 'none' }}
      data-meeting-surface="drawing-overlay"
    >
      <canvas
        ref={canvasRef}
        style={{
          ...canvasStyle,
          pointerEvents: enabled ? 'auto' : 'none',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
    </div>
  );
}
