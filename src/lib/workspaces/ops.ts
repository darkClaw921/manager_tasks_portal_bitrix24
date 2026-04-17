/**
 * Pure reducer for the workspace op log.
 *
 * Used in three places:
 *   1. Late-join replay on the client: load snapshot + GET /ops?since=v →
 *      `replayOps(snapshot, ops)`.
 *   2. Server-side snapshot rebuild (Phase 3 thumbnails / cron consolidation).
 *   3. Optimistic-update layer: the same logic that applies remote ops also
 *      applies our own ops before they round-trip to the server.
 *
 * Conflict resolution: last-writer-wins by per-element `updatedAt` (epoch ms).
 * The reducer trusts the value supplied on the op — for ops where there is
 * no explicit timestamp (transform/delete/z) we treat the op's local arrival
 * time as authoritative and bump `updatedAt` to it.
 *
 * Purity contract:
 *   - Never mutates input state. Returns a new object when something
 *     changed, or the same reference when the op was a no-op (so React
 *     selectors can short-circuit).
 *   - No external effects (DB, network, console.log, randomness).
 */

import type {
  Element,
  WorkspaceOp,
  WorkspaceSnapshot,
} from '@/types/workspace';

/** Plain JSON-serialisable shape that mirrors `workspace.snapshot_payload`. */
export interface WorkspaceState {
  /** id → element. Object (not Map) so JSON.stringify works without a replacer. */
  elements: Record<string, Element>;
}

/** A fresh empty state — used as the base for tests and brand-new workspaces. */
export function emptyState(): WorkspaceState {
  return { elements: {} };
}

/** Coerce a parsed snapshot payload into a normalised state. */
export function fromSnapshot(snapshot: WorkspaceSnapshot | null | undefined): WorkspaceState {
  if (!snapshot || typeof snapshot !== 'object') return emptyState();
  if (!snapshot.elements || typeof snapshot.elements !== 'object') {
    return emptyState();
  }
  // Shallow clone so callers can't mutate our reference.
  return { elements: { ...snapshot.elements } };
}

/** Inverse of `fromSnapshot`. Output is JSON-safe. */
export function toSnapshot(state: WorkspaceState): WorkspaceSnapshot {
  return { elements: { ...state.elements } };
}

/**
 * Apply a single op. Returns the same `state` reference when the op is a
 * no-op (unknown id for update/delete/z). New top-level `elements` object
 * on every change so equality checks short-circuit.
 *
 * @param state immutable input
 * @param op   wire-format op
 * @param now  optional override for the LWW timestamp; defaults to Date.now()
 */
export function applyOp(
  state: WorkspaceState,
  op: WorkspaceOp,
  now: number = Date.now()
): WorkspaceState {
  switch (op.type) {
    case 'add': {
      const el = op.el;
      if (!el || typeof el.id !== 'string' || el.id.length === 0) return state;
      const existing = state.elements[el.id];
      // LWW on (re-)add: skip if the existing element is newer than the
      // incoming one. Treat missing updatedAt as "always loses".
      if (existing && (existing.updatedAt ?? 0) > (el.updatedAt ?? 0)) {
        return state;
      }
      return {
        ...state,
        elements: { ...state.elements, [el.id]: el },
      };
    }

    case 'update': {
      const cur = state.elements[op.id];
      if (!cur) return state; // dropped — element was deleted
      const patch = op.patch ?? {};
      const patchedAt =
        typeof (patch as { updatedAt?: number }).updatedAt === 'number'
          ? (patch as { updatedAt?: number }).updatedAt!
          : now;
      // LWW: the patch must be newer than the existing element to take effect.
      if ((cur.updatedAt ?? 0) > patchedAt) return state;
      // Type narrowing: the patch is a Partial<Element>, but `cur.kind` must
      // win — never let a remote update flip the discriminator.
      const next = {
        ...cur,
        ...patch,
        kind: cur.kind,
        id: cur.id,
        updatedAt: patchedAt,
      } as Element;
      return {
        ...state,
        elements: { ...state.elements, [cur.id]: next },
      };
    }

    case 'transform': {
      const cur = state.elements[op.id];
      if (!cur) return state;
      const next: Element = { ...cur, updatedAt: now };
      let touched = false;
      if (op.xy && Array.isArray(op.xy) && op.xy.length === 2) {
        next.x = op.xy[0];
        next.y = op.xy[1];
        touched = true;
      }
      if (op.size && Array.isArray(op.size) && op.size.length === 2) {
        next.w = op.size[0];
        next.h = op.size[1];
        touched = true;
      }
      if (typeof op.rot === 'number') {
        next.rot = op.rot;
        touched = true;
      }
      if (!touched) return state;
      return {
        ...state,
        elements: { ...state.elements, [cur.id]: next },
      };
    }

    case 'delete': {
      const ids = Array.isArray(op.ids) ? op.ids : [];
      if (ids.length === 0) return state;
      let mutated = false;
      const next: Record<string, Element> = { ...state.elements };
      for (const id of ids) {
        if (id in next) {
          delete next[id];
          mutated = true;
        }
      }
      if (!mutated) return state;
      return { ...state, elements: next };
    }

    case 'z': {
      const cur = state.elements[op.id];
      if (!cur) return state;
      if (cur.z === op.index) return state;
      return {
        ...state,
        elements: {
          ...state.elements,
          [cur.id]: { ...cur, z: op.index, updatedAt: now },
        },
      };
    }

    default: {
      // Exhaustiveness check — adding a new op variant will break this line
      // until the switch is updated.
      const _exhaustive: never = op;
      void _exhaustive;
      return state;
    }
  }
}

/**
 * Fold a list of ops over a base state in order. The caller is responsible
 * for ordering by ascending op id (server's monotonic primary key) so the
 * result is deterministic across late joiners.
 *
 * Returns the same reference as `base` when no op changed anything.
 */
export function replayOps(
  base: WorkspaceState,
  ops: ReadonlyArray<WorkspaceOp>,
  now: number = Date.now()
): WorkspaceState {
  let state = base;
  for (const op of ops) {
    state = applyOp(state, op, now);
  }
  return state;
}

/**
 * Build a JSON-serialisable snapshot payload from a Map (the in-memory store
 * uses a Map keyed by id for O(1) lookups). The resulting payload is what
 * `saveSnapshot` writes into `workspaces.snapshot_payload`.
 */
export function buildSnapshot(
  elements: Map<string, Element> | Record<string, Element>
): WorkspaceSnapshot {
  if (elements instanceof Map) {
    const out: Record<string, Element> = {};
    for (const [id, el] of elements) out[id] = el;
    return { elements: out };
  }
  // Object input: shallow copy to insulate from caller mutations.
  return { elements: { ...elements } };
}

/**
 * Convenience inverse: read a stored snapshot string (TEXT column) into a
 * `WorkspaceState`. Returns an empty state for malformed input rather than
 * throwing — the canvas should still render.
 */
export function parseSnapshotPayload(payload: string | null | undefined): WorkspaceState {
  if (!payload) return emptyState();
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return emptyState();
  }
  return fromSnapshot(parsed as WorkspaceSnapshot);
}
