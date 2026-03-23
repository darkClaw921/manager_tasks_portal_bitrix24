import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { timeTrackingEntries, tasks, portals } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import type { ActiveTimerEntry } from '@/types/time-tracking';

/**
 * GET /api/time-tracking/active
 *
 * Returns all active timers (stoppedAt IS NULL) for the current user,
 * joined with task and portal info.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const rows = db
      .select({
        id: timeTrackingEntries.id,
        userId: timeTrackingEntries.userId,
        taskId: timeTrackingEntries.taskId,
        startedAt: timeTrackingEntries.startedAt,
        stoppedAt: timeTrackingEntries.stoppedAt,
        duration: timeTrackingEntries.duration,
        createdAt: timeTrackingEntries.createdAt,
        taskTitle: tasks.title,
        portalColor: portals.color,
        portalName: portals.name,
      })
      .from(timeTrackingEntries)
      .innerJoin(tasks, eq(timeTrackingEntries.taskId, tasks.id))
      .innerJoin(portals, eq(tasks.portalId, portals.id))
      .where(
        and(
          eq(timeTrackingEntries.userId, auth.user.userId),
          isNull(timeTrackingEntries.stoppedAt)
        )
      )
      .all();

    const data: ActiveTimerEntry[] = rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      taskId: row.taskId,
      startedAt: row.startedAt,
      stoppedAt: row.stoppedAt,
      duration: row.duration,
      createdAt: row.createdAt,
      taskTitle: row.taskTitle,
      portalColor: row.portalColor,
      portalName: row.portalName,
    }));

    return NextResponse.json({ data });
  } catch (error) {
    console.error('[time-tracking/active] GET error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch active timers';
    return NextResponse.json(
      { error: 'Internal', message },
      { status: 500 }
    );
  }
}
