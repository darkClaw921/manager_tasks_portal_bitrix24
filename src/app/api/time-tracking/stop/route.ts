import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { timeTrackingEntries } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { requireAuth, isAuthError } from '@/lib/auth/guards';

/**
 * POST /api/time-tracking/stop
 *
 * Stop an active time tracking timer for a task.
 * Body: { taskId: number }
 *
 * Finds the active entry (stoppedAt IS NULL) for the user+task,
 * calculates duration in seconds, and updates the record.
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

    // Find active timer for this user and task
    const entry = db
      .select()
      .from(timeTrackingEntries)
      .where(
        and(
          eq(timeTrackingEntries.userId, auth.user.userId),
          eq(timeTrackingEntries.taskId, taskId),
          isNull(timeTrackingEntries.stoppedAt)
        )
      )
      .get();

    if (!entry) {
      return NextResponse.json(
        { error: 'Not Found', message: 'No active timer for this task' },
        { status: 404 }
      );
    }

    // Calculate duration in seconds
    const now = new Date();
    const duration = Math.floor((now.getTime() - new Date(entry.startedAt).getTime()) / 1000);

    // Update the entry
    const updated = db
      .update(timeTrackingEntries)
      .set({
        stoppedAt: now.toISOString(),
        duration,
      })
      .where(eq(timeTrackingEntries.id, entry.id))
      .returning()
      .get();

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error('[time-tracking/stop] POST error:', error);
    const message = error instanceof Error ? error.message : 'Failed to stop timer';
    return NextResponse.json(
      { error: 'Internal', message },
      { status: 500 }
    );
  }
}
