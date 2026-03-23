import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { timeTrackingEntries, tasks, portals } from '@/lib/db/schema';
import { eq, and, sql, gte, isNotNull } from 'drizzle-orm';
import { requireAuth, isAuthError } from '@/lib/auth/guards';

/**
 * GET /api/time-tracking/stats
 *
 * Returns time tracking statistics for the current user:
 * - totalToday: seconds tracked today
 * - totalWeek: seconds tracked this week (Mon-Sun)
 * - totalMonth: seconds tracked this month
 * - totalAll: seconds tracked all time
 * - todayTasks: list of tasks tracked today with their durations
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const userId = auth.user.userId;
    const now = new Date();

    // Today start (midnight local — use UTC for simplicity)
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    // Week start (Monday)
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset).toISOString();

    // Month start
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Total all time
    const totalAllRow = db
      .select({ total: sql<number>`COALESCE(SUM(${timeTrackingEntries.duration}), 0)` })
      .from(timeTrackingEntries)
      .where(
        and(
          eq(timeTrackingEntries.userId, userId),
          isNotNull(timeTrackingEntries.stoppedAt)
        )
      )
      .get();

    // Total today
    const totalTodayRow = db
      .select({ total: sql<number>`COALESCE(SUM(${timeTrackingEntries.duration}), 0)` })
      .from(timeTrackingEntries)
      .where(
        and(
          eq(timeTrackingEntries.userId, userId),
          isNotNull(timeTrackingEntries.stoppedAt),
          gte(timeTrackingEntries.startedAt, todayStart)
        )
      )
      .get();

    // Total this week
    const totalWeekRow = db
      .select({ total: sql<number>`COALESCE(SUM(${timeTrackingEntries.duration}), 0)` })
      .from(timeTrackingEntries)
      .where(
        and(
          eq(timeTrackingEntries.userId, userId),
          isNotNull(timeTrackingEntries.stoppedAt),
          gte(timeTrackingEntries.startedAt, weekStart)
        )
      )
      .get();

    // Total this month
    const totalMonthRow = db
      .select({ total: sql<number>`COALESCE(SUM(${timeTrackingEntries.duration}), 0)` })
      .from(timeTrackingEntries)
      .where(
        and(
          eq(timeTrackingEntries.userId, userId),
          isNotNull(timeTrackingEntries.stoppedAt),
          gte(timeTrackingEntries.startedAt, monthStart)
        )
      )
      .get();

    // Today's tasks breakdown
    const todayTasks = db
      .select({
        taskId: timeTrackingEntries.taskId,
        taskTitle: tasks.title,
        portalColor: portals.color,
        portalName: portals.name,
        totalDuration: sql<number>`SUM(${timeTrackingEntries.duration})`,
      })
      .from(timeTrackingEntries)
      .innerJoin(tasks, eq(timeTrackingEntries.taskId, tasks.id))
      .innerJoin(portals, eq(tasks.portalId, portals.id))
      .where(
        and(
          eq(timeTrackingEntries.userId, userId),
          isNotNull(timeTrackingEntries.stoppedAt),
          gte(timeTrackingEntries.startedAt, todayStart)
        )
      )
      .groupBy(timeTrackingEntries.taskId)
      .orderBy(sql`SUM(${timeTrackingEntries.duration}) DESC`)
      .all();

    return NextResponse.json({
      data: {
        totalToday: totalTodayRow?.total ?? 0,
        totalWeek: totalWeekRow?.total ?? 0,
        totalMonth: totalMonthRow?.total ?? 0,
        totalAll: totalAllRow?.total ?? 0,
        todayTasks,
      },
    });
  } catch (error) {
    console.error('[time-tracking/stats] GET error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
