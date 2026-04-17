/**
 * Server-side workspace thumbnail generator.
 *
 * Produces a small PNG preview of a workspace by:
 *   1. Loading the persisted snapshot payload.
 *   2. Computing the bounding box of every element.
 *   3. Rendering a simplified SVG (rect / ellipse / line / arrow / text /
 *      sticky / freehand / table / image-placeholder) scaled into the
 *      target dimensions.
 *   4. Rasterising the SVG to PNG with sharp (already a transitive
 *      dependency via Next.js — no extra heavy install needed).
 *
 * Why SVG-then-sharp instead of headless Chrome / @napi-rs/canvas?
 *   - sharp ships with libvips and renders SVG to PNG natively.
 *   - No Chromium binary is required at deploy time.
 *   - The renderer is intentionally simple — we trade pixel-perfect parity
 *     with the live Excalidraw-style canvas for fast, dependency-light
 *     server-side rendering. Thumbnails are previews, not exports.
 *
 * Output:
 *   - File path returned: `<storageRoot>/<workspaceId>.png`. The caller is
 *     expected to persist this path on `workspaces.thumbnailPath` so the
 *     listing page can serve it via the auth-gated route.
 */

import path from 'path';
import fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import { db } from '@/lib/db';
import { workspaces } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getSnapshot } from './workspaces';
import { parseSnapshotPayload } from './ops';
import type { Element } from '@/types/workspace';

/** Target output dimensions. 16:9 with sensible defaults. */
const THUMB_W = 480;
const THUMB_H = 320;

/** Storage root — tests can override via env. */
function storageRoot(): string {
  const fromEnv = process.env.WORKSPACE_THUMBNAILS_DIR;
  if (fromEnv) return fromEnv;
  return path.join(process.cwd(), 'data', 'workspace-thumbnails');
}

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/**
 * Compute bounding box of all elements. Returns null when the workspace is
 * empty (caller should skip thumbnail generation rather than render a blank).
 */
function computeBounds(elements: Element[]): {
  x: number;
  y: number;
  w: number;
  h: number;
} | null {
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

/** Lightweight HTML/XML attribute escape. */
function esc(s: string): string {
  return s.replace(/[<>&"']/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '"': return '&quot;';
      case "'": return '&apos;';
      default: return c;
    }
  });
}

/**
 * Build an SVG document representing the workspace's current snapshot. The
 * viewBox is centred on the content bbox with a small padding so nothing is
 * clipped at the edges.
 *
 * Renders:
 *   - rect / ellipse: stroke + fill from the element style.
 *   - line / arrow: simple line; arrowhead omitted for thumbnail.
 *   - text / sticky: short content snippet, font size scaled to bbox.
 *   - freehand: polyline from normalised points.
 *   - image: placeholder grey rectangle (we don't fetch asset files server-side).
 *   - table: outline only.
 */
