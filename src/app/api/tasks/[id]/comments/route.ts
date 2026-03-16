import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tasks, portals, taskComments } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { addComment } from '@/lib/bitrix/comments';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/tasks/[id]/comments
 *
 * Add a comment to a task on Bitrix24 and save locally.
 * Body: { message: string }
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { id } = await context.params;
    const taskId = parseInt(id, 10);
    if (isNaN(taskId)) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid task ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { message } = body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json(
        { error: 'Validation', message: 'message is required' },
        { status: 400 }
      );
    }

    // Get task with ownership check
    const task = db
      .select({
        id: tasks.id,
        portalId: tasks.portalId,
        bitrixTaskId: tasks.bitrixTaskId,
        portalUserId: portals.userId,
      })
      .from(tasks)
      .innerJoin(portals, eq(tasks.portalId, portals.id))
      .where(
        and(
          eq(tasks.id, taskId),
          eq(portals.userId, auth.user.userId)
        )
      )
      .get();

    if (!task) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Task not found' },
        { status: 404 }
      );
    }

    // Add comment on Bitrix24
    const bitrixCommentId = await addComment(
      task.portalId,
      task.bitrixTaskId,
      message.trim()
    );

    // Save locally
    const now = new Date().toISOString();
    const result = db
      .insert(taskComments)
      .values({
        taskId,
        bitrixCommentId,
        authorId: null, // We don't know the user's Bitrix24 ID here
        authorName: 'Вы',
        postMessage: message.trim(),
        postDate: now,
        createdAt: now,
      })
      .run();

    const newComment = db
      .select()
      .from(taskComments)
      .where(eq(taskComments.id, Number(result.lastInsertRowid)))
      .get();

    return NextResponse.json({
      data: newComment,
    }, { status: 201 });
  } catch (error) {
    console.error('[tasks/[id]/comments] POST error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to add comment';
    return NextResponse.json(
      { error: 'Internal', message: msg },
      { status: 500 }
    );
  }
}
