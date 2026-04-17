/**
 * Per-element comment service for workspaces.
 *
 * Threads are flat (no nested replies). Comments survive after the underlying
 * canvas element is deleted from the snapshot so historic discussion is
 * preserved.
 *
 * Auth is enforced by the route layer (canJoinWorkspace for read,
 * canEditWorkspace for write); service-layer functions do not consult auth
 * themselves.
 */

import { eq, and, desc, count } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  workspaceElementComments,
  users,
  type WorkspaceElementComment,
} from '@/lib/db/schema';

/** Comment row joined with author display name + email. */
export interface WorkspaceCommentWithAuthor extends WorkspaceElementComment {
  authorName: string;
  authorEmail: string;
}

/**
 * List comments for a single element. Includes resolved entries by default
 * so the UI can show a "show resolved" toggle.
 */
export function listCommentsForElement(
  workspaceId: number,
  elementId: string
): WorkspaceCommentWithAuthor[] {
  const rows = db
    .select({
      comment: workspaceElementComments,
      authorName: users.firstName,
      authorLast: users.lastName,
      authorEmail: users.email,
    })
    .from(workspaceElementComments)
    .leftJoin(users, eq(workspaceElementComments.userId, users.id))
    .where(
      and(
        eq(workspaceElementComments.workspaceId, workspaceId),
        eq(workspaceElementComments.elementId, elementId)
      )
    )
    .orderBy(workspaceElementComments.createdAt)
    .all();
  return rows.map((row) => ({
    ...row.comment,
    authorName:
      `${row.authorName ?? ''} ${row.authorLast ?? ''}`.trim() ||
      (row.authorEmail ?? 'Пользователь'),
    authorEmail: row.authorEmail ?? '',
  }));
}

/**
 * Aggregate comment count per element id for the badges on the canvas.
 * Returns a Record<elementId, count>.
 */
export function getCommentCountsByElement(
  workspaceId: number,
  options?: { includeResolved?: boolean }
): Record<string, number> {
  const includeResolved = options?.includeResolved ?? false;
  const where = includeResolved
    ? eq(workspaceElementComments.workspaceId, workspaceId)
    : and(
        eq(workspaceElementComments.workspaceId, workspaceId),
        eq(workspaceElementComments.resolved, 0)
      );
  const rows = db
    .select({
      elementId: workspaceElementComments.elementId,
      count: count(),
    })
    .from(workspaceElementComments)
    .where(where)
    .groupBy(workspaceElementComments.elementId)
    .all();
  const out: Record<string, number> = {};
  for (const row of rows) out[row.elementId] = Number(row.count);
  return out;
}

export interface CreateCommentInput {
  workspaceId: number;
  elementId: string;
  userId: number;
  content: string;
}

export function createComment(input: CreateCommentInput): WorkspaceCommentWithAuthor {
  const trimmed = input.content.trim();
  if (trimmed.length === 0) {
    throw new Error('content must not be empty');
  }
  if (trimmed.length > 4000) {
    throw new Error('content exceeds 4000 characters');
  }
  const inserted = db
    .insert(workspaceElementComments)
    .values({
      workspaceId: input.workspaceId,
      elementId: input.elementId,
      userId: input.userId,
      content: trimmed,
    })
    .returning()
    .get();
  // Re-fetch with author join.
  const list = listCommentsForElement(input.workspaceId, input.elementId);
  return list.find((c) => c.id === inserted.id) ?? {
    ...inserted,
    authorName: 'Пользователь',
    authorEmail: '',
  };
}

/**
 * Toggle the `resolved` flag on a comment. Only the author or an
 * editor/owner of the workspace should be allowed (route enforces).
 */
export function setCommentResolved(commentId: number, resolved: boolean): boolean {
  const res = db
    .update(workspaceElementComments)
    .set({
      resolved: resolved ? 1 : 0,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(workspaceElementComments.id, commentId))
    .run();
  return res.changes > 0;
}

/**
 * Delete a comment by id. Returns true when a row was removed.
 */
export function deleteComment(commentId: number): boolean {
  const res = db
    .delete(workspaceElementComments)
    .where(eq(workspaceElementComments.id, commentId))
    .run();
  return res.changes > 0;
}

/**
 * Get a single comment row by id (used for ownership checks in the route).
 */
export function getComment(commentId: number): WorkspaceElementComment | null {
  const row = db
    .select()
    .from(workspaceElementComments)
    .where(eq(workspaceElementComments.id, commentId))
    .get();
  return row ?? null;
}

/**
 * Recent comment activity for a workspace — used by the side panel summary.
 */
export function listRecentComments(
  workspaceId: number,
  limit = 50
): WorkspaceCommentWithAuthor[] {
  const rows = db
    .select({
      comment: workspaceElementComments,
      authorName: users.firstName,
      authorLast: users.lastName,
      authorEmail: users.email,
    })
    .from(workspaceElementComments)
    .leftJoin(users, eq(workspaceElementComments.userId, users.id))
    .where(eq(workspaceElementComments.workspaceId, workspaceId))
    .orderBy(desc(workspaceElementComments.createdAt))
    .limit(Math.min(200, Math.max(1, limit)))
    .all();
  return rows.map((row) => ({
    ...row.comment,
    authorName:
      `${row.authorName ?? ''} ${row.authorLast ?? ''}`.trim() ||
      (row.authorEmail ?? 'Пользователь'),
    authorEmail: row.authorEmail ?? '',
  }));
}
