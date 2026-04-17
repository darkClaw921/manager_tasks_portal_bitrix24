/**
 * Workspace snapshot history — append-only revisions of `workspaces.snapshot_payload`.
 *
 * Wired to the snapshot-save flow so each successful save produces a new
 * history row. The most recent N entries per workspace are retained; older
 * rows are pruned automatically inside `recordHistorySnapshot` so we never
 * accumulate unbounded history.
 *
 * Rollback: the route layer copies a history row's `payload` back into the
 * live snapshot via `saveSnapshot`. This is owner/admin-only; enforcement
 * lives in the route.
 */

import { eq, desc, and, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  workspaceSnapshotsHistory,
  users,
  type WorkspaceSnapshotHistory,
} from '@/lib/db/schema';

/** How many history entries to keep per workspace. Older are pruned on insert. */
const MAX_HISTORY_PER_WORKSPACE = 30;

export interface SnapshotHistoryRow extends WorkspaceSnapshotHistory {
  authorName: string;
  authorEmail: string;
}

/**
 * Append a snapshot to the history. Idempotent on (workspaceId, version) —
 * if a row for this exact version already exists, we skip.
 */
export function recordHistorySnapshot(input: {
  workspaceId: number;
  version: number;
  payload: string;
  createdBy: number | null;
}): WorkspaceSnapshotHistory | null {
  // Skip duplicates of the same version (snapshot save may retry).
  const existing = db
    .select({ id: workspaceSnapshotsHistory.id })
    .from(workspaceSnapshotsHistory)
    .where(
      and(
        eq(workspaceSnapshotsHistory.workspaceId, input.workspaceId),
        eq(workspaceSnapshotsHistory.version, input.version)
      )
    )
    .get();
  if (existing) return null;

  const inserted = db
    .insert(workspaceSnapshotsHistory)
    .values({
      workspaceId: input.workspaceId,
      version: input.version,
      payload: input.payload,
      createdBy: input.createdBy,
    })
    .returning()
    .get();

  // Prune older entries beyond the cap. Find the cutoff id (the Nth-most-recent)
  // and delete anything strictly older.
  const cutoff = db
    .select({ id: workspaceSnapshotsHistory.id })
    .from(workspaceSnapshotsHistory)
    .where(eq(workspaceSnapshotsHistory.workspaceId, input.workspaceId))
    .orderBy(desc(workspaceSnapshotsHistory.id))
    .limit(1)
    .offset(MAX_HISTORY_PER_WORKSPACE)
    .get();
  if (cutoff) {
    db
      .delete(workspaceSnapshotsHistory)
      .where(
        and(
          eq(workspaceSnapshotsHistory.workspaceId, input.workspaceId),
          lt(workspaceSnapshotsHistory.id, cutoff.id + 1)
        )
      )
      .run();
  }
  return inserted;
}

/**
 * List history for a workspace (newest first). Returns metadata only —
 * payload bytes are omitted to keep the response light. Use `getHistoryRow`
 * to fetch a full row for preview/restore.
 */
export function listHistory(workspaceId: number): SnapshotHistoryRow[] {
  const rows = db
    .select({
      hist: workspaceSnapshotsHistory,
      authorFirst: users.firstName,
      authorLast: users.lastName,
      authorEmail: users.email,
    })
    .from(workspaceSnapshotsHistory)
    .leftJoin(users, eq(workspaceSnapshotsHistory.createdBy, users.id))
    .where(eq(workspaceSnapshotsHistory.workspaceId, workspaceId))
    .orderBy(desc(workspaceSnapshotsHistory.createdAt))
    .all();
  return rows.map((row) => ({
    ...row.hist,
    authorName:
      `${row.authorFirst ?? ''} ${row.authorLast ?? ''}`.trim() ||
      (row.authorEmail ?? 'Система'),
    authorEmail: row.authorEmail ?? '',
  }));
}

/**
 * Fetch a single history row by id, scoped to a workspace.
 */
export function getHistoryRow(
  workspaceId: number,
  historyId: number
): WorkspaceSnapshotHistory | null {
  const row = db
    .select()
    .from(workspaceSnapshotsHistory)
    .where(
      and(
        eq(workspaceSnapshotsHistory.id, historyId),
        eq(workspaceSnapshotsHistory.workspaceId, workspaceId)
      )
    )
    .get();
  return row ?? null;
}

/**
 * Stat helper for tests/UI: how many history rows exist for this workspace.
 */
export function countHistory(workspaceId: number): number {
  const row = db
    .select({ c: sql<number>`COUNT(*)` })
    .from(workspaceSnapshotsHistory)
    .where(eq(workspaceSnapshotsHistory.workspaceId, workspaceId))
    .get();
  return row ? Number(row.c) : 0;
}
