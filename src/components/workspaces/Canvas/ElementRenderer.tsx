'use client';

/**
 * Imperative canvas renderer for workspace elements.
 *
 * The renderer takes a CanvasRenderingContext2D that has *already been
 * transformed* into world coordinates (the canvas component composes
 * dpr × zoom × pan into a single setTransform call). Renderer code therefore
 * draws elements at their world positions directly.
 *
 * Image elements are async: the renderer hands the asset id off to a
 * shared cache (`getImageForAsset`) and either gets back an `HTMLImageElement`
 * (drawn immediately) or `null` (a placeholder is drawn while loading).
 * Cache resolution + onload triggers a canvas redraw via the optional
 * `requestRedraw` hook so pixels appear without user interaction.
 */

import type { Element } from '@/types/workspace';

/** Render context passed into per-element draw routines. */
export interface RenderContext {
  ctx: CanvasRenderingContext2D;
  /**
   * Current zoom factor — renderers use this to keep stroke widths visually
   * consistent across zoom levels (divide by zoom when stroking).
   */
  viewportZoom: number;
  /** Returns true iff the element is currently selected (used for outline). */
  isSelected: (id: string) => boolean;
  /**
   * Workspace id used to build the image fetch URL
   * (`/api/workspaces/<wid>/assets/<assetId>`). Required only for image
   * rendering; falsy values render a "no workspace" placeholder.
   */
  workspaceId?: number;
  /**
   * Called once per redraw frame after an async resource (image) has
   * finished loading and the canvas should re-render. The canvas
   * component supplies a `markDirty` thunk; tests can omit it.
   */
  requestRedraw?: () => void;
}

// ==================== Image cache ====================
//
// Module-level Map so multiple canvases share decoded bitmaps for the
// duration of the page lifecycle. Keyed by `<workspaceId>:<assetId>` so
// pages with multiple workspaces don't collide.

type ImageCacheEntry =
  | { state: 'loading'; img: HTMLImageElement; subscribers: Set<() => void> }
  | { state: 'ready'; img: HTMLImageElement }
  | { state: 'error'; subscribers: Set<() => void> };

const imageCache = new Map<string, ImageCacheEntry>();

function cacheKey(workspaceId: number, assetId: number): string {
  return `${workspaceId}:${assetId}`;
}

/**
 * Look up (or kick off) the image fetch for `(workspaceId, assetId)`.
 * Returns the loaded `HTMLImageElement` synchronously when cached, or
 * `null` while loading / on error. Subscribes the supplied `onLoad`
 * callback so the canvas can redraw when the image arrives.
 */
export function getImageForAsset(
  workspaceId: number,
  assetId: number,
  onLoad?: () => void
): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null; // SSR
  const key = cacheKey(workspaceId, assetId);
  const existing = imageCache.get(key);
  if (existing) {
    if (existing.state === 'ready') return existing.img;
    if (onLoad) existing.subscribers.add(onLoad);
    return existing.state === 'loading' ? null : null;
  }
  const img = new Image();
  const subscribers = new Set<() => void>();
  if (onLoad) subscribers.add(onLoad);
  imageCache.set(key, { state: 'loading', img, subscribers });
  img.onload = () => {
    const entry = imageCache.get(key);
    const subs = entry && 'subscribers' in entry ? entry.subscribers : null;
    imageCache.set(key, { state: 'ready', img });
    if (subs) for (const fn of subs) fn();
  };
  img.onerror = () => {
    const entry = imageCache.get(key);
    const subs = entry && 'subscribers' in entry ? entry.subscribers : new Set<() => void>();
    imageCache.set(key, { state: 'error', subscribers: subs });
    for (const fn of subs) fn();
  };
  // crossorigin not needed — we serve same-origin via /api/workspaces/...
  img.src = `/api/workspaces/${workspaceId}/assets/${assetId}`;
  return null;
}

/** True iff the asset failed to load. Used by the renderer to draw an X. */
function isImageErrored(workspaceId: number, assetId: number): boolean {
  const entry = imageCache.get(cacheKey(workspaceId, assetId));
  return Boolean(entry && entry.state === 'error');
}

/** Test hook — wipe the cache between unit tests. */
export function __resetImageCacheForTests(): void {
  imageCache.clear();
}

/**
 * Draw a list of elements on the supplied context. Elements are drawn in the
 * order supplied (caller is responsible for sorting by `z`).
 */
export function drawElements(elements: Element[], rctx: RenderContext): void {
  for (const el of elements) {
    drawElement(el, rctx);
  }
}

