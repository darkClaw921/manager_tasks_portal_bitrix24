/**
 * Pure undo helpers for workspace ops.
 *
 * Extracted from `src/hooks/useUndoRedo.ts` so the inversion math has no
 * React / Zustand dependency and can be unit-tested in `node:test`.
 */

import type { Element, WorkspaceOp, OpTransform } from '@/types/workspace';

function makeOpId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Build the inverse of an op given the pre-mutation snapshot.
 *
 * Returns `null` when we cannot construct a meaningful inverse (e.g. update
 * on a missing element). Caller should silently skip those.
 *
 * Inversion rules (kept in sync with the React hook):
 *   - add → delete by id
 *   - delete → add (one per id, using the pre-delete snapshot of each element)
 *   - update → update with pre-update field values (only fields present in patch)
 *   - transform → transform back to pre-transform x/y/w/h/rot
 *   - z → z back to previous index
 */
export function buildInverse(
  op: WorkspaceOp,
  before: Element | Element[] | undefined
): WorkspaceOp | null {
  switch (op.type) {
    case 'add':
      return {
        type: 'delete',
        ids: [op.el.id],
        opId: makeOpId(),
        v: 0,
      };

    case 'delete': {
      const list = Array.isArray(before) ? before : before ? [before] : [];
      if (list.length === 0) return null;
      return {
        type: 'add',
        el: list[0],
        opId: makeOpId(),
        v: 0,
      };
    }

    case 'update': {
      const cur = Array.isArray(before) ? before[0] : before;
      if (!cur) return null;
      const reversePatch: Record<string, unknown> = {};
      for (const key of Object.keys(op.patch ?? {})) {
        if (key === 'updatedAt') continue;
        // @ts-expect-error — index access on Element union
        reversePatch[key] = cur[key];
      }
      return {
        type: 'update',
        id: op.id,
        patch: reversePatch as Partial<Element>,
        opId: makeOpId(),
        v: 0,
      };
    }

    case 'transform': {
      const cur = Array.isArray(before) ? before[0] : before;
      if (!cur) return null;
      const reverse: OpTransform = {
        type: 'transform',
        id: op.id,
        opId: makeOpId(),
        v: 0,
      };
      if (op.xy) reverse.xy = [cur.x, cur.y];
      if (op.size) reverse.size = [cur.w, cur.h];
      if (typeof op.rot === 'number') reverse.rot = cur.rot ?? 0;
      if (!reverse.xy && !reverse.size && reverse.rot === undefined) return null;
      return reverse;
    }

    case 'z': {
      const cur = Array.isArray(before) ? before[0] : before;
      if (!cur) return null;
      return {
        type: 'z',
        id: op.id,
        index: cur.z,
        opId: makeOpId(),
        v: 0,
      };
    }

    default: {
      const _exhaustive: never = op;
      void _exhaustive;
      return null;
    }
  }
}
