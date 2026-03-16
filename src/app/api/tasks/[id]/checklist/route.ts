import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tasks, portals, taskChecklistItems } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { addChecklistItem } from '@/lib/bitrix/checklist';

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

    // Add checklist item on Bitrix24
    const bitrixItemId = await addChecklistItem(
      task.portalId,
      task.bitrixTaskId,
      title.trim()
    );

    // Get current max sort index
    const existing = db
      .select()
      .from(taskChecklistItems)
      .where(eq(taskChecklistItems.taskId, taskId))
      .all();
    const maxSort = existing.reduce((max, item) => Math.max(max, item.sortIndex), 0);

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