/**
 * Switch on element kind and dispatch to the appropriate draw routine.
 *
 * Kept exported so unit tests can poke at individual paths without setting
 * up the full canvas component.
 */
export function drawElement(el: Element, rctx: RenderContext): void {
  switch (el.kind) {
    case 'rect':
      drawRect(el, rctx);
      break;
    case 'ellipse':
      drawEllipse(el, rctx);
      break;
    case 'line':
      drawLine(el, rctx);
      break;
    case 'arrow':
      drawArrow(el, rctx);
      break;
    case 'text':
      drawText(el, rctx);
      break;
    case 'sticky':
      drawSticky(el, rctx);
      break;
    case 'freehand':
      drawFreehand(el, rctx);
      break;
    case 'image':
      drawImage(el, rctx);
      break;
    case 'table':
      drawTable(el, rctx);
      break;
    default: {
      // Exhaustiveness check — adding a kind without updating this switch
      // becomes a compile error here.
      const _exhaustive: never = el;
      void _exhaustive;
    }
  }
}

// ==================== Style helpers ====================

function applyOpacity(ctx: CanvasRenderingContext2D, el: Element): number {
  const prev = ctx.globalAlpha;
  if (typeof el.style.opacity === 'number') {
    ctx.globalAlpha = Math.max(0, Math.min(1, el.style.opacity));
  }
  return prev;
}

function strokeWidth(el: Element, zoom: number): number {
  const sw = el.style.strokeWidth ?? 2;
  // Keep visual stroke ≥ 1 device px even when zoomed out.
  return Math.max(1 / zoom, sw / zoom);
}

function applyRotation(ctx: CanvasRenderingContext2D, el: Element): boolean {
  if (!el.rot) return false;
  ctx.save();
  ctx.translate(el.x + el.w / 2, el.y + el.h / 2);
  ctx.rotate(el.rot);
  ctx.translate(-(el.x + el.w / 2), -(el.y + el.h / 2));
  return true;
}

function strokeOutlineIfSelected(rctx: RenderContext, el: Element): void {
  if (!rctx.isSelected(el.id)) return;
  const { ctx, viewportZoom: z } = rctx;
  ctx.save();
  ctx.lineWidth = 2 / z;
  ctx.strokeStyle = '#3b82f6';
  ctx.setLineDash([6 / z, 4 / z]);
  ctx.strokeRect(el.x - 1 / z, el.y - 1 / z, el.w + 2 / z, el.h + 2 / z);
  ctx.restore();
}

// ==================== Per-kind draw routines ====================

function drawRect(el: Extract<Element, { kind: 'rect' }>, rctx: RenderContext) {
  const { ctx, viewportZoom: z } = rctx;
  const prevAlpha = applyOpacity(ctx, el);
  const rotated = applyRotation(ctx, el);
  if (el.style.fill && el.style.fill !== 'transparent' && el.style.fill !== 'none') {
    ctx.fillStyle = el.style.fill;
    ctx.fillRect(el.x, el.y, el.w, el.h);
  }
  if (el.style.stroke) {
    ctx.lineWidth = strokeWidth(el, z);
    ctx.strokeStyle = el.style.stroke;
    ctx.strokeRect(el.x, el.y, el.w, el.h);
  }
  if (rotated) ctx.restore();
  ctx.globalAlpha = prevAlpha;
  strokeOutlineIfSelected(rctx, el);
}

function drawEllipse(el: Extract<Element, { kind: 'ellipse' }>, rctx: RenderContext) {
  const { ctx, viewportZoom: z } = rctx;
  const prevAlpha = applyOpacity(ctx, el);
  const rotated = applyRotation(ctx, el);
  ctx.beginPath();
  ctx.ellipse(el.x + el.w / 2, el.y + el.h / 2, Math.abs(el.w / 2), Math.abs(el.h / 2), 0, 0, Math.PI * 2);
  if (el.style.fill && el.style.fill !== 'transparent' && el.style.fill !== 'none') {
    ctx.fillStyle = el.style.fill;
    ctx.fill();
  }
  if (el.style.stroke) {
    ctx.lineWidth = strokeWidth(el, z);
    ctx.strokeStyle = el.style.stroke;
    ctx.stroke();
  }
  if (rotated) ctx.restore();
  ctx.globalAlpha = prevAlpha;
  strokeOutlineIfSelected(rctx, el);
}