function elementsToSvg(elements: Element[], width: number, height: number): string {
  const bounds = computeBounds(elements);
  const padding = 16;
  const viewBox = bounds
    ? {
        x: bounds.x - padding,
        y: bounds.y - padding,
        w: Math.max(1, bounds.w + padding * 2),
        h: Math.max(1, bounds.h + padding * 2),
      }
    : { x: 0, y: 0, w: width, h: height };

  // Sort by z so painters' algorithm matches the live canvas.
  const sorted = [...elements].sort((a, b) => a.z - b.z);

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}" preserveAspectRatio="xMidYMid meet">`
  );
  // White background.
  parts.push(`<rect x="${viewBox.x}" y="${viewBox.y}" width="${viewBox.w}" height="${viewBox.h}" fill="#ffffff"/>`);

  for (const el of sorted) {
    const stroke = el.style?.stroke ?? '#1f2937';
    const fill = el.style?.fill && el.style.fill !== 'transparent' ? el.style.fill : 'none';
    const sw = el.style?.strokeWidth ?? 2;
    const opacity = el.style?.opacity ?? 1;
    const transform = el.rot ? ` transform="rotate(${(el.rot * 180) / Math.PI} ${el.x + el.w / 2} ${el.y + el.h / 2})"` : '';
    switch (el.kind) {
      case 'rect':
        parts.push(
          `<rect x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" stroke="${stroke}" fill="${fill}" stroke-width="${sw}" opacity="${opacity}"${transform}/>`
        );
        break;
      case 'ellipse':
        parts.push(
          `<ellipse cx="${el.x + el.w / 2}" cy="${el.y + el.h / 2}" rx="${el.w / 2}" ry="${el.h / 2}" stroke="${stroke}" fill="${fill}" stroke-width="${sw}" opacity="${opacity}"${transform}/>`
        );
        break;
      case 'line':
      case 'arrow':
        parts.push(
          `<line x1="${el.x}" y1="${el.y}" x2="${el.x + el.w}" y2="${el.y + el.h}" stroke="${stroke}" stroke-width="${sw}" opacity="${opacity}"${transform}/>`
        );
        break;
      case 'text': {
        const content = el.content ?? '';
        const fontSize = (el as { fontSize?: number }).fontSize ?? 16;
        const lines = content.split('\n').slice(0, 3);
        const lineH = fontSize * 1.2;
        for (let i = 0; i < lines.length; i += 1) {
          parts.push(
            `<text x="${el.x}" y="${el.y + fontSize + i * lineH}" fill="${stroke}" font-size="${fontSize}" font-family="ui-sans-serif, system-ui, sans-serif" opacity="${opacity}">${esc(lines[i])}</text>`
          );
        }
        break;
      }
      case 'sticky': {
        const bg = (el as { color?: string }).color ?? '#fef08a';
        parts.push(
          `<rect x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" fill="${bg}" stroke="${stroke}" stroke-width="${sw}" opacity="${opacity}"${transform}/>`
        );
        const content = el.content ?? '';
        const fontSize = 14;
        const lines = content.split('\n').slice(0, 3);
        const lineH = fontSize * 1.2;
        for (let i = 0; i < lines.length; i += 1) {
          parts.push(
            `<text x="${el.x + 6}" y="${el.y + fontSize + 4 + i * lineH}" fill="#1f2937" font-size="${fontSize}" font-family="ui-sans-serif, system-ui, sans-serif">${esc(lines[i])}</text>`
          );
        }
        break;
      }
      case 'freehand': {
        const pts = (el as { points?: Array<[number, number]> }).points ?? [];
        if (pts.length < 2) break;
        const polyPts = pts
          .map((p) => `${el.x + p[0] * el.w},${el.y + p[1] * el.h}`)
          .join(' ');
        parts.push(
          `<polyline points="${polyPts}" stroke="${stroke}" fill="none" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"${transform}/>`
        );
        break;
      }
      case 'image':
        // Asset bytes aren't loaded — render a placeholder block.
        parts.push(
          `<rect x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" fill="#e5e7eb" stroke="#9ca3af" stroke-width="1" opacity="${opacity}"${transform}/>`
        );
        parts.push(
          `<text x="${el.x + el.w / 2}" y="${el.y + el.h / 2}" text-anchor="middle" fill="#6b7280" font-size="12" font-family="ui-sans-serif, system-ui, sans-serif">[image]</text>`
        );
        break;
      case 'table': {
        const tbl = el as { rows?: number; cols?: number; cells?: string[][] };
        const rows = tbl.rows ?? 0;
        const cols = tbl.cols ?? 0;
        parts.push(
          `<rect x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" fill="#ffffff" stroke="${stroke}" stroke-width="${sw}" opacity="${opacity}"${transform}/>`
        );
        if (rows > 0 && cols > 0) {
          const colW = el.w / cols;
          const rowH = el.h / rows;
          for (let r = 1; r < rows; r += 1) {
            parts.push(
              `<line x1="${el.x}" y1="${el.y + r * rowH}" x2="${el.x + el.w}" y2="${el.y + r * rowH}" stroke="${stroke}" stroke-width="0.5"/>`
            );
          }
          for (let c = 1; c < cols; c += 1) {
            parts.push(
              `<line x1="${el.x + c * colW}" y1="${el.y}" x2="${el.x + c * colW}" y2="${el.y + el.h}" stroke="${stroke}" stroke-width="0.5"/>`
            );
          }
        }
        break;
      }
    }
  }

  parts.push('</svg>');
  return parts.join('');
}

/**
 * Generate a thumbnail for a workspace and persist it to disk + DB.
 *
 * Returns the absolute file path written. When the workspace is empty (no
 * elements) the existing thumbnail file is removed and the DB column is
 * cleared so callers fall back to a placeholder.
 */
export async function generateThumbnail(workspaceId: number): Promise<string | null> {
  const snap = getSnapshot(workspaceId);
  if (!snap) return null;

  // The DB column stores a JSON string. Parse leniently — bad JSON renders
  // as an empty thumbnail rather than throwing.
  const state = parseSnapshotPayload(snap.payload);
  const elements: Element[] = Object.values(state.elements);

  const root = storageRoot();
  ensureDir(root);
  const filePath = path.join(root, `${workspaceId}.png`);

  if (elements.length === 0) {
    // Clear any prior thumbnail.
    try {
      await fs.unlink(filePath);
    } catch {
      // not present — fine
    }
    db
      .update(workspaces)
      .set({ thumbnailPath: null, updatedAt: new Date().toISOString() })
      .where(eq(workspaces.id, workspaceId))
      .run();
    return null;
  }

  const svg = elementsToSvg(elements, THUMB_W, THUMB_H);
  // Dynamic-import sharp so this module loads cheaply when the route never
  // generates a thumbnail.
  const sharp = (await import('sharp')).default;
  const png = await sharp(Buffer.from(svg))
    .resize(THUMB_W, THUMB_H, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toBuffer();
  await fs.writeFile(filePath, png);
  db
    .update(workspaces)
    .set({ thumbnailPath: filePath, updatedAt: new Date().toISOString() })
    .where(eq(workspaces.id, workspaceId))
    .run();
  return filePath;
}

/**
 * Resolve the on-disk thumbnail path for a workspace. Returns null if not
 * found or the file no longer exists.
 */
export async function getThumbnailPath(workspaceId: number): Promise<string | null> {
  const row = db
    .select({ path: workspaces.thumbnailPath })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .get();
  if (!row?.path) return null;
  // Defensive containment guard — never serve files outside the storage root.
  const root = storageRoot();
  const resolved = path.resolve(row.path);
  if (!resolved.startsWith(path.resolve(root))) return null;
  if (!existsSync(resolved)) return null;
  return resolved;
}
