import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tasks, portals } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { createBitrix24Client } from '@/lib/bitrix/client';
import { isLocalPortal } from '@/lib/portals/local';
import { hasPortalAccess } from '@/lib/portals/access';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/tasks/[id]/renew
 *
 * Resume/renew a task (change status back to IN_PROGRESS) on Bitrix24 and locally.
 * Clears the closedDate since the task is no longer closed.
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

    // Get task + portal info (no ownership filter) for local detection
    const taskAccess = db
      .select({
        id: tasks.id,
        portalId: tasks.portalId,
        bitrixTaskId: tasks.bitrixTaskId,
        portalUserId: portals.userId,
        portalMemberId: portals.memberId,
      })
      .from(tasks)
      .innerJoin(portals, eq(tasks.portalId, portals.id))
      .where(eq(tasks.id, taskId))
      .get();

    if (!taskAccess) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Task not found' },
        { status: 404 }
      );
    }

    // ===== LOCAL PORTAL BRANCH =====
    if (isLocalPortal({ memberId: taskAccess.portalMemberId })) {
      if (!auth.user.isAdmin && !hasPortalAccess(auth.user.userId, taskAccess.portalId)) {
        return NextResponse.json(
          { error: 'Not Found', message: 'Task not found' },
          { status: 404 }
        );
      }
      const nowL = new Date().toISOString();
      db.update(tasks)
        .set({ status: 'IN_PROGRESS', closedDate: null, changedDate: nowL, updatedAt: nowL })
        .where(eq(tasks.id, taskId))
        .run();
      return NextResponse.json({
        data: { message: 'Task renewed', status: 'IN_PROGRESS' },
      });
    }
    // ===== END LOCAL PORTAL BRANCH =====

    const task = taskAccess.portalUserId === auth.user.userId ? taskAccess : null;
    if (!task) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Task not found' },
        { status: 404 }
      );
    }

    // Renew task on Bitrix24 (set status to 3 = IN_PROGRESS)
    const client = createBitrix24Client(task.portalId);
    await client.call('tasks.task.update', {
      taskId: task.bitrixTaskId,
      fields: { STATUS: '3' },
    });

    // Update local DB
    const now = new Date().toISOString();
    db.update(tasks)
      .set({ status: 'IN_PROGRESS', closedDate: null, updatedAt: now })
      .where(eq(tasks.id, taskId))
      .run();

    return NextResponse.json({
      data: { message: 'Task renewed', status: 'IN_PROGRESS' },
    });
  } catch (error) {
    console.error('[tasks/[id]/renew] POST error:', error);
    const message = error instanceof Error ? error.message : 'Failed to renew task';
    return NextResponse.json(
      { error: 'Internal', message },
      { status: 500 }
    );
  }
}