function drawLine(el: Extract<Element, { kind: 'line' }>, rctx: RenderContext) {
  const { ctx, viewportZoom: z } = rctx;
  const prevAlpha = applyOpacity(ctx, el);
  const rotated = applyRotation(ctx, el);
  ctx.beginPath();
  ctx.moveTo(el.x, el.y);
  ctx.lineTo(el.x + el.w, el.y + el.h);
  ctx.lineWidth = strokeWidth(el, z);
  ctx.strokeStyle = el.style.stroke ?? '#1f2937';
  ctx.lineCap = 'round';
  ctx.stroke();
  if (rotated) ctx.restore();
  ctx.globalAlpha = prevAlpha;
  strokeOutlineIfSelected(rctx, el);
}

function drawArrow(el: Extract<Element, { kind: 'arrow' }>, rctx: RenderContext) {
  const { ctx, viewportZoom: z } = rctx;
  const prevAlpha = applyOpacity(ctx, el);
  const rotated = applyRotation(ctx, el);
  const x1 = el.x;
  const y1 = el.y;
  const x2 = el.x + el.w;
  const y2 = el.y + el.h;
  const colour = el.style.stroke ?? '#1f2937';
  const lw = strokeWidth(el, z);
  ctx.lineWidth = lw;
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // Arrow head: 12 px in screen space, scaled.
  const headLen = 12 / z;
  const headWid = 8 / z;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const baseX = x2 - cosA * headLen;
  const baseY = y2 - sinA * headLen;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(baseX + sinA * headWid, baseY - cosA * headWid);
  ctx.lineTo(baseX - sinA * headWid, baseY + cosA * headWid);
  ctx.closePath();
  ctx.fill();

  if (rotated) ctx.restore();
  ctx.globalAlpha = prevAlpha;
  strokeOutlineIfSelected(rctx, el);
}

function drawText(el: Extract<Element, { kind: 'text' }>, rctx: RenderContext) {
  const { ctx } = rctx;
  const prevAlpha = applyOpacity(ctx, el);
  const rotated = applyRotation(ctx, el);
  ctx.fillStyle = el.style.stroke ?? '#1f2937';
  ctx.font = `${el.fontSize}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textBaseline = 'top';
  // Wrap — naive split by newline; visual word-wrap is Phase 3 polish.
  const lines = (el.content ?? '').split('\n');
  let cursorY = el.y + 4;
  for (const line of lines) {
    ctx.fillText(line, el.x + 4, cursorY, el.w - 8);
    cursorY += el.fontSize * 1.2;
  }
  if (rotated) ctx.restore();
  ctx.globalAlpha = prevAlpha;
  strokeOutlineIfSelected(rctx, el);
}

function drawSticky(el: Extract<Element, { kind: 'sticky' }>, rctx: RenderContext) {
  const { ctx, viewportZoom: z } = rctx;
  const prevAlpha = applyOpacity(ctx, el);
  const rotated = applyRotation(ctx, el);
  // Drop shadow for sticky feel.
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  ctx.fillRect(el.x + 2 / z, el.y + 2 / z, el.w, el.h);
  ctx.fillStyle = el.color || '#fef08a';
  ctx.fillRect(el.x, el.y, el.w, el.h);
  // Text body.
  ctx.fillStyle = '#1f2937';
  ctx.font = `14px ui-sans-serif, system-ui, sans-serif`;
  ctx.textBaseline = 'top';
  const lines = (el.content ?? '').split('\n');
  let cursorY = el.y + 8;
  for (const line of lines) {
    ctx.fillText(line, el.x + 8, cursorY, el.w - 16);
    cursorY += 16;
  }
  if (rotated) ctx.restore();
  ctx.globalAlpha = prevAlpha;
  strokeOutlineIfSelected(rctx, el);
}

function drawFreehand(el: Extract<Element, { kind: 'freehand' }>, rctx: RenderContext) {
  const { ctx, viewportZoom: z } = rctx;
  if (!el.points || el.points.length === 0) return;
  const prevAlpha = applyOpacity(ctx, el);
  const rotated = applyRotation(ctx, el);
  ctx.lineWidth = strokeWidth(el, z);
  ctx.strokeStyle = el.style.stroke ?? '#1f2937';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i < el.points.length; i += 1) {
    const [nx, ny] = el.points[i];
    const px = el.x + nx * el.w;
    const py = el.y + ny * el.h;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  if (rotated) ctx.restore();
  ctx.globalAlpha = prevAlpha;
  strokeOutlineIfSelected(rctx, el);
}

// ==================== Phase-2 implementations ====================

function drawImage(el: Extract<Element, { kind: 'image' }>, rctx: RenderContext) {
  const { ctx, viewportZoom: z, workspaceId, requestRedraw } = rctx;
  const prevAlpha = applyOpacity(ctx, el);
  const rotated = applyRotation(ctx, el);

  let drawn = false;
  if (workspaceId && Number.isFinite(el.assetId)) {
    const img = getImageForAsset(workspaceId, el.assetId, requestRedraw);
    if (img) {
      try {
        ctx.drawImage(img, el.x, el.y, el.w, el.h);
        drawn = true;
      } catch {
        // ImageBitmap can throw on broken images — fall through to placeholder.
      }
    }
  }
  if (!drawn) {
    const errored = workspaceId ? isImageErrored(workspaceId, el.assetId) : false;
    ctx.fillStyle = errored ? '#fee2e2' : '#f3f4f6';
    ctx.fillRect(el.x, el.y, el.w, el.h);
    ctx.lineWidth = 1 / z;
    ctx.strokeStyle = errored ? '#ef4444' : '#9ca3af';
    ctx.strokeRect(el.x, el.y, el.w, el.h);
    ctx.fillStyle = errored ? '#b91c1c' : '#6b7280';
    ctx.font = `12px ui-sans-serif, system-ui, sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillText(
      errored ? `Изображение не загрузилось (asset #${el.assetId})` : `Загрузка… (asset #${el.assetId})`,
      el.x + 6,
      el.y + 6,
      el.w - 12
    );
  }

  if (rotated) ctx.restore();
  ctx.globalAlpha = prevAlpha;
  strokeOutlineIfSelected(rctx, el);
}

