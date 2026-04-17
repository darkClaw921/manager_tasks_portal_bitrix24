'use client';

/**
 * Local undo/redo for the current workspace session.
 *
 * Scope: history is kept ONLY in memory and ONLY for ops authored by the
 * current client. Remote ops (from other participants) are NOT pushed onto
 * the stack — undoing a peer's edit is a different feature (collaborative
 * undo, out-of-scope for Phase 3).
 *
 * Wire model:
 *   - When the local user commits an op via `recordLocal(op, snapshot)`,
 *     we synthesise an `inverseOp` and push it to `undoStack`.
 *   - Cmd/Ctrl+Z pops the top entry, commits the inverse, and moves the
 *     ORIGINAL op onto `redoStack`.
 *   - Cmd/Ctrl+Shift+Z (or Ctrl+Y) pops `redoStack`, re-commits the
 *     original, and pushes its inverse back onto `undoStack`.
 *   - Any new local op clears the redo stack (standard editor behaviour).
 *
 * Inversion rules:
 *   - add → delete by id
 *   - delete → add (one per id, using the pre-delete snapshot of each element)
 *   - update → update with pre-update field values (only fields present in patch)
 *   - transform → transform back to pre-transform x/y/w/h/rot
 *   - z → z back to previous index
 *
 * If a snapshot is missing (e.g. element already gone), the inversion is
 * skipped — undo becomes a no-op for that operation, which is the safest
 * fallback in a multi-user scenario.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { buildInverse as buildInversePure } from '@/lib/workspaces/undo';
import type {
  Element,
  WorkspaceOp,
  OpAdd,
  OpUpdate,
  OpTransform,
  OpDelete,
  OpZ,
} from '@/types/workspace';


/** Bookkeeping: an inverse and the original it inverts (for redo). */
interface HistoryEntry {
  /** The op that, when applied, undoes the original. */
  inverse: WorkspaceOp;
  /** The op the user originally committed. Re-applied on redo. */
  original: WorkspaceOp;
}

const MAX_HISTORY = 50;

/**
 * Distributive Omit so the discriminated union keeps `el`/`ids`/etc fields.
 * Mirrors `WorkspaceOpInput` shape used by `commitOp` in `useWorkspaceOps`.
 */
type WorkspaceOpInput =
  | (Omit<OpAdd, 'opId' | 'v'> & { opId?: string; v?: number })
  | (Omit<OpUpdate, 'opId' | 'v'> & { opId?: string; v?: number })
  | (Omit<OpTransform, 'opId' | 'v'> & { opId?: string; v?: number })
  | (Omit<OpDelete, 'opId' | 'v'> & { opId?: string; v?: number })
  | (Omit<OpZ, 'opId' | 'v'> & { opId?: string; v?: number });

export interface UseUndoRedoOptions {
  /**
   * The local user's `commitOp`. The hook calls this to apply an inverse
   * during undo (and the original during redo). The op input drops `opId/v`
   * so the underlying hook generates fresh bookkeeping for each apply.
   */
  commitOp: (op: WorkspaceOpInput) => string;
}

