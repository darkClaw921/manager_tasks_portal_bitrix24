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
 *    in-progress polyline) on every animation frame. A continuous
 *    `requestAnimationFrame` loop drives both the fade-out animation and
 *    lifetime pruning: each committed stroke stays at full opacity for
 *    2000ms after its `createdAt`, then linearly fades to 0 over 400ms and
 *    is removed by `pruneExpiredStrokes`. The loop only runs while there is
 *    something to animate (strokes in the store or an in-progress polyline)
 *    so idle meetings spend zero CPU on the canvas.
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
/**
 * Draw a single stroke as a smoothed polyline. The stroke's normalized
 * coordinates are scaled to the current canvas size and the stroke width is
 * scaled proportionally to keep line weight visually consistent across screen
 * sizes (using the canvas height as the reference axis — strokes thicken
 * with bigger surfaces, which matches user expectation).
 *
 * `wipeProgress` drives a start-to-end fade: 0 = fully opaque, 1 = fully
 * erased. Segments closer to the stroke's start disappear first; a soft edge
 * of width `WIPE_EDGE` gives the wipe a gradient look instead of a hard cut.
 */
const WIPE_EDGE = 0.3;

function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: { color: string; width: number; points: Array<{ x: number; y: number }> },
  canvasWidth: number,
  canvasHeight: number,
  wipeProgress = 0
) {
  const points = stroke.points;
  if (points.length === 0) return;
  ctx.strokeStyle = stroke.color;
  // Scale the visual width by the canvas dimension so strokes look the same
  // size regardless of viewport; clamp to 0.5 px so it is always visible.
  const scaledWidth = Math.max(0.5, stroke.width * (canvasHeight / 720));
  ctx.lineWidth = scaledWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const baseAlpha = ctx.globalAlpha;

  // Fast path: no wipe in progress — draw the whole polyline in one stroke
  // call. Cheaper than per-segment paths for long polylines.
  if (wipeProgress <= 0) {
    ctx.beginPath();
    const first = points[0];
    ctx.moveTo(first.x * canvasWidth, first.y * canvasHeight);
    if (points.length === 1) {
      ctx.lineTo(first.x * canvasWidth + 0.01, first.y * canvasHeight + 0.01);
    } else {
      for (let i = 1; i < points.length; i += 1) {
        const p = points[i];
        ctx.lineTo(p.x * canvasWidth, p.y * canvasHeight);
      }
    }
    ctx.stroke();
    return;
  }

  // Virtual wipe front — by the time wipeProgress = 1, the front has passed
  // past f = 1 by WIPE_EDGE, so every segment's alpha has fully decayed.
  const wipeFront = wipeProgress * (1 + WIPE_EDGE);

  // Single-point stroke: treat as a dot with a single alpha derived from f=0.
  if (points.length === 1) {
    const dotAlpha = Math.max(0, Math.min(1, (0 - wipeFront + WIPE_EDGE) / WIPE_EDGE));
    if (dotAlpha > 0) {
      ctx.globalAlpha = baseAlpha * dotAlpha;
      ctx.beginPath();
      const first = points[0];
      ctx.moveTo(first.x * canvasWidth, first.y * canvasHeight);
      ctx.lineTo(first.x * canvasWidth + 0.01, first.y * canvasHeight + 0.01);
      ctx.stroke();
      ctx.globalAlpha = baseAlpha;
    }
    return;
  }

  // Per-segment render. Batches consecutive segments whose alpha matches
  // (quantised to 0.02) into a single path to keep draw calls low for long
  // polylines — visually imperceptible but materially cheaper.
  const denom = points.length - 1;
  let batchStartIdx = 0;
  let batchAlpha = quantiseAlpha(wipeFront, 0, denom);

  const flush = (fromIdx: number, toIdx: number, alpha: number) => {
    if (alpha <= 0) return;
    ctx.globalAlpha = baseAlpha * alpha;
    ctx.beginPath();
    const start = points[fromIdx];
    ctx.moveTo(start.x * canvasWidth, start.y * canvasHeight);
    for (let j = fromIdx + 1; j <= toIdx; j += 1) {
      const p = points[j];
      ctx.lineTo(p.x * canvasWidth, p.y * canvasHeight);
    }
    ctx.stroke();
  };

  for (let i = 1; i < points.length; i += 1) {
    const alpha = quantiseAlpha(wipeFront, i, denom);
    if (alpha !== batchAlpha) {
      // Close out the previous batch ending at i-1 (inclusive).
      flush(batchStartIdx, i - 1, batchAlpha);
      // Start a new batch that begins at i-1 so consecutive batches share a
      // vertex and the polyline stays visually continuous.
      batchStartIdx = i - 1;
      batchAlpha = alpha;
    }
    if (i === points.length - 1) {
      flush(batchStartIdx, i, batchAlpha);
    }
  }

  ctx.globalAlpha = baseAlpha;
}

/**
 * Quantise the per-segment wipe alpha to 50 discrete steps so neighbouring
 * segments batch together without visibly banding.
 */
