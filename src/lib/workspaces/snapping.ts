/**
 * Pure snapping math for the workspace canvas.
 *
 * Used during drag/resize to nudge the moving bbox onto neighbouring edges,
 * centers, or a fixed grid. Operates on bboxes (`{x,y,w,h}`) — the caller is
 * responsible for converting to/from concrete element shapes.
 *
 * Threshold semantics:
 *   - The threshold is supplied in WORLD units. Callers convert from screen
 *     px via `thresholdPx / viewport.zoom` so the magnetic distance feels
 *     consistent across zoom levels.
 *   - `null` threshold disables snapping entirely (e.g. when Alt is held).
 *
 * Output:
 *   - `snap` returns the adjusted bbox plus an array of `Guide` lines that
 *     should be drawn over the canvas to indicate which neighbours we
 *     aligned to. The caller renders the guides for as long as the bbox
 *     remains snapped; on the next pointer move the guides are recomputed.
 */

export interface Bbox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A neighbour bbox the moving element might snap against. */
export interface SnapTarget extends Bbox {
  id: string;
}

/**
 * A snap-line guide rendered on the overlay. `axis: 'v'` is a vertical line
 * (constant `x`); `axis: 'h'` is horizontal (constant `y`). The endpoints
 * span from the moving bbox to the target bbox so the user sees what they
 * aligned to.
 */
export interface Guide {
  axis: 'v' | 'h';
  /** World coord of the line. */
  pos: number;
  /** World coord of the start of the line (along the perpendicular axis). */
  start: number;
  /** World coord of the end. */
  end: number;
}

export interface SnapOptions {
  /** Snap distance in WORLD units. Use `screenPx / viewport.zoom`. */
  threshold: number;
  /** Optional grid step (world units). When set, also snap edges to grid. */
  gridStep?: number;
}

export interface SnapResult {
  bbox: Bbox;
  guides: Guide[];
}

/**
 * Snap a moving bbox against `targets`. Returns the (possibly adjusted) bbox
 * and the guide lines for any snap that took effect.
 *
 * Snap candidates per axis:
 *   - left edge (x), right edge (x + w), horizontal center (x + w/2)
 *   - top edge (y), bottom edge (y + h), vertical center (y + h/2)
 *
 * For each candidate we look at every target's matching edges/center and
 * pick the closest one within `threshold`. Both axes are independent, so a
 * single drag can snap on x AND y simultaneously.
 */
export function snap(
  bbox: Bbox,
  targets: ReadonlyArray<SnapTarget>,
  opts: SnapOptions
): SnapResult {
  const { threshold } = opts;
  if (threshold <= 0) return { bbox, guides: [] };

  const movX = {
    left: bbox.x,
    center: bbox.x + bbox.w / 2,
    right: bbox.x + bbox.w,
  };
  const movY = {
    top: bbox.y,
    center: bbox.y + bbox.h / 2,
    bottom: bbox.y + bbox.h,
  };

  // Best snap per axis: the candidate (`offset` to apply, `pos` of the line).
  let bestX: { delta: number; line: number; targetTop: number; targetBottom: number } | null = null;
  let bestY: { delta: number; line: number; targetLeft: number; targetRight: number } | null = null;

  for (const t of targets) {
    const tX = { left: t.x, center: t.x + t.w / 2, right: t.x + t.w };
    const tY = { top: t.y, center: t.y + t.h / 2, bottom: t.y + t.h };

    // X-axis: try every (movX, tX) combination.
    for (const movKey of ['left', 'center', 'right'] as const) {
      const movVal = movX[movKey];
      for (const tKey of ['left', 'center', 'right'] as const) {
        const tVal = tX[tKey];
        const dist = Math.abs(movVal - tVal);
        if (dist > threshold) continue;
        const delta = tVal - movVal;
        if (!bestX || Math.abs(delta) < Math.abs(bestX.delta)) {
          bestX = {
            delta,
            line: tVal,
            // Span the guide from the topmost edge to bottommost edge of the
            // two bboxes so it visually connects them.
            targetTop: Math.min(bbox.y, t.y),
            targetBottom: Math.max(bbox.y + bbox.h, t.y + t.h),
          };
        }
      }
    }

    // Y-axis: try every (movY, tY) combination.
    for (const movKey of ['top', 'center', 'bottom'] as const) {
      const movVal = movY[movKey];
      for (const tKey of ['top', 'center', 'bottom'] as const) {
        const tVal = tY[tKey];
        const dist = Math.abs(movVal - tVal);
        if (dist > threshold) continue;
        const delta = tVal - movVal;
        if (!bestY || Math.abs(delta) < Math.abs(bestY.delta)) {
          bestY = {
            delta,
            line: tVal,
            targetLeft: Math.min(bbox.x, t.x),
            targetRight: Math.max(bbox.x + bbox.w, t.x + t.w),
          };
        }
      }
    }
  }

  // Grid snap: also consider `gridStep`. We only override the per-axis best
  // when grid is closer than the neighbour snap.
  if (opts.gridStep && opts.gridStep > 0) {
    const g = opts.gridStep;
    for (const movKey of ['left', 'center', 'right'] as const) {
      const movVal = movX[movKey];
      const snapped = Math.round(movVal / g) * g;
      const delta = snapped - movVal;
      if (Math.abs(delta) <= threshold && (!bestX || Math.abs(delta) < Math.abs(bestX.delta))) {
        bestX = {
          delta,
          line: snapped,
          targetTop: bbox.y - 20,
          targetBottom: bbox.y + bbox.h + 20,
        };
      }
    }
    for (const movKey of ['top', 'center', 'bottom'] as const) {
      const movVal = movY[movKey];
      const snapped = Math.round(movVal / g) * g;
      const delta = snapped - movVal;
      if (Math.abs(delta) <= threshold && (!bestY || Math.abs(delta) < Math.abs(bestY.delta))) {
        bestY = {
          delta,
          line: snapped,
          targetLeft: bbox.x - 20,
          targetRight: bbox.x + bbox.w + 20,
        };
      }
    }
  }

  let outX = bbox.x;
  let outY = bbox.y;
  const guides: Guide[] = [];

  if (bestX) {
    outX = bbox.x + bestX.delta;
    guides.push({
      axis: 'v',
      pos: bestX.line,
      start: bestX.targetTop,
      end: bestX.targetBottom,
    });
  }
  if (bestY) {
    outY = bbox.y + bestY.delta;
    guides.push({
      axis: 'h',
      pos: bestY.line,
      start: bestY.targetLeft,
      end: bestY.targetRight,
    });
  }

  return {
    bbox: { x: outX, y: outY, w: bbox.w, h: bbox.h },
    guides,
  };
}

/**
 * Convenience: snap the moving bbox AGAINST the rest of the workspace
 * elements. Filters out the moving element(s) from candidates by id.
 */
export function snapAgainstElements(
  bbox: Bbox,
  elements: Record<string, { id: string; x: number; y: number; w: number; h: number }>,
  excludeIds: ReadonlySet<string>,
  opts: SnapOptions
): SnapResult {
  const targets: SnapTarget[] = [];
  for (const id in elements) {
    if (excludeIds.has(id)) continue;
    const el = elements[id];
    targets.push({ id, x: el.x, y: el.y, w: el.w, h: el.h });
  }
  return snap(bbox, targets, opts);
}
