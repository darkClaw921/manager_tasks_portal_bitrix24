import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { timeTrackingEntries, tasks, portals } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { requireAuth, isAuthError } from '@/lib/auth/guards';

/**
 * POST /api/time-tracking/start
 *
 * Start a time tracking timer for a task.
 * Body: { taskId: number }
 *
 * Checks:
 * - Task exists and is accessible by the current user
 * - No active timer already running for this task+user (409 Conflict)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const body = await request.json();
    const { taskId } = body;

    if (!taskId || typeof taskId !== 'number') {
      return NextResponse.json(
        { error: 'Validation', message: 'taskId is required and must be a number' },
        { status: 400 }
      );
    }

    // Check task exists and user has access (via portal ownership)
    const task = db
      .select({
        id: tasks.id,
        portalId: tasks.portalId,
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

    // Check for existing active timer on this task for this user
    const existingTimer = db
      .select({ id: timeTrackingEntries.id })
      .from(timeTrackingEntries)
      .where(
        and(
          eq(timeTrackingEntries.userId, auth.user.userId),
          eq(timeTrackingEntries.taskId, taskId),
          isNull(timeTrackingEntries.stoppedAt)
        )
      )
      .get();

    if (existingTimer) {
      return NextResponse.json(
        { error: 'Conflict', message: 'Timer already running for this task' },
        { status: 409 }
      );
    }

    // Create new time tracking entry
    const now = new Date().toISOString();
    const result = db
      .insert(timeTrackingEntries)
      .values({
        userId: auth.user.userId,
        taskId,
        startedAt: now,
      })
      .returning()
      .get();

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    console.error('[time-tracking/start] POST error:', error);
    const message = error instanceof Error ? error.message : 'Failed to start timer';
    return NextResponse.json(
      { error: 'Internal', message },
      { status: 500 }
    );
  }
}
