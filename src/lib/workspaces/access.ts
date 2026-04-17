/**
 * Access control for workspaces.
 *
 * Mirrors `src/lib/meetings/access.ts`. A user may JOIN a workspace if any
 * of the following holds:
 *   1. They are the owner (`workspaces.ownerId === userId`).
 *   2. They have a row in `workspace_participants`.
 *   3. They have TaskHub admin role (`users.isAdmin === true`).
 *
 * EDIT permission additionally requires that the participant role is
 * `'owner'` or `'editor'` (viewers can read but not mutate). Admins always
 * pass.
 *
 * Functions never throw on permission denial — they return `false` (or null
 * for `getRole`). HTTP status mapping happens in the route layer.
 */

import { db } from '@/lib/db';
import { workspaces, workspaceParticipants, users } from '@/lib/db/schema';
import { and, asc, eq } from 'drizzle-orm';
import type { WorkspaceParticipant, WorkspaceRole } from '@/types/workspace';

/** True iff the user is the workspace owner. False if missing. */
export async function isOwner(userId: number, workspaceId: number): Promise<boolean> {
  const row = db
    .select({ ownerId: workspaces.ownerId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .get();
  if (!row) return false;
  return row.ownerId === userId;
}

/**
 * True iff the user is allowed to OPEN the workspace (read-only at minimum).
 * Order: owner → listed participant → admin override.
 */
export async function canJoinWorkspace(
  userId: number,
  workspaceId: number
): Promise<boolean> {
  const wsRow = db
    .select({ ownerId: workspaces.ownerId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .get();

  if (!wsRow) return false;
  if (wsRow.ownerId === userId) return true;

  const partRow = db
    .select({ id: workspaceParticipants.id })
    .from(workspaceParticipants)
    .where(
      and(
        eq(workspaceParticipants.workspaceId, workspaceId),
        eq(workspaceParticipants.userId, userId)
      )
    )
    .get();

  if (partRow) return true;

  const adminRow = db
    .select({ isAdmin: users.isAdmin })
    .from(users)
    .where(eq(users.id, userId))
    .get();

  return Boolean(adminRow?.isAdmin);
}

/**
 * True iff the user can MUTATE the canvas (publish ops, save snapshot,
 * upload assets). Owner + editor can; viewer cannot. Admin always can.
 */
export async function canEditWorkspace(
  userId: number,
  workspaceId: number
): Promise<boolean> {
  const wsRow = db
    .select({ ownerId: workspaces.ownerId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .get();

  if (!wsRow) return false;
  if (wsRow.ownerId === userId) return true;

  const partRow = db
    .select({ role: workspaceParticipants.role })
    .from(workspaceParticipants)
    .where(
      and(
        eq(workspaceParticipants.workspaceId, workspaceId),
        eq(workspaceParticipants.userId, userId)
      )
    )
    .get();

  if (partRow) {
    if (partRow.role === 'owner' || partRow.role === 'editor') return true;
    // viewer falls through to admin check.
  }

  const adminRow = db
    .select({ isAdmin: users.isAdmin })
    .from(users)
    .where(eq(users.id, userId))
    .get();

  return Boolean(adminRow?.isAdmin);
}

/**
 * Resolve the user's role in the workspace:
 *   - 'owner' if `workspaces.ownerId === userId`
 *   - the row's role if listed in `workspace_participants`
 *   - null otherwise (admins are NOT auto-granted a role — admin-ness is
 *     orthogonal to membership)
 */
export async function getRole(
  userId: number,
  workspaceId: number
): Promise<WorkspaceRole | null> {
  const wsRow = db
    .select({ ownerId: workspaces.ownerId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .get();
  if (!wsRow) return null;
  if (wsRow.ownerId === userId) return 'owner';

  const partRow = db
    .select({ role: workspaceParticipants.role })
    .from(workspaceParticipants)
    .where(
      and(
        eq(workspaceParticipants.workspaceId, workspaceId),
        eq(workspaceParticipants.userId, userId)
      )
    )
    .get();
  if (!partRow) return null;
  // Trust the column — schema column is freeform TEXT, but the check
  // narrows on insertion paths.
  if (partRow.role === 'owner' || partRow.role === 'editor' || partRow.role === 'viewer') {
    return partRow.role;
  }
  return 'viewer';
}

// ==================== Participant management ====================
//
// These helpers wrap idempotent INSERT / DELETE for the participants pivot.
// They are exported here (rather than in `workspaces.ts`) so route handlers
// can import access + invite from a single module.

export interface AddParticipantsResult {
  added: WorkspaceParticipant[];
  /** ids that were already present (no insert performed). */
  alreadyPresent: number[];
}

/**
 * Bulk add participants. Idempotent on `(workspaceId, userId)` UNIQUE.
 * The caller is responsible for verifying that the requester is the owner
 * (or admin) — this function does NOT enforce authorisation.
 */
export function addParticipants(
  workspaceId: number,
  userIds: number[],
  role: WorkspaceRole = 'editor'
): AddParticipantsResult {
  if (!Array.isArray(userIds)) {
    throw new Error('addParticipants: userIds must be an array');
  }
  if (userIds.length === 0) {
    return { added: [], alreadyPresent: [] };
  }
  for (const id of userIds) {
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error('addParticipants: every userId must be a positive integer');
    }
  }

  // Snapshot which ids are already there.
  const existing = db
    .select({ userId: workspaceParticipants.userId })
    .from(workspaceParticipants)
    .where(eq(workspaceParticipants.workspaceId, workspaceId))
    .all();
  const existingSet = new Set(existing.map((r) => r.userId));

  const added: WorkspaceParticipant[] = [];
  const alreadyPresent: number[] = [];

  for (const userId of userIds) {
    if (existingSet.has(userId)) {
      alreadyPresent.push(userId);
      continue;
    }
    const row = db
      .insert(workspaceParticipants)
      .values({ workspaceId, userId, role })
      .returning()
      .get();
    added.push(row);
    // Guard against duplicate ids in the input array.
    existingSet.add(userId);
  }

  return { added, alreadyPresent };
}

/**
 * Remove a participant. Refuses to remove the workspace owner. Returns
 * true if a row was deleted.
 */
export function removeParticipant(
  workspaceId: number,
  userId: number
): boolean {
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
 * Hydrated participant list (joined to users for display name).
 * Returns rows in joinedAt-ascending order so the owner is always first
 * (owner is inserted at workspace creation).
 */
export interface WorkspaceParticipantWithUser extends WorkspaceParticipant {
  userName: string | null;
  email: string | null;
}

export function listParticipants(
  workspaceId: number
): WorkspaceParticipantWithUser[] {
  const rows = db
    .select({
      participant: workspaceParticipants,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(workspaceParticipants)
    .leftJoin(users, eq(users.id, workspaceParticipants.userId))
    .where(eq(workspaceParticipants.workspaceId, workspaceId))
    .orderBy(asc(workspaceParticipants.joinedAt))
    .all();

  return rows.map((r) => ({
    ...r.participant,
    userName:
      r.firstName && r.lastName
        ? `${r.firstName} ${r.lastName}`.trim()
        : r.firstName ?? null,
    email: r.email ?? null,
  }));
}
