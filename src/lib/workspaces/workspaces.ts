/**
 * Workspaces service layer: CRUD + snapshot/op-log helpers.
 *
 * Mirrors `src/lib/meetings/meetings.ts` in spirit:
 *   - All access checks are deliberately delegated to `lib/workspaces/access.ts`
 *     and the route layer. This module assumes the caller has already
 *     authorised the user.
 *   - Lifecycle pieces (creation, snapshot save, op append) run inside
 *     `db.transaction(...)` so a partial failure cannot leave the row half-
 *     written (e.g. workspace exists but no owner participant row).
 *   - `appendOp` is idempotent on `UNIQUE(workspaceId, clientOpId)` —
 *     re-POSTing the same op (after a flaky network) returns the existing
 *     row instead of throwing. This is what makes the "dual-publish" pattern
 *     (LiveKit + REST) safe.
 */

import { db } from '@/lib/db';
import {
  workspaces,
  workspaceParticipants,
  workspaceOps,
  meetings,
  users,
} from '@/lib/db/schema';
import { and, asc, desc, eq, gt, inArray, lte } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type {
  Workspace,
  WorkspaceParticipant,
  WorkspaceOpRow,
  WorkspaceRole,
  WorkspaceOp,
} from '@/types/workspace';

// ==================== Inputs ====================

export interface CreateWorkspaceInput {
  ownerId: number;
  title: string;
  /** Optional anchor — when provided, the workspace is linked to this meeting. */
  meetingId?: number | null;
}

export interface UpdateWorkspaceInput {
  title?: string;
  meetingId?: number | null;
}

export interface WorkspaceDetail extends Workspace {
  participants: Array<WorkspaceParticipant & { userName: string | null }>;
}

export interface SnapshotSlice {
  version: number;
  payload: string;
  updatedAt: string | null;
}

// ==================== Internals ====================

/** Whether `meetingId` exists in the meetings table. */
function meetingExists(meetingId: number): boolean {
  const row = db
    .select({ id: meetings.id })
    .from(meetings)
    .where(eq(meetings.id, meetingId))
    .get();
  return Boolean(row);
}

// ==================== Mutations ====================

/**
 * Create a new workspace. Atomically inserts the row and the owner-as-
 * participant pivot. The room name is a fresh UUID — guaranteed unique by
 * the unique index on `workspaces.room_name`.
 */
export function createWorkspace(input: CreateWorkspaceInput): Workspace {
  const title = input.title?.trim();
  if (!title) {
    throw new Error('createWorkspace: title must not be empty');
  }
  if (!Number.isInteger(input.ownerId) || input.ownerId <= 0) {
    throw new Error('createWorkspace: ownerId must be a positive integer');
  }
  if (input.meetingId != null) {
    if (!Number.isInteger(input.meetingId) || input.meetingId <= 0) {
      throw new Error('createWorkspace: meetingId must be a positive integer when provided');
    }
    if (!meetingExists(input.meetingId)) {
      throw new Error(`createWorkspace: meeting ${input.meetingId} does not exist`);
    }
  }

  const roomName = randomUUID();

  // better-sqlite3 transactions are synchronous; we keep both writes inside.
  return db.transaction((tx) => {
    const inserted = tx
      .insert(workspaces)
      .values({
        ownerId: input.ownerId,
        title,
        roomName,
        meetingId: input.meetingId ?? null,
      })
      .returning()
      .get();

    tx.insert(workspaceParticipants)
      .values({
        workspaceId: inserted.id,
        userId: input.ownerId,
        role: 'owner',
      })
      .run();

    return inserted;
  });
}

/**
 * Patch a workspace's mutable fields. Returns the updated row, or `null` if
 * the id does not exist. Does not enforce ownership — the caller (route
 * layer) is responsible for that check via `isOwner`.
 *
 * Setting `meetingId` to null detaches the workspace from any meeting.
 */
