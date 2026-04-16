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
 * POST /api/tasks/[id]/stage
 *
 * Move a task to a different stage on Bitrix24.
 * Body: { stageId: string } - the Bitrix24 stage ID
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
    const { stageId } = body;

    if (!stageId) {
      return NextResponse.json(
        { error: 'Validation', message: 'stageId is required' },
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
        .set({ stageId: parseInt(String(stageId), 10), updatedAt: nowL })
        .where(eq(tasks.id, taskId))
        .run();
      return NextResponse.json({
        data: { message: 'Task moved to new stage', stageId },
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

    // Move stage on Bitrix24
    const client = createBitrix24Client(task.portalId);
    await client.call('task.stages.movetask', {
      id: task.bitrixTaskId,
      stageId: parseInt(String(stageId), 10),
    });

    // Update local DB
    const now = new Date().toISOString();
    db.update(tasks)
      .set({ stageId: parseInt(String(stageId), 10), updatedAt: now })
      .where(eq(tasks.id, taskId))
      .run();

    return NextResponse.json({
      data: { message: 'Task moved to new stage', stageId },
    });
  } catch (error) {
    console.error('[tasks/[id]/stage] POST error:', error);
    const message = error instanceof Error ? error.message : 'Failed to move task stage';
    return NextResponse.json(
      { error: 'Internal', message },
      { status: 500 }
    );
  }
}
