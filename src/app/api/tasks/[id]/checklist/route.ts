import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tasks, portals, taskChecklistItems } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { addChecklistItem } from '@/lib/bitrix/checklist';
import { isLocalPortal } from '@/lib/portals/local';
import { hasPortalAccess } from '@/lib/portals/access';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/tasks/[id]/checklist
 *
 * Add a checklist item to a task on Bitrix24 and save locally.
 * Body: { title: string }
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
    const { title } = body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return NextResponse.json(
        { error: 'Validation', message: 'title is required' },
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

    // Compute max sort index (shared between branches)
    const existing = db
      .select()
      .from(taskChecklistItems)
      .where(eq(taskChecklistItems.taskId, taskId))
      .all();
    const maxSort = existing.reduce((max, item) => Math.max(max, item.sortIndex), 0);

    // ===== LOCAL PORTAL BRANCH =====
    if (isLocalPortal({ memberId: taskAccess.portalMemberId })) {
      if (!auth.user.isAdmin && !hasPortalAccess(auth.user.userId, taskAccess.portalId)) {
        return NextResponse.json(
          { error: 'Not Found', message: 'Task not found' },
          { status: 404 }
        );
      }
      const nowL = new Date().toISOString();
      const resL = db
        .insert(taskChecklistItems)
        .values({
          taskId,
          bitrixItemId: null,
          title: title.trim(),
          sortIndex: maxSort + 1,
          isComplete: false,
          createdAt: nowL,
        })
        .run();
      const newItemL = db
        .select()
        .from(taskChecklistItems)
        .where(eq(taskChecklistItems.id, Number(resL.lastInsertRowid)))
        .get();
      return NextResponse.json({ data: newItemL }, { status: 201 });
    }
    // ===== END LOCAL PORTAL BRANCH =====

    const task = taskAccess.portalUserId === auth.user.userId ? taskAccess : null;
    if (!task) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Task not found' },
        { status: 404 }
      );
    }

    // Add checklist item on Bitrix24
    const bitrixItemId = await addChecklistItem(
      task.portalId,
      task.bitrixTaskId,
      title.trim()
    );

    // Save locally
    const now = new Date().toISOString();
    const result = db
      .insert(taskChecklistItems)
      .values({
        taskId,
        bitrixItemId,
        title: title.trim(),
        sortIndex: maxSort + 1,
        isComplete: false,
        createdAt: now,
      })
      .run();

    const newItem = db
      .select()
      .from(taskChecklistItems)
      .where(eq(taskChecklistItems.id, Number(result.lastInsertRowid)))
      .get();

    return NextResponse.json({
      data: newItem,
    }, { status: 201 });
  } catch (error) {
    console.error('[tasks/[id]/checklist] POST error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to add checklist item';
    return NextResponse.json(
      { error: 'Internal', message: msg },
      { status: 500 }
    );
  }
}