export function updateWorkspace(
  id: number,
  patch: UpdateWorkspaceInput
): Workspace | null {
  const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (patch.title !== undefined) {
    const trimmed = patch.title.trim();
    if (!trimmed) throw new Error('updateWorkspace: title must not be empty');
    update.title = trimmed;
  }
  if (patch.meetingId !== undefined) {
    if (patch.meetingId === null) {
      update.meetingId = null;
    } else {
      if (!Number.isInteger(patch.meetingId) || patch.meetingId <= 0) {
        throw new Error('updateWorkspace: meetingId must be a positive integer');
      }
      if (!meetingExists(patch.meetingId)) {
        throw new Error(`updateWorkspace: meeting ${patch.meetingId} does not exist`);
      }
      update.meetingId = patch.meetingId;
    }
  }

  // No mutable fields besides updatedAt? — cheap fast path: just return current.
  if (Object.keys(update).length === 1) {
    return getWorkspace(id);
  }

  const updated = db
    .update(workspaces)
    .set(update)
    .where(eq(workspaces.id, id))
    .returning()
    .get();

  return updated ?? null;
}

/**
 * Hard-delete a workspace. CASCADE foreign keys will sweep participants,
 * ops, chat messages, and assets. Returns true if a row was removed.
 */
export function deleteWorkspace(id: number): boolean {
  const res = db.delete(workspaces).where(eq(workspaces.id, id)).run();
  return res.changes > 0;
}

// ==================== Queries ====================

export function getWorkspace(id: number): Workspace | null {
  const row = db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, id))
    .get();
  return row ?? null;
}

/**
 * Workspace + joined participant list with display names. Returns null if
 * the workspace does not exist.
 */
export function getWorkspaceDetail(id: number): WorkspaceDetail | null {
  const ws = getWorkspace(id);
  if (!ws) return null;

  const rows = db
    .select({
      participant: workspaceParticipants,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(workspaceParticipants)
    .leftJoin(users, eq(users.id, workspaceParticipants.userId))
    .where(eq(workspaceParticipants.workspaceId, id))
    .orderBy(asc(workspaceParticipants.joinedAt))
    .all();

  const participants = rows.map((r) => ({
    ...r.participant,
    userName:
      r.firstName && r.lastName ? `${r.firstName} ${r.lastName}`.trim() : null,
  }));

  return { ...ws, participants };
}

/**
 * Workspaces visible to a user: owned + listed as participant. Newest first.
 */
export function listWorkspacesForUser(userId: number): Workspace[] {
  const idSet = new Set<number>();

  const owned = db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.ownerId, userId))
    .all();
  for (const r of owned) idSet.add(r.id);

  const joined = db
    .select({ workspaceId: workspaceParticipants.workspaceId })
    .from(workspaceParticipants)
    .where(eq(workspaceParticipants.userId, userId))
    .all();
  for (const r of joined) idSet.add(r.workspaceId);

  if (idSet.size === 0) return [];

  const rows = db
    .select()
    .from(workspaces)
    .where(inArray(workspaces.id, Array.from(idSet)))
    .all();

  rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return rows;
}

/** Workspaces attached to a particular meeting. */
export function listWorkspacesForMeeting(meetingId: number): Workspace[] {
  return db
    .select()
    .from(workspaces)
    .where(eq(workspaces.meetingId, meetingId))
    .orderBy(desc(workspaces.createdAt))
    .all();
}

// ==================== Participants ====================

/**
 * Idempotent participant upsert. Returns existing row unchanged if present,
 * never downgrades the role.
 */
export function addParticipant(
  workspaceId: number,
  userId: number,
  role: WorkspaceRole = 'editor'
): WorkspaceParticipant {
  const existing = db
    .select()
    .from(workspaceParticipants)
    .where(
      and(
        eq(workspaceParticipants.workspaceId, workspaceId),
        eq(workspaceParticipants.userId, userId)
      )
    )
    .get();

  if (existing) return existing;

  return db
    .insert(workspaceParticipants)
    .values({ workspaceId, userId, role })
    .returning()
    .get();
}

/**
 * Remove a participant. Refuses to remove the owner (owner removal happens
 * via `deleteWorkspace`). Returns true if a row was removed.
 */
