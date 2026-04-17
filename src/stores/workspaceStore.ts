'use client';

/**
 * In-memory store for the live state of a single open workspace.
 *
 * Scope (mirrors `meetingStore.ts`):
 *   - `elements`     — Record<id, Element>. Plain object so JSON snapshots
 *                       work without a custom replacer.
 *   - `selection`    — Set<string> of selected element ids. Phase 1 UI only
 *                       supports single-select; the structure is ready for
 *                       Phase 3 multi-select.
 *   - `viewport`     — pan/zoom of the canvas in world coordinates.
 *   - `tool`         — currently active toolbar tool.
 *   - `styleDefaults`— defaults applied to newly-created elements.
 *   - `presence`     — remote cursors keyed by participant identity.
 *   - `currentVersion`/`pendingOps` — bookkeeping for op-log + dedup.
 *
 * Not persisted — workspace state is ephemeral per session and the truth
 * lives on the server (snapshot + op log).
 */

import { create } from 'zustand';
import type { CursorPresence, Element, ElementKind } from '@/types/workspace';
import { applyOp, parseSnapshotPayload, type WorkspaceState } from '@/lib/workspaces/ops';
import type { WorkspaceOp } from '@/types/workspace';

/** Toolbar tool. `select` is the default; the others create new elements. */
export type WorkspaceTool =
  | 'select'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'text'
  | 'sticky'
  | 'pen';

export interface ViewportState {
  /** World-coordinate of the top-left corner of the viewport. */
  x: number;
  y: number;
  /** Zoom factor: 1 = 100%. */
  zoom: number;
}

export interface StyleDefaults {
  stroke: string;
  fill: string;
  strokeWidth: number;
  opacity: number;
  fontSize: number;
}

/** Cursor + author metadata. The renderer needs name/color to label cursors. */
export interface PresenceEntry extends CursorPresence {
  identity: string;
  name: string;
  /** Last update timestamp (ms). Used to age out stale cursors. */
  ts: number;
}

/** Pending op awaiting server ack. Used for retry + dedup against echoes. */
export interface PendingOp {
  clientOpId: string;
  op: WorkspaceOp;
  /** Epoch ms when first published. */
  postedAt: number;
}

interface WorkspaceStoreState {
  elements: Record<string, Element>;
  selection: Set<string>;
  viewport: ViewportState;
  tool: WorkspaceTool;
  styleDefaults: StyleDefaults;
  presence: Record<string, PresenceEntry>;
  /** Highest server op id ack'd so far. Cursor for `?since=` requests. */
  currentVersion: number;
  /**
   * Snapshot version persisted on the server (kept separately from
   * `currentVersion` since we may save snapshots less often than we apply ops).
   */
  snapshotVersion: number;
  pendingOps: Record<string, PendingOp>;
  isLoading: boolean;

  // ==================== Element/op actions ====================
  applyOpLocal: (op: WorkspaceOp, opts?: { now?: number; pending?: boolean }) => void;
  /** Replace the entire element set (e.g. after late-join replay). */
  replaceElements: (elements: Record<string, Element>, version: number, snapshotVersion?: number) => void;
  /** Mark an op as ack'd by the server — drops it from pendingOps. */
  markOpAcked: (clientOpId: string, serverId?: number) => void;
  /** Bookkeeping: remember the highest server id we've seen so far. */
  setCurrentVersion: (version: number) => void;
  setSnapshotVersion: (version: number) => void;

  // ==================== Selection ====================
  selectElement: (id: string | null) => void;
  toggleSelectElement: (id: string) => void;
  clearSelection: () => void;

  // ==================== Tool ====================
  setTool: (tool: WorkspaceTool) => void;
  setStyleDefault: <K extends keyof StyleDefaults>(key: K, value: StyleDefaults[K]) => void;

  // ==================== Viewport ====================
  setViewport: (next: ViewportState) => void;
  pan: (dx: number, dy: number) => void;
  zoomBy: (factor: number, anchorWorld?: { x: number; y: number }) => void;

  // ==================== Presence ====================
  setPresence: (entry: PresenceEntry) => void;
  removePresence: (identity: string) => void;
  /** Drop entries older than `cutoffMs`. */
  prunePresence: (cutoffMs: number) => void;

  // ==================== Loading ====================
  setLoading: (loading: boolean) => void;

  // ==================== Reset ====================
  reset: () => void;
}

