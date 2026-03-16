import { db } from '@/lib/db';
import { taskComments } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { createBitrix24Client } from './client';
import type { BitrixComment } from '@/types';

/**
 * Map a Bitrix24 comment to local DB fields.
 */
export function mapBitrixCommentToLocal(
  comment: BitrixComment,
  taskId: number
) {
  return {
    taskId,
    bitrixCommentId: parseInt(String(comment.ID), 10),
    authorId: comment.AUTHOR_ID || null,
    authorName: comment.AUTHOR_NAME || null,
    postMessage: comment.POST_MESSAGE || null,
    postDate: comment.POST_DATE || null,
  };
}

/**
 * Fetch comments for a task from Bitrix24.
 */
export async function fetchComments(
  portalId: number,
  bitrixTaskId: number
): Promise<BitrixComment[]> {
  const client = createBitrix24Client(portalId);

  try {
    const response = await client.call<BitrixComment[]>('task.commentitem.getlist', {
      TASKID: bitrixTaskId,
      ORDER: { POST_DATE: 'asc' },
    });

    return response.result || [];
  } catch (error) {
    console.error(
      `[comments] Failed to fetch comments for task ${bitrixTaskId}, portal ${portalId}:`,
      error
    );
    return [];
  }
}

/**
 * Sync comments for a task: fetch from Bitrix24 and upsert into local DB.
 */
export async function syncComments(
  portalId: number,
  bitrixTaskId: number,
  localTaskId: number
): Promise<void> {
  const comments = await fetchComments(portalId, bitrixTaskId);

  const now = new Date().toISOString();

  for (const comment of comments) {
    const mapped = mapBitrixCommentToLocal(comment, localTaskId);

    const existing = db
      .select({ id: taskComments.id })
      .from(taskComments)
      .where(
        and(
          eq(taskComments.taskId, localTaskId),
          eq(taskComments.bitrixCommentId, mapped.bitrixCommentId)
        )
      )
      .get();

    if (existing) {
      // Update existing comment
      db.update(taskComments)
        .set({
          authorName: mapped.authorName,
          postMessage: mapped.postMessage,
          postDate: mapped.postDate,
        })
        .where(eq(taskComments.id, existing.id))
        .run();
    } else {
      // Insert new comment
      db.insert(taskComments)
        .values({ ...mapped, createdAt: now })
        .run();
    }
  }
}

/**
 * Add a comment to a task on Bitrix24.
 * Returns the new comment ID from Bitrix24.
 */
export async function addComment(
  portalId: number,
  bitrixTaskId: number,
  message: string
): Promise<number> {
  const client = createBitrix24Client(portalId);

  const response = await client.call<number>('task.commentitem.add', {
    TASKID: bitrixTaskId,
    FIELDS: {
      POST_MESSAGE: message,
    },
  });

  return response.result;
}