export function removeParticipant(workspaceId: number, userId: number): boolean {
  const ws = db
    .select({ ownerId: workspaces.ownerId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .get();
  if (!ws) return false;
  if (ws.ownerId === userId) {
    throw new Error('Cannot remove the workspace owner');
  }

  const res = db
    .delete(workspaceParticipants)
    .where(
      and(
        eq(workspaceParticipants.workspaceId, workspaceId),
        eq(workspaceParticipants.userId, userId)
      )
    )
    .run();
  return res.changes > 0;
}

/**
 * Touch the participant's `lastSeenAt`. Cheap presence indicator used by
 * the future Phase 3 polish to display "active 2 min ago" labels.
 */
export function markParticipantSeen(workspaceId: number, userId: number): void {
  db.update(workspaceParticipants)
    .set({ lastSeenAt: new Date().toISOString() })
    .where(
      and(
        eq(workspaceParticipants.workspaceId, workspaceId),
        eq(workspaceParticipants.userId, userId)
      )
    )
    .run();
}

// ==================== Snapshot ====================

/**
 * Read the current persisted snapshot. Returns version 0 + `'{}'` payload
 * for a newly-created workspace that has not yet been saved.
 */
export function getSnapshot(workspaceId: number): SnapshotSlice | null {
  const row = db
    .select({
      version: workspaces.snapshotVersion,
      payload: workspaces.snapshotPayload,
      updatedAt: workspaces.snapshotUpdatedAt,
    })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .get();
  if (!row) return null;
  return {
    version: row.version,
    payload: row.payload,
    updatedAt: row.updatedAt,
  };
}

/**
 * Persist a fresh snapshot AND truncate the op log up to the high-water
 * mark. The "version" we store is the id of the last op the snapshot has
 * absorbed — fetching ops with `since=version` will return only ops that
 * arrived after the snapshot.
 *
 * Truncation is by `id <= version`, NOT by `baseVersion` — `id` is monotonic
 * within a workspace so this is the cleanest cut.
 */
export function saveSnapshot(
  workspaceId: number,
  version: number,
  payload: string
): SnapshotSlice {
  if (!Number.isInteger(version) || version < 0) {
    throw new Error('saveSnapshot: version must be a non-negative integer');
  }
  if (typeof payload !== 'string') {
    throw new Error('saveSnapshot: payload must be a JSON string');
  }
  // Validate JSON shape upfront so a corrupt snapshot never lands in DB.
  try {
    JSON.parse(payload);
  } catch (err) {
    throw new Error(
      `saveSnapshot: payload is not valid JSON: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  const nowIso = new Date().toISOString();

  return db.transaction((tx) => {
    const updated = tx
      .update(workspaces)
      .set({
        snapshotVersion: version,
        snapshotPayload: payload,
        snapshotUpdatedAt: nowIso,
        updatedAt: nowIso,
      })
      .where(eq(workspaces.id, workspaceId))
      .returning({
        version: workspaces.snapshotVersion,
        payload: workspaces.snapshotPayload,
        updatedAt: workspaces.snapshotUpdatedAt,
      })
      .get();

    if (!updated) {
      throw new Error(`saveSnapshot: workspace ${workspaceId} not found`);
    }

    // Truncate ops absorbed by the snapshot.
    if (version > 0) {
      tx.delete(workspaceOps)
        .where(
          and(
            eq(workspaceOps.workspaceId, workspaceId),
            lte(workspaceOps.id, version)
          )
        )
        .run();
    }

    return {
      version: updated.version,
      payload: updated.payload,
      updatedAt: updated.updatedAt,
    };
  });
}

// ==================== Op log ====================

export interface AppendOpInput {
  workspaceId: number;
  userId: number;
  clientOpId: string;
  baseVersion: number;
  /** Wire-format op (will be JSON.stringify'd). */
  op: WorkspaceOp;
}

export interface AppendedOp {
  id: number;
  workspaceId: number;
  userId: number;
  clientOpId: string;
  baseVersion: number;
  payload: string;
  createdAt: string;
  /** True when an existing row was returned (idempotent retry). */
  deduped: boolean;
}

/**
 * Append a new op to the log. Idempotent on `(workspaceId, clientOpId)`:
 * a retry from the same client (e.g. after a network hiccup) returns the
 * already-stored row instead of throwing.
 *
 * The `id` returned is the monotonic auto-increment column; clients use it
 * as the next "since" cursor for `listOpsSince`.
 */
export function appendOp(input: AppendOpInput): AppendedOp {
  if (!Number.isInteger(input.workspaceId) || input.workspaceId <= 0) {
    throw new Error('appendOp: workspaceId must be a positive integer');
  }
  if (!Number.isInteger(input.userId) || input.userId <= 0) {
    throw new Error('appendOp: userId must be a positive integer');
  }
  if (!input.clientOpId || typeof input.clientOpId !== 'string') {
    throw new Error('appendOp: clientOpId must be a non-empty string');
  }
  if (!Number.isInteger(input.baseVersion) || input.baseVersion < 0) {
    throw new Error('appendOp: baseVersion must be a non-negative integer');
  }

  const payload = JSON.stringify(input.op);

  // Try insert; on UNIQUE conflict, return the existing row.
  try {
    const inserted = db
      .insert(workspaceOps)
      .values({
        workspaceId: input.workspaceId,
        userId: input.userId,
        clientOpId: input.clientOpId,
        baseVersion: input.baseVersion,
        payload,
      })
      .returning()
      .get();

    return { ...inserted, deduped: false };
  } catch (err) {
    // better-sqlite3 throws SqliteError. Match by code or by message.
    const errMsg =
      err && typeof err === 'object' && 'message' in err
        ? String((err as { message?: unknown }).message ?? '')
        : '';
    const isUnique =
      /UNIQUE/.test(errMsg) || /constraint failed/i.test(errMsg);
    if (!isUnique) throw err;

    const existing = db
      .select()
      .from(workspaceOps)
      .where(
        and(
          eq(workspaceOps.workspaceId, input.workspaceId),
          eq(workspaceOps.clientOpId, input.clientOpId)
        )
      )
      .get();

    if (!existing) {
      // Constraint hit but no row found — re-raise the original.
      throw err;
    }
    return { ...existing, deduped: true };
  }
}

/**
 * Fetch all ops with id strictly greater than `sinceVersion`, in append
 * order. Returns the parsed wire-format objects together with their server
 * id (so callers can advance their cursor).
 */
export interface OpListItem {
  id: number;
  userId: number;
  clientOpId: string;
  baseVersion: number;
  op: WorkspaceOp;
  createdAt: string;
}

export function listOpsSince(
  workspaceId: number,
  sinceVersion: number
): OpListItem[] {
  if (!Number.isInteger(sinceVersion) || sinceVersion < 0) {
    throw new Error('listOpsSince: sinceVersion must be a non-negative integer');
  }

  const rows = db
    .select()
    .from(workspaceOps)
    .where(
      and(
        eq(workspaceOps.workspaceId, workspaceId),
        gt(workspaceOps.id, sinceVersion)
      )
    )
    .orderBy(asc(workspaceOps.id))
    .all();

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    clientOpId: r.clientOpId,
    baseVersion: r.baseVersion,
    op: parsePayload(r.payload, r.id),
    createdAt: r.createdAt,
  }));
}

/** Parse a stored op payload, throwing a clean error if corrupt. */
function parsePayload(raw: string, opId: number): WorkspaceOp {
  try {
    return JSON.parse(raw) as WorkspaceOp;
  } catch (err) {
    throw new Error(
      `listOpsSince: failed to parse op id=${opId} payload: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}

/** Convenience helper for tests: fetch a single op row by primary key. */
export function getOpRow(id: number): WorkspaceOpRow | null {
  return (
    db
      .select()
      .from(workspaceOps)
      .where(eq(workspaceOps.id, id))
      .get() ?? null
  );
}
