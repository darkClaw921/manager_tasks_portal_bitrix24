import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tasks, portals, taskChecklistItems } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { toggleChecklistItem, deleteChecklistItem } from '@/lib/bitrix/checklist';
import { isLocalPortal } from '@/lib/portals/local';
import { hasPortalAccess } from '@/lib/portals/access';

type RouteContext = { params: Promise<{ id: string; itemId: string }> };

/**
 * Get task + portal info (no ownership filter) and checklist item.
 * Ownership / access checks are handled by callers based on portal type.
 */
function getTaskAndItemForAccess(taskId: number, itemId: number) {
  const task = db
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

  if (!task) return null;

  const item = db
    .select()
    .from(taskChecklistItems)
    .where(
      and(
        eq(taskChecklistItems.id, itemId),
        eq(taskChecklistItems.taskId, taskId)
      )
    )
    .get();

  if (!item) return null;

  return { task, item };
}

/**
 * PATCH /api/tasks/[id]/checklist/[itemId]
 *
 * Toggle a checklist item complete/incomplete.
 * Body: { isComplete: boolean }
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { id, itemId } = await context.params;
    const taskId = parseInt(id, 10);
    const checklistItemId = parseInt(itemId, 10);

    if (isNaN(taskId) || isNaN(checklistItemId)) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { isComplete } = body;

    if (typeof isComplete !== 'boolean') {
      return NextResponse.json(
        { error: 'Validation', message: 'isComplete (boolean) is required' },
        { status: 400 }
      );
    }

    const result = getTaskAndItemForAccess(taskId, checklistItemId);
    if (!result) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Task or checklist item not found' },
        { status: 404 }
      );
    }

    const { task, item } = result;

    // ===== LOCAL PORTAL BRANCH =====
    if (isLocalPortal({ memberId: task.portalMemberId })) {
      if (!auth.user.isAdmin && !hasPortalAccess(auth.user.userId, task.portalId)) {
        return NextResponse.json(
          { error: 'Not Found', message: 'Task or checklist item not found' },
          { status: 404 }
        );
      }
      db.update(taskChecklistItems)
        .set({ isComplete })
        .where(eq(taskChecklistItems.id, checklistItemId))
        .run();
      return NextResponse.json({ data: { ...item, isComplete } });
    }
    // ===== END LOCAL PORTAL BRANCH =====

    // Ownership check for bitrix portal
    if (task.portalUserId !== auth.user.userId) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Task or checklist item not found' },
        { status: 404 }
      );
    }

    if (!item.bitrixItemId) {
      return NextResponse.json(
        { error: 'Validation', message: 'Item has no Bitrix24 ID' },
        { status: 400 }
      );
    }

    // Toggle on Bitrix24
    await toggleChecklistItem(
      task.portalId,
      task.bitrixTaskId,
      item.bitrixItemId,
      isComplete
    );

    // Update local DB
    db.update(taskChecklistItems)
      .set({ isComplete })
      .where(eq(taskChecklistItems.id, checklistItemId))
      .run();

    return NextResponse.json({
      data: { ...item, isComplete },
    });
  } catch (error) {
    console.error('[tasks/[id]/checklist/[itemId]] PATCH error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to toggle checklist item';
    return NextResponse.json(
      { error: 'Internal', message: msg },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/tasks/[id]/checklist/[itemId]
 *
 * Delete a checklist item from Bitrix24 and local DB.
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { id, itemId } = await context.params;
    const taskId = parseInt(id, 10);
    const checklistItemId = parseInt(itemId, 10);

    if (isNaN(taskId) || isNaN(checklistItemId)) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid ID' },
        { status: 400 }
      );
    }

    const result = getTaskAndItemForAccess(taskId, checklistItemId);
    if (!result) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Task or checklist item not found' },
        { status: 404 }
      );
    }

    const { task, item } = result;

    // ===== LOCAL PORTAL BRANCH =====
    if (isLocalPortal({ memberId: task.portalMemberId })) {
      if (!auth.user.isAdmin && !hasPortalAccess(auth.user.userId, task.portalId)) {
        return NextResponse.json(
          { error: 'Not Found', message: 'Task or checklist item not found' },
          { status: 404 }
        );
      }
      db.delete(taskChecklistItems)
        .where(eq(taskChecklistItems.id, checklistItemId))
        .run();
      return NextResponse.json({
        data: { message: 'Checklist item deleted' },
      });
    }
    // ===== END LOCAL PORTAL BRANCH =====

    // Ownership check for bitrix portal
    if (task.portalUserId !== auth.user.userId) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Task or checklist item not found' },
        { status: 404 }
      );
    }

    if (item.bitrixItemId) {
      // Delete on Bitrix24
      await deleteChecklistItem(
        task.portalId,
        task.bitrixTaskId,
        item.bitrixItemId
      );
    }

    // Delete from local DB
    db.delete(taskChecklistItems)
      .where(eq(taskChecklistItems.id, checklistItemId))
      .run();

    return NextResponse.json({
      data: { message: 'Checklist item deleted' },
    });
  } catch (error) {
    console.error('[tasks/[id]/checklist/[itemId]] DELETE error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to delete checklist item';
    return NextResponse.json(
      { error: 'Internal', message: msg },
      { status: 500 }
    );
  }
}
