'use client';

/**
 * Client-side export of a workspace to PNG / PDF.
 *
 * Approach:
 *   - PNG: render the current store state into an offscreen `<canvas>` whose
 *     bbox covers ALL elements (with a small padding), then `toBlob()` and
 *     trigger a download.
 *   - PDF: same render, then embed the PNG into a single-page PDF via
 *     `pdfmake` (already in dependencies; sized to the canvas dimensions).
 *
 * Both flows are completely offline — no server round-trip.
 */

import { useWorkspaceStore } from '@/stores/workspaceStore';
import { drawElements, type RenderContext } from '@/components/workspaces/Canvas/ElementRenderer';
import type { Element } from '@/types/workspace';

const EXPORT_PADDING = 32;
/** Cap export resolution so we don't OOM on a giant board. */
const MAX_EXPORT_PX = 8000;

/**
 * Compute the bounding box that contains every element on the canvas. Returns
 * null when the workspace is empty.
 */
function computeBounds(elements: Element[]): { x: number; y: number; w: number; h: number } | null {
  if (elements.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of elements) {
    const x1 = Math.min(el.x, el.x + el.w);
    const y1 = Math.min(el.y, el.y + el.h);
    const x2 = Math.max(el.x, el.x + el.w);
    const y2 = Math.max(el.y, el.y + el.h);
    if (x1 < minX) minX = x1;
    if (y1 < minY) minY = y1;
    if (x2 > maxX) maxX = x2;
    if (y2 > maxY) maxY = y2;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * Render the current workspace into an offscreen canvas and return both the
 * canvas and its dimensions. Returns null when the workspace is empty.
 */
function renderToOffscreenCanvas(workspaceId: number | undefined): {
  canvas: HTMLCanvasElement;
  widthCss: number;
  heightCss: number;
} | null {
  const state = useWorkspaceStore.getState();
  const elements = Object.values(state.elements);
  if (elements.length === 0) return null;
  const bounds = computeBounds(elements);
  if (!bounds) return null;

  // Add a small breathing-room padding around the content.
  const padded = {
    x: bounds.x - EXPORT_PADDING,
    y: bounds.y - EXPORT_PADDING,
    w: bounds.w + EXPORT_PADDING * 2,
    h: bounds.h + EXPORT_PADDING * 2,
  };
  // Cap rendered dimensions to avoid OOM on enormous canvases.
  const widthCss = Math.min(MAX_EXPORT_PX, Math.max(1, Math.round(padded.w)));
  const heightCss = Math.min(MAX_EXPORT_PX, Math.max(1, Math.round(padded.h)));
  const dpr = Math.min(2, window.devicePixelRatio || 1);

  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(widthCss * dpr);
  canvas.height = Math.floor(heightCss * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // White background so transparent elements have something behind them.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Translate so `bounds.x/y - padding` is the canvas origin, then scale by DPR.
  ctx.setTransform(dpr, 0, 0, dpr, -padded.x * dpr, -padded.y * dpr);

  const sorted = [...elements].sort((a, b) => a.z - b.z);
  const renderCtx: RenderContext = {
    ctx,
    viewportZoom: 1,
    isSelected: () => false,
    workspaceId,
    requestRedraw: () => {
      // No async redraw — image elements that haven't loaded yet are drawn as
      // placeholders. Caller can wait for images via `waitForImagesLoaded`.
    },
  };
  drawElements(sorted, renderCtx);
  return { canvas, widthCss, heightCss };
}

/**
 * Wait for any image elements referenced on the canvas to be loaded.
 * Triggered via the renderer's `getImageForAsset` cache. Returns after a
 * small delay so the cache has a chance to populate.
 */
async function waitForImagesLoaded(workspaceId: number | undefined): Promise<void> {
  if (!workspaceId) return;
  const state = useWorkspaceStore.getState();
  const imageEls = Object.values(state.elements).filter((el) => el.kind === 'image');
  if (imageEls.length === 0) return;
  // Coarse wait: 200 ms is enough for the renderer to issue the requests
  // and most images to land from the asset cache.
  await new Promise((r) => setTimeout(r, 200));
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Free the object URL on next tick so the click handler has time to use it.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Export the current workspace as a PNG. Triggers a browser download.
 *
 * Returns true on success, false when there's nothing to export.
 */
export async function exportWorkspaceAsPng(workspaceId: number | undefined): Promise<boolean> {
  await waitForImagesLoaded(workspaceId);
  // Re-render AFTER images had a chance to load.
  const result = renderToOffscreenCanvas(workspaceId);
  if (!result) return false;
  // Render twice: the second pass picks up any images cached during the first.
  await waitForImagesLoaded(workspaceId);
  const second = renderToOffscreenCanvas(workspaceId);
  const finalCanvas = second?.canvas ?? result.canvas;
  return await new Promise<boolean>((resolve) => {
    finalCanvas.toBlob((blob) => {
      if (!blob) {
        resolve(false);
        return;
      }
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      downloadBlob(blob, `workspace-${workspaceId ?? 'export'}-${ts}.png`);
      resolve(true);
    }, 'image/png');
  });
}

/**
 * Export the current workspace as a single-page PDF.
 *
 * pdfmake is loaded dynamically because its bundles are heavy and we don't
 * need them on the initial page load.
 */
export async function exportWorkspaceAsPdf(workspaceId: number | undefined): Promise<boolean> {
  await waitForImagesLoaded(workspaceId);
  const result = renderToOffscreenCanvas(workspaceId);
  if (!result) return false;
  await waitForImagesLoaded(workspaceId);
  const second = renderToOffscreenCanvas(workspaceId);
  const finalCanvas = second?.canvas ?? result.canvas;
  const widthCss = (second ?? result).widthCss;
  const heightCss = (second ?? result).heightCss;
  const dataUrl = finalCanvas.toDataURL('image/png');
  // Lazy-import pdfmake (large bundle).
  const [{ default: pdfMake }, { default: vfs }] = await Promise.all([
    import('pdfmake/build/pdfmake.js'),
    import('pdfmake/build/vfs_fonts.js'),
  ]);
  // pdfmake expects vfs_fonts to be assigned to its vfs property.
  // The bundle exports `pdfMake.vfs` already in newer versions; assignment is a no-op there.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pdfMake as any).vfs = (vfs as any).pdfMake?.vfs ?? (vfs as any).default?.vfs ?? (pdfMake as any).vfs;

  const docDef = {
    pageSize: { width: widthCss, height: heightCss },
    pageMargins: [0, 0, 0, 0] as [number, number, number, number],
    content: [
      {
        image: dataUrl,
        width: widthCss,
      },
    ],
  };
  return await new Promise<boolean>((resolve) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc = (pdfMake as any).createPdf(docDef);
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      doc.getBlob((blob: Blob) => {
        downloadBlob(blob, `workspace-${workspaceId ?? 'export'}-${ts}.pdf`);
        resolve(true);
      });
    } catch (err) {
      console.error('[export] PDF generation failed:', err);
      resolve(false);
    }
  });
}