export interface UseUndoRedoResult {
  /**
   * Record a freshly-committed local op. Caller MUST pass the pre-mutation
   * element snapshot so we can synthesise an inverse:
   *   - For `update`/`transform`/`z`: the element BEFORE the patch was applied.
   *   - For `add`: snapshot is unused (inverse is a delete by id).
   *   - For `delete`: pass the elements that existed BEFORE the delete.
   */
  recordLocal: (op: WorkspaceOp, opts?: { before?: Element | Element[] }) => void;
  /** Pop top of `undoStack`, commit inverse. No-op when empty. */
  undo: () => void;
  /** Pop top of `redoStack`, re-commit original. No-op when empty. */
  redo: () => void;
  /** Clear both stacks (e.g. on workspace switch). */
  clear: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

/** Re-export the pure inverse builder so existing callers keep working. */
export const buildInverse = buildInversePure;

/**
 * Strip `opId`/`v` from an op so it can be passed to `commitOp`. The downstream
 * hook regenerates bookkeeping fields when re-applying (so the new op is treated
 * as a fresh local op, not a duplicate of the one we just inverted).
 */
function toCommitInput(op: WorkspaceOp): WorkspaceOpInput {
  // `opId`/`v` are present on every op. The downstream `commitOp` mints fresh
  // values when they're absent, so just drop them here.
  // We use a structural cast — the discriminated union is preserved.
  switch (op.type) {
    case 'add':
      return { type: 'add', el: op.el };
    case 'update':
      return { type: 'update', id: op.id, patch: op.patch };
    case 'transform': {
      const { type, id, xy, size, rot } = op;
      return { type, id, ...(xy ? { xy } : {}), ...(size ? { size } : {}), ...(rot !== undefined ? { rot } : {}) };
    }
    case 'delete':
      return { type: 'delete', ids: op.ids };
    case 'z':
      return { type: 'z', id: op.id, index: op.index };
  }
}

export function useUndoRedo({ commitOp }: UseUndoRedoOptions): UseUndoRedoResult {
  const undoStackRef = useRef<HistoryEntry[]>([]);
  const redoStackRef = useRef<HistoryEntry[]>([]);
  // React state mirror so consumers (toolbar buttons) can disable themselves.
  const [counters, setCounters] = useState({ undo: 0, redo: 0 });
  /** Set to true while the hook is itself dispatching ops; prevents recursion
   *  when the parent's commit handler also calls `recordLocal`. */
  const replayingRef = useRef(false);

  const sync = useCallback(() => {
    setCounters({ undo: undoStackRef.current.length, redo: redoStackRef.current.length });
  }, []);

  const recordLocal = useCallback<UseUndoRedoResult['recordLocal']>(
    (op, opts) => {
      // Skip ops we authored as part of an undo/redo replay.
      if (replayingRef.current) return;
      const inverse = buildInverse(op, opts?.before);
      if (!inverse) return;
      undoStackRef.current.push({ inverse, original: op });
      // Cap the stack — drop the oldest entry.
      if (undoStackRef.current.length > MAX_HISTORY) {
        undoStackRef.current.shift();
      }
      // Any fresh local op invalidates the redo stack.
      if (redoStackRef.current.length > 0) {
        redoStackRef.current.length = 0;
      }
      sync();
    },
    [sync]
  );

  const undo = useCallback(() => {
    const entry = undoStackRef.current.pop();
    if (!entry) return;
    replayingRef.current = true;
    try {
      commitOp(toCommitInput(entry.inverse));
    } finally {
      replayingRef.current = false;
    }
    redoStackRef.current.push(entry);
    if (redoStackRef.current.length > MAX_HISTORY) {
      redoStackRef.current.shift();
    }
    sync();
  }, [commitOp, sync]);

  const redo = useCallback(() => {
    const entry = redoStackRef.current.pop();
    if (!entry) return;
    replayingRef.current = true;
    try {
      commitOp(toCommitInput(entry.original));
    } finally {
      replayingRef.current = false;
    }
    undoStackRef.current.push(entry);
    if (undoStackRef.current.length > MAX_HISTORY) {
      undoStackRef.current.shift();
    }
    sync();
  }, [commitOp, sync]);

  const clear = useCallback(() => {
    undoStackRef.current.length = 0;
    redoStackRef.current.length = 0;
    sync();
  }, [sync]);

  // ==================== Keyboard bindings ====================
  // Cmd+Z (macOS) / Ctrl+Z elsewhere → undo
  // Cmd+Shift+Z / Ctrl+Y / Ctrl+Shift+Z → redo
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Skip when focus is in an input/textarea/contentEditable.
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);

  return useMemo(
    () => ({
      recordLocal,
      undo,
      redo,
      clear,
      canUndo: counters.undo > 0,
      canRedo: counters.redo > 0,
    }),
    [recordLocal, undo, redo, clear, counters.undo, counters.redo]
  );
}

/**
 * Helper: snapshot an element from the store. Returns a defensive shallow copy
 * so subsequent mutations to the live state don't affect the captured value.
 */
export function snapshotElement(id: string): Element | undefined {
  const el = useWorkspaceStore.getState().elements[id];
  return el ? ({ ...el } as Element) : undefined;
}

/**
 * Helper: snapshot multiple elements (e.g. before a bulk delete). Missing ids
 * are silently skipped so the resulting array can be empty.
 */
export function snapshotElements(ids: ReadonlyArray<string>): Element[] {
  const els = useWorkspaceStore.getState().elements;
  const out: Element[] = [];
  for (const id of ids) {
    const el = els[id];
    if (el) out.push({ ...el } as Element);
  }
  return out;
}