function quantiseAlpha(wipeFront: number, i: number, denom: number): number {
  const f = denom === 0 ? 0 : i / denom;
  const raw = (f - wipeFront + WIPE_EDGE) / WIPE_EDGE;
  const clamped = Math.max(0, Math.min(1, raw));
  return Math.round(clamped * 50) / 50;
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
  // Tracked size of the visible video rect. Drives canvas width/height.
  const [rect, setRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  const annotations = useMeetingStore((s) => s.annotations);
  const tools = useMeetingStore((s) => s.tools);
  const pruneExpiredStrokes = useMeetingStore((s) => s.pruneExpiredStrokes);
  const { publishStroke, nextStrokeId } = useDrawingSync({ room, userId });

  // Keep refs of live values so the rAF loop (registered once) always reads
  // the current annotations array and prune action without capturing stale
  // closures. React re-renders update these refs synchronously via the
  // effect below, which is cheaper than restarting rAF on every store tick.
  const annotationsRef = useRef<StrokeEvent[]>(annotations);
  const pruneRef = useRef(pruneExpiredStrokes);
  useEffect(() => {
    annotationsRef.current = annotations;
  }, [annotations]);
  useEffect(() => {
    pruneRef.current = pruneExpiredStrokes;
  }, [pruneExpiredStrokes]);

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

  // ===== Continuous rAF loop: fade animation + lifetime pruning =====
  // Lifetime window:
  //   [0..1000]ms after createdAt → fully opaque (hold)
  //   [1000..1400]ms              → start-to-end wipe (first point erased first)
  //   > 1400ms                    → pruneExpiredStrokes removes the entry
  const HOLD_MS = 1000;
  const FADE_MS = 400;

  /**
   * Paint one frame. Clears the canvas, renders each committed stroke with
   * its age-derived wipe progress, then renders the in-progress polyline at
   * full opacity (it hasn't been committed yet — the fade starts at pointerup).
   * Returns `true` if anything was drawn so the loop can decide whether to
   * keep running.
   */
  const paint = useCallback((now: number): boolean => {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (w === 0 || h === 0) return false;

    const list = annotationsRef.current;
    let hadAnimating = false;
    for (const s of list) {
      const created = s.createdAt;
      let wipeProgress = 0;
      if (created !== undefined) {
        const age = now - created;
        if (age >= HOLD_MS + FADE_MS) {
          // Fully expired — will be removed by pruneExpiredStrokes this tick.
          continue;
        }
        if (age > HOLD_MS) {
          wipeProgress = Math.max(0, Math.min(1, (age - HOLD_MS) / FADE_MS));
          hadAnimating = true;
        }
      }
      drawStroke(ctx, s, w, h, wipeProgress);
    }

    const live = inProgressRef.current;
    if (live) {
      // In-progress strokes always render at full opacity; fade begins only
      // after pointerup commits the stroke to the store.
      drawStroke(ctx, live, w, h, 0);
    }

    return list.length > 0 || live !== null || hadAnimating;
  }, []);

  /**
   * Start (or keep running) the rAF loop. Safe to call repeatedly — a second
   * call while the loop is already active is a no-op. The loop runs for the
   * lifetime of the component — idle frames are cheap (clearRect on a tiny
   * canvas) and keeping it alive avoids race conditions where the loop
   * terminates between a pointerup and the React commit that updates
   * `annotationsRef`, clearing the canvas before the committed stroke is
   * ever painted.
   */
  const startLoop = useCallback(() => {
    if (rafRef.current !== null) return;
    const tick = () => {
      const now = Date.now();
      paint(now);
      // Prune AFTER paint so a stroke at age=2399 is drawn at ~alpha=0.0025
      // on its final frame before disappearing on the next one.
      pruneRef.current(now);
      rafRef.current = window.requestAnimationFrame(tick);
    };
    rafRef.current = window.requestAnimationFrame(tick);
  }, [paint]);

  // Resize the canvas backing store to match its CSS rect, accounting for
  // device pixel ratio so lines stay crisp on Retina/HiDPI displays. After a
  // resize, kick the loop so the next frame redraws at the new size (the
  // loop self-terminates if there's nothing to draw).
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !rect) return;
    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.max(0, Math.round(rect.width * dpr));
    const targetH = Math.max(0, Math.round(rect.height * dpr));
    if (canvas.width !== targetW) canvas.width = targetW;
    if (canvas.height !== targetH) canvas.height = targetH;
    if (annotationsRef.current.length > 0 || inProgressRef.current) {
      startLoop();
    } else {
      // No strokes — just paint one empty frame so the resized backing store
      // is in a known (cleared) state.
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, [rect, startLoop]);

  // Start the rAF loop on mount. It runs until unmount; idle frames clear a
  // tiny canvas and are effectively free. Keeping it always-on avoids the
  // timing hazard where the loop could self-terminate in the same tick as a
  // pointerup, before React commits the new stroke into `annotationsRef`.
  useEffect(() => {
    startLoop();
  }, [startLoop]);

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
      // No explicit repaint request here — the continuous rAF loop mounted
      // alongside the overlay picks up the new point on its next tick. This
      // keeps pointermove cheap (ref mutation only).
    },
    [enabled, toNormalized]
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
