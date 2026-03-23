import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { timeTrackingEntries } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import type { TaskTimeTrackingSummary, TimeTrackingEntry } from '@/types/time-tracking';

type RouteContext = { params: Promise<{ taskId: string }> };

/**
 * GET /api/time-tracking/task/[taskId]
 *
 * Returns time tracking summary for a specific task:
 * - All entries for the user, ordered by startedAt DESC
 * - Total duration (sum of completed entries)
 * - Active entry (if any)
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { taskId: taskIdParam } = await context.params;
    const taskId = parseInt(taskIdParam, 10);
    if (isNaN(taskId)) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid taskId' },
        { status: 400 }
      );
    }

    // Get all entries for this task and user, ordered by startedAt DESC
    const entries = db
      .select()
      .from(timeTrackingEntries)
      .where(
        and(
          eq(timeTrackingEntries.taskId, taskId),
          eq(timeTrackingEntries.userId, auth.user.userId)
        )
      )
      .orderBy(desc(timeTrackingEntries.startedAt))
      .all();

    // Calculate total duration from completed entries
    const totalDuration = entries.reduce((sum, entry) => {
      if (entry.stoppedAt && entry.duration != null) {
        return sum + entry.duration;
      }
      return sum;
    }, 0);

    // Find active entry (stoppedAt IS NULL)
    const activeEntry = entries.find((e) => e.stoppedAt === null) || null;

    const data: TaskTimeTrackingSummary = {
      taskId,
      totalDuration,
      activeEntry: activeEntry as TimeTrackingEntry | null,
      entries: entries as TimeTrackingEntry[],
    };

    return NextResponse.json({ data });
  } catch (error) {
    console.error('[time-tracking/task/[taskId]] GET error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch task time tracking';
    return NextResponse.json(
      { error: 'Internal', message },
      { status: 500 }
    );
  }
}
