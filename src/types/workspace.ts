/**
 * Workspace (Excalidraw-like board) wire-format and DB types.
 *
 * Two layers:
 *   1. Domain: discriminated unions for canvas elements + ops (consumed by
 *      the canvas renderer, op reducer, LiveKit data-channel hooks).
 *   2. DB re-exports: Drizzle inferred row shapes for the five workspace_*
 *      tables so service-layer code does not have to import directly from
 *      schema.ts.
 *
 * Wire format reference: see /Users/igorgerasimov/.claude/plans/workspace-memoized-glade.md
 * section "Wire-формат операций". Topics:
 *   - "workspace.ops"    — reliable, msgpackr, mutations
 *   - "workspace.cursor" — lossy, presence (CursorPresence)
 *
 * `opId` is the client-generated UUID used for DB-side dedup
 * (UNIQUE(workspace_id, client_op_id)). `v` is the snapshotVersion the op was
 * authored against and is stored as `base_version` on the row.
 */

import type {
  Workspace as DbWorkspace,
  NewWorkspace as DbNewWorkspace,
  WorkspaceParticipant as DbWorkspaceParticipant,
  NewWorkspaceParticipant as DbNewWorkspaceParticipant,
  WorkspaceOpRow as DbWorkspaceOpRow,
  NewWorkspaceOpRow as DbNewWorkspaceOpRow,
  WorkspaceChatMessage as DbWorkspaceChatMessage,
  NewWorkspaceChatMessage as DbNewWorkspaceChatMessage,
  WorkspaceAsset as DbWorkspaceAsset,
  NewWorkspaceAsset as DbNewWorkspaceAsset,
} from '@/lib/db/schema';

// ==================== Workspace meta + DB row re-exports ====================

/** Workspace participant role. owner ≅ creator, editor mutates, viewer reads. */
export type WorkspaceRole = 'owner' | 'editor' | 'viewer';

/** LLM chat author role. `system` is reserved for future moderation messages. */
export type WorkspaceChatRole = 'user' | 'assistant' | 'system';

/** Asset origin: human upload vs. AI-generated image. */
export type WorkspaceAssetKind = 'upload' | 'ai';

export type Workspace = DbWorkspace;
export type NewWorkspace = DbNewWorkspace;

export type WorkspaceParticipant = DbWorkspaceParticipant;
export type NewWorkspaceParticipant = DbNewWorkspaceParticipant;

/**
 * Raw DB row for a persisted op. The wire-format object lives in `payload`
 * as a JSON string; service-layer code parses on read.
 */
export type WorkspaceOpRow = DbWorkspaceOpRow;
export type NewWorkspaceOpRow = DbNewWorkspaceOpRow;

export type WorkspaceChatMessage = DbWorkspaceChatMessage;
export type NewWorkspaceChatMessage = DbNewWorkspaceChatMessage;

export type WorkspaceAsset = DbWorkspaceAsset;
export type NewWorkspaceAsset = DbNewWorkspaceAsset;

// ==================== Element kinds ====================

/**
 * Discriminator for an element on the canvas.
 *
 * MVP (Phase 1) renders rect/ellipse/line/arrow/text/sticky/freehand. The
 * `image` and `table` kinds are part of the schema so reducer + persistence
 * work without changes when Phase 2 wires them up in the UI.
 */
export type ElementKind =
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'text'
  | 'sticky'
  | 'freehand'
  | 'image'
  | 'table';

/** Visual style shared by every element. All fields optional, defaults in renderer. */
export interface ElementStyle {
  /** CSS color string for outline. */
  stroke?: string;
  /** CSS color string for fill (closed shapes only). */
  fill?: string;
  /** Stroke width in canvas px (renderer scales by zoom). */
  strokeWidth?: number;
  /** [0..1]. Affects both stroke and fill. */
  opacity?: number;
}

/**
 * Common fields for every element kind. Bounding box `(x, y, w, h)` is in
 * canvas (world) coordinates. `z` is the sort order inside the workspace —
 * higher draws above. `updatedAt` is epoch ms, set by the originating client.
 */
export interface BaseElement {
  id: string; // UUID
  kind: ElementKind;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Rotation in radians around the bbox center. */
  rot?: number;
  /** Sort key for draw order. Higher draws on top. */
  z: number;
  style: ElementStyle;
  /** App user id of the original author. */
  createdBy: number;
  /** Epoch ms — last local mutation. Used by reducer's LWW. */
  updatedAt: number;
}

export interface RectElement extends BaseElement {
  kind: 'rect';
}

export interface EllipseElement extends BaseElement {
  kind: 'ellipse';
}

export interface LineElement extends BaseElement {
  kind: 'line';
}

export interface ArrowElement extends BaseElement {
  kind: 'arrow';
}

export interface TextElement extends BaseElement {
  kind: 'text';
  /** Plain UTF-8 text. Rendered as-is. */
  content: string;
  /** Font size in canvas px. */
  fontSize: number;
}

export interface StickyElement extends BaseElement {
  kind: 'sticky';
  /** Note text. Rendered with wrap. */
  content: string;
  /** Background CSS color. Falls back to a sticky-yellow default in the renderer. */
  color?: string;
}

export interface FreehandElement extends BaseElement {
  /**
   * Polyline points NORMALIZED to the bbox: each (x, y) ∈ [0..1]. Renderer
   * multiplies by (w, h). Allows drag/resize without recomputing the path.
   */
  kind: 'freehand';
  points: Array<[number, number]>;
}

