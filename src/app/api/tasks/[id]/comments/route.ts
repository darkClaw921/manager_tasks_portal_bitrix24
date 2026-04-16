import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tasks, taskComments, portals, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { addComment } from '@/lib/bitrix/comments';
import { hasPortalAccess } from '@/lib/portals/access';
import { getBitrixUserIdForUser, getAllMappingsForPortal } from '@/lib/portals/mappings';
import { isLocalPortal } from '@/lib/portals/local';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/tasks/[id]/comments
 *
 * Add a comment to a task on Bitrix24 and save locally.
 * Uses portal access check instead of portal ownership.
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

    // Get task by ID with portal memberId for local detection
    const task = db
      .select({
        id: tasks.id,
        portalId: tasks.portalId,
        bitrixTaskId: tasks.bitrixTaskId,
        portalMemberId: portals.memberId,
      })
      .from(tasks)
      .innerJoin(portals, eq(tasks.portalId, portals.id))
      .where(eq(tasks.id, taskId))
      .get();

    if (!task) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Task not found' },
        { status: 404 }
      );
    }

    // Check portal access
    if (!auth.user.isAdmin && !hasPortalAccess(auth.user.userId, task.portalId)) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Task not found' },
        { status: 404 }
      );
    }

    // ===== LOCAL PORTAL BRANCH =====
    if (isLocalPortal({ memberId: task.portalMemberId })) {
      const nowL = new Date().toISOString();
      // Snapshot author name from app users table
      const authorRow = db
        .select({ firstName: users.firstName, lastName: users.lastName })
        .from(users)
        .where(eq(users.id, auth.user.userId))
        .get();
      const authorNameL = authorRow
        ? `${authorRow.firstName} ${authorRow.lastName}`.trim()
        : 'Вы';

      const syntheticCommentId = -Date.now();
      const insertRes = db
        .insert(taskComments)
        .values({
          taskId,
          bitrixCommentId: syntheticCommentId,
          authorId: String(auth.user.userId),
          authorName: authorNameL,
          postMessage: message.trim(),
          postDate: nowL,
          createdAt: nowL,
        })
        .run();

      const newCommentL = db
        .select()
        .from(taskComments)
        .where(eq(taskComments.id, Number(insertRes.lastInsertRowid)))
        .get();

      return NextResponse.json({ data: newCommentL }, { status: 201 });
    }
    // ===== END LOCAL PORTAL BRANCH =====

    // Look up the current user's Bitrix24 ID and name for this portal
    const bitrixUserId = getBitrixUserIdForUser(auth.user.userId, task.portalId);
    let bitrixName: string | null = null;
    if (bitrixUserId) {
      const mappings = getAllMappingsForPortal(task.portalId);
      const userMapping = mappings.find((m) => m.userId === auth.user.userId);
      bitrixName = userMapping?.bitrixName ?? null;
    }

    // Add comment on Bitrix24 (pass authorId if available)
    const bitrixCommentId = await addComment(
      task.portalId,
      task.bitrixTaskId,
      message.trim(),
      bitrixUserId ?? undefined
    );

    // Save locally
    const now = new Date().toISOString();
    const result = db
      .insert(taskComments)
      .values({
        taskId,
        bitrixCommentId,
        authorId: bitrixUserId ?? null,
        authorName: bitrixName ?? 'Вы',
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