const DEFAULT_VIEWPORT: ViewportState = { x: 0, y: 0, zoom: 1 };
const DEFAULT_STYLE: StyleDefaults = {
  stroke: '#1f2937',
  fill: 'transparent',
  strokeWidth: 2,
  opacity: 1,
  fontSize: 16,
};

/** Inferred default tool per element kind — used by element creators. */
export const TOOL_TO_KIND: Partial<Record<WorkspaceTool, ElementKind>> = {
  rect: 'rect',
  ellipse: 'ellipse',
  line: 'line',
  arrow: 'arrow',
  text: 'text',
  sticky: 'sticky',
  pen: 'freehand',
};

export const useWorkspaceStore = create<WorkspaceStoreState>((set) => ({
  elements: {},
  selection: new Set<string>(),
  viewport: { ...DEFAULT_VIEWPORT },
  tool: 'select',
  styleDefaults: { ...DEFAULT_STYLE },
  presence: {},
  currentVersion: 0,
  snapshotVersion: 0,
  pendingOps: {},
  isLoading: false,

  // ==================== Element/op actions ====================

  applyOpLocal: (op, opts) =>
    set((state) => {
      const reducerState: WorkspaceState = { elements: state.elements };
      const next = applyOp(reducerState, op, opts?.now);
      const elementsChanged = next !== reducerState;
      const pendingPatch =
        opts?.pending === true
          ? {
              ...state.pendingOps,
              [op.opId]: { clientOpId: op.opId, op, postedAt: opts.now ?? Date.now() },
            }
          : state.pendingOps;
      // Drop selection ids that were deleted by this op.
      let selection = state.selection;
      if (op.type === 'delete' && selection.size > 0) {
        const removed = new Set(op.ids);
        const filtered = new Set<string>();
        for (const id of selection) if (!removed.has(id)) filtered.add(id);
        if (filtered.size !== selection.size) selection = filtered;
      }
      if (!elementsChanged && pendingPatch === state.pendingOps && selection === state.selection) {
        return state;
      }
      return {
        ...state,
        elements: elementsChanged ? next.elements : state.elements,
        pendingOps: pendingPatch,
        selection,
      };
    }),

  replaceElements: (elements, version, snapshotVersion) =>
    set((state) => ({
      ...state,
      elements: { ...elements },
      currentVersion: version,
      snapshotVersion: snapshotVersion ?? state.snapshotVersion,
      // Selection ids may no longer exist after replace — strip them.
      selection: filterSelection(state.selection, elements),
    })),

  markOpAcked: (clientOpId, serverId) =>
    set((state) => {
      if (!(clientOpId in state.pendingOps) && (serverId == null || serverId <= state.currentVersion)) {
        return state;
      }
      const nextPending = { ...state.pendingOps };
      delete nextPending[clientOpId];
      const nextVersion =
        typeof serverId === 'number' && serverId > state.currentVersion
          ? serverId
          : state.currentVersion;
      return {
        ...state,
        pendingOps: nextPending,
        currentVersion: nextVersion,
      };
    }),

  setCurrentVersion: (version) =>
    set((state) =>
      version > state.currentVersion ? { ...state, currentVersion: version } : state
    ),

  setSnapshotVersion: (version) =>
    set((state) =>
      version > state.snapshotVersion ? { ...state, snapshotVersion: version } : state
    ),

  // ==================== Selection ====================

  selectElement: (id) =>
    set((state) => {
      if (id === null) {
        if (state.selection.size === 0) return state;
        return { ...state, selection: new Set<string>() };
      }
      if (state.selection.size === 1 && state.selection.has(id)) return state;
      return { ...state, selection: new Set([id]) };
    }),

  toggleSelectElement: (id) =>
    set((state) => {
      const next = new Set(state.selection);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...state, selection: next };
    }),

  clearSelection: () =>
    set((state) =>
      state.selection.size === 0 ? state : { ...state, selection: new Set<string>() }
    ),

  // ==================== Tool ====================

  setTool: (tool) =>
    set((state) => (state.tool === tool ? state : { ...state, tool })),

  setStyleDefault: (key, value) =>
    set((state) => ({
      ...state,
      styleDefaults: { ...state.styleDefaults, [key]: value },
    })),

  // ==================== Viewport ====================

  setViewport: (next) =>
    set((state) => {
      if (
        state.viewport.x === next.x &&
        state.viewport.y === next.y &&
        state.viewport.zoom === next.zoom
      ) {
        return state;
      }
      return { ...state, viewport: next };
    }),

  pan: (dx, dy) =>
    set((state) => ({
      ...state,
      viewport: { ...state.viewport, x: state.viewport.x + dx, y: state.viewport.y + dy },
    })),

  zoomBy: (factor, anchorWorld) =>
    set((state) => {
      const next = clampZoom(state.viewport.zoom * factor);
      if (next === state.viewport.zoom) return state;
      // Zoom about anchor: keep `anchorWorld` at the same screen position.
      let { x, y } = state.viewport;
      if (anchorWorld) {
        const oldZoom = state.viewport.zoom;
        // Screen position of anchor before: (anchorWorld - viewport) * oldZoom
        // After zoom: keep that screen position constant → solve for new (x, y).
        x = anchorWorld.x - (anchorWorld.x - x) * (next / oldZoom);
        y = anchorWorld.y - (anchorWorld.y - y) * (next / oldZoom);
      }
      return { ...state, viewport: { x, y, zoom: next } };
    }),

  // ==================== Presence ====================

  setPresence: (entry) =>
    set((state) => ({
      ...state,
      presence: { ...state.presence, [entry.identity]: entry },
    })),

  removePresence: (identity) =>
    set((state) => {
      if (!(identity in state.presence)) return state;
      const next = { ...state.presence };
      delete next[identity];
      return { ...state, presence: next };
    }),

  prunePresence: (cutoffMs) =>
    set((state) => {
      let mutated = false;
      const next: Record<string, PresenceEntry> = {};
      for (const [id, entry] of Object.entries(state.presence)) {
        if (entry.ts >= cutoffMs) {
          next[id] = entry;
        } else {
          mutated = true;
        }
      }
      return mutated ? { ...state, presence: next } : state;
    }),

  // ==================== Loading ====================

  setLoading: (loading) =>
    set((state) => (state.isLoading === loading ? state : { ...state, isLoading: loading })),

  // ==================== Reset ====================

  reset: () =>
    set({
      elements: {},
      selection: new Set<string>(),
      viewport: { ...DEFAULT_VIEWPORT },
      tool: 'select',
      styleDefaults: { ...DEFAULT_STYLE },
      presence: {},
      currentVersion: 0,
      snapshotVersion: 0,
      pendingOps: {},
      isLoading: false,
    }),
}));