export interface ImageElement extends BaseElement {
  kind: 'image';
  /** FK into workspace_assets.id. Renderer fetches via /api/workspaces/:id/assets/:assetId. */
  assetId: number;
}

export interface TableElement extends BaseElement {
  kind: 'table';
  rows: number;
  cols: number;
  /** `cells[r][c]` — plain text. Empty cells are empty strings. */
  cells: string[][];
}

/**
 * Discriminated union of every element kind. Use the type-guards below to
 * narrow safely (`if (isTextElement(el))`).
 */
export type Element =
  | RectElement
  | EllipseElement
  | LineElement
  | ArrowElement
  | TextElement
  | StickyElement
  | FreehandElement
  | ImageElement
  | TableElement;

// ==================== Type guards ====================
//
// Narrow `Element` to a specific kind. Cheap discriminator check; safe to use
// inside hot loops because v8 inlines it. Do not throw — return false on
// non-matching kinds.

export function isRectElement(el: Element): el is RectElement {
  return el.kind === 'rect';
}
export function isEllipseElement(el: Element): el is EllipseElement {
  return el.kind === 'ellipse';
}
export function isLineElement(el: Element): el is LineElement {
  return el.kind === 'line';
}
export function isArrowElement(el: Element): el is ArrowElement {
  return el.kind === 'arrow';
}
export function isTextElement(el: Element): el is TextElement {
  return el.kind === 'text';
}
export function isStickyElement(el: Element): el is StickyElement {
  return el.kind === 'sticky';
}
export function isFreehandElement(el: Element): el is FreehandElement {
  return el.kind === 'freehand';
}
export function isImageElement(el: Element): el is ImageElement {
  return el.kind === 'image';
}
export function isTableElement(el: Element): el is TableElement {
  return el.kind === 'table';
}

// ==================== Wire-format ops ====================

/**
 * Add a brand-new element. Reducer inserts unconditionally (LWW semantics:
 * a re-add with the same id replaces the existing entry).
 */
export interface OpAdd {
  type: 'add';
  el: Element;
  opId: string;
  /** snapshotVersion the client based this op on. */
  v: number;
}

/**
 * Patch a subset of an element's fields. Reducer merges shallow on top of
 * the existing element. Used for style/text/content changes — for spatial
 * mutations during drag, prefer `transform` (lossy, higher frequency).
 */
export interface OpUpdate {
  type: 'update';
  id: string;
  patch: Partial<Element>;
  opId: string;
  v: number;
}

/**
 * Spatial mutation (move/resize/rotate). Sent at high frequency during
 * drag/resize via the LOSSY data channel — final state is committed via a
 * trailing `update` op on the reliable channel. Reducer applies on best-
 * effort basis (last writer wins by `updatedAt`).
 */
export interface OpTransform {
  type: 'transform';
  id: string;
  /** New (x, y). */
  xy?: [number, number];
  /** New (w, h). */
  size?: [number, number];
  /** New rotation in radians. */
  rot?: number;
  opId: string;
  v: number;
}

/** Bulk delete by id. Missing ids are silently skipped. */
export interface OpDelete {
  type: 'delete';
  ids: string[];
  opId: string;
  v: number;
}

/**
 * Reorder a single element by setting its absolute z-index. The renderer
 * sorts on every render so insertion order is irrelevant.
 */
export interface OpZ {
  type: 'z';
  id: string;
  index: number;
  opId: string;
  v: number;
}

/**
 * Discriminated union of every op flavour. Encoded with msgpackr on the wire
 * under topic `"workspace.ops"`. Persistence stores the JSON serialisation
 * in `workspace_ops.payload`.
 */
export type WorkspaceOp = OpAdd | OpUpdate | OpTransform | OpDelete | OpZ;

// ==================== Op type guards ====================

export function isOpAdd(op: WorkspaceOp): op is OpAdd {
  return op.type === 'add';
}
export function isOpUpdate(op: WorkspaceOp): op is OpUpdate {
  return op.type === 'update';
}
export function isOpTransform(op: WorkspaceOp): op is OpTransform {
  return op.type === 'transform';
}
export function isOpDelete(op: WorkspaceOp): op is OpDelete {
  return op.type === 'delete';
}
export function isOpZ(op: WorkspaceOp): op is OpZ {
  return op.type === 'z';
}

// ==================== Cursor presence ====================

/**
 * Cursor presence broadcast on the LOSSY channel under topic
 * `"workspace.cursor"`. Coordinates are normalised to [0..1] of the local
 * viewport so receivers do not need to know the sender's window size.
 */
export interface CursorPresence {
  /** [0..1] of viewport width. */
  x: number;
  /** [0..1] of viewport height. */
  y: number;
  /** CSS color string used to render the remote cursor. */
  color: string;
}

// ==================== Snapshot payload shape ====================

/**
 * JSON shape persisted in `workspaces.snapshot_payload`. Map of element id
 * to element. We use a plain object (not Map) so JSON.stringify works with
 * no custom replacer — Map would serialise to `{}`.
 */
export interface WorkspaceSnapshot {
  elements: Record<string, Element>;
}

/** Topic constants — keep in sync with both client and server. */
export const WORKSPACE_OPS_TOPIC = 'workspace.ops';
export const WORKSPACE_CURSOR_TOPIC = 'workspace.cursor';