function drawTable(el: Extract<Element, { kind: 'table' }>, rctx: RenderContext) {
  const { ctx, viewportZoom: z } = rctx;
  const prevAlpha = applyOpacity(ctx, el);
  const rotated = applyRotation(ctx, el);

  ctx.save();
  // Background fill (header column / body) — light, just for legibility.
  if (el.style.fill && el.style.fill !== 'transparent' && el.style.fill !== 'none') {
    ctx.fillStyle = el.style.fill;
    ctx.fillRect(el.x, el.y, el.w, el.h);
  }
  ctx.lineWidth = 1 / z;
  ctx.strokeStyle = el.style.stroke ?? '#9ca3af';
  ctx.strokeRect(el.x, el.y, el.w, el.h);

  const rows = Math.max(1, el.rows);
  const cols = Math.max(1, el.cols);
  const cw = el.w / cols;
  const rh = el.h / rows;

  // Header row tinted.
  ctx.fillStyle = '#f3f4f6';
  ctx.fillRect(el.x, el.y, el.w, rh);

  // Inner gridlines.
  for (let c = 1; c < cols; c += 1) {
    ctx.beginPath();
    ctx.moveTo(el.x + c * cw, el.y);
    ctx.lineTo(el.x + c * cw, el.y + el.h);
    ctx.stroke();
  }
  for (let r = 1; r < rows; r += 1) {
    ctx.beginPath();
    ctx.moveTo(el.x, el.y + r * rh);
    ctx.lineTo(el.x + el.w, el.y + r * rh);
    ctx.stroke();
  }

  // Cell text — small font, single-line truncated by max-width parameter.
  const padX = 4;
  const padY = 4;
  const fontPx = Math.max(10, Math.min(14, Math.floor(rh * 0.5)));
  ctx.font = `${fontPx}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textBaseline = 'top';
  const cells = Array.isArray(el.cells) ? el.cells : [];
  for (let r = 0; r < rows; r += 1) {
    const row = cells[r];
    if (!Array.isArray(row)) continue;
    for (let c = 0; c < cols; c += 1) {
      const value = row[c];
      if (typeof value !== 'string' || value.length === 0) continue;
      ctx.fillStyle = r === 0 ? '#111827' : '#1f2937';
      // Header is bold via prefixed font (canvas doesn't have a "bold" toggle).
      if (r === 0) {
        ctx.font = `600 ${fontPx}px ui-sans-serif, system-ui, sans-serif`;
      } else {
        ctx.font = `${fontPx}px ui-sans-serif, system-ui, sans-serif`;
      }
      const cellX = el.x + c * cw + padX;
      const cellY = el.y + r * rh + padY;
      ctx.fillText(value, cellX, cellY, cw - padX * 2);
    }
  }

  ctx.restore();
  if (rotated) ctx.restore();
  ctx.globalAlpha = prevAlpha;
  strokeOutlineIfSelected(rctx, el);
}
