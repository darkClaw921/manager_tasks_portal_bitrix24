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
 * POST /api/tasks/[id]/complete
 *
 * Complete a task on Bitrix24 and locally.
 * Uses tasks.task.complete which sets status to 5 (COMPLETED).
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
        .set({ status: 'COMPLETED', closedDate: nowL, changedDate: nowL, updatedAt: nowL })
        .where(eq(tasks.id, taskId))
        .run();
      return NextResponse.json({
        data: { message: 'Task completed', status: 'COMPLETED' },
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

    // Complete task on Bitrix24
    const client = createBitrix24Client(task.portalId);
    await client.call('tasks.task.complete', {
      taskId: task.bitrixTaskId,
    });

    // Update local DB
    const now = new Date().toISOString();
    db.update(tasks)
      .set({ status: 'COMPLETED', closedDate: now, updatedAt: now })
      .where(eq(tasks.id, taskId))
      .run();

    return NextResponse.json({
      data: { message: 'Task completed', status: 'COMPLETED' },
    });
  } catch (error) {
    console.error('[tasks/[id]/complete] POST error:', error);
    const message = error instanceof Error ? error.message : 'Failed to complete task';
    return NextResponse.json(
      { error: 'Internal', message },
      { status: 500 }
    );
  }
}