// ==================== Helpers ====================

function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= 0) return 1;
  return Math.min(8, Math.max(0.1, zoom));
}

function filterSelection(
  selection: Set<string>,
  elements: Record<string, Element>
): Set<string> {
  if (selection.size === 0) return selection;
  const filtered = new Set<string>();
  for (const id of selection) {
    if (id in elements) filtered.add(id);
  }
  if (filtered.size === selection.size) return selection;
  return filtered;
}

// ==================== Selectors ====================
//
// Selector hooks that take advantage of Zustand's referential-equality short
// circuit. Components import these to subscribe to slices without re-rendering
// on unrelated changes.

export const useWorkspaceTool = () => useWorkspaceStore((s) => s.tool);
export const useWorkspaceViewport = () => useWorkspaceStore((s) => s.viewport);
export const useWorkspaceStyleDefaults = () =>
  useWorkspaceStore((s) => s.styleDefaults);
export const useWorkspaceSelection = () => useWorkspaceStore((s) => s.selection);
export const useWorkspaceElements = () => useWorkspaceStore((s) => s.elements);
export const useWorkspacePresence = () => useWorkspaceStore((s) => s.presence);

/** Returns the single selected element, or null when nothing/many selected. */
export function useSelectedElement(): Element | null {
  return useWorkspaceStore((s) => {
    if (s.selection.size !== 1) return null;
    const id = s.selection.values().next().value;
    return id ? s.elements[id] ?? null : null;
  });
}

// ==================== Bootstrap helpers ====================

/**
 * Hydrate the store from a server snapshot payload. Convenience wrapper
 * used by `useWorkspaceRoom` after fetching `/api/workspaces/:id/snapshot`.
 */
export function hydrateFromSnapshot(payload: string | object | null): {
  elements: Record<string, Element>;
} {
  if (typeof payload === 'string') {
    return parseSnapshotPayload(payload);
  }
  if (payload && typeof payload === 'object') {
    const elements = (payload as { elements?: Record<string, Element> }).elements;
    return { elements: elements && typeof elements === 'object' ? { ...elements } : {} };
  }
  return { elements: {} };
}
