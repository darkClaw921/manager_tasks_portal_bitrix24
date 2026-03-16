import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, portals, tasks } from '@/lib/db/schema';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { requireAdmin, isAuthError } from '@/lib/auth/guards';

/**
 * GET /api/users/[id]/stats
 *
 * Get task/portal statistics for a user. Admin only.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (isAuthError(auth)) return auth;

    const { id } = await context.params;
    const userId = parseInt(id, 10);

    if (isNaN(userId)) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid user ID' },
        { status: 400 }
      );
    }

    // Verify user exists
    const user = db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .get();

    if (!user) {
      return NextResponse.json(
        { error: 'NotFound', message: 'User not found' },
        { status: 404 }
      );
    }

    // Get portal IDs
    const userPortals = db
      .select({ id: portals.id })
      .from(portals)
      .where(and(eq(portals.userId, userId), eq(portals.isActive, true)))
      .all();

    const portalIds = userPortals.map((p) => p.id);

    let totalTasks = 0;
    let inProgress = 0;
    let completed = 0;
    let overdue = 0;

    if (portalIds.length > 0) {
      const statsResult = db
        .select({
          total: sql<number>`COUNT(*)`,
          inProgress: sql<number>`SUM(CASE WHEN ${tasks.status} = 'IN_PROGRESS' THEN 1 ELSE 0 END)`,
          completed: sql<number>`SUM(CASE WHEN ${tasks.status} IN ('COMPLETED', 'SUPPOSEDLY_COMPLETED') THEN 1 ELSE 0 END)`,
          overdue: sql<number>`SUM(CASE WHEN ${tasks.deadline} < datetime('now') AND ${tasks.status} NOT IN ('COMPLETED', 'SUPPOSEDLY_COMPLETED', 'DEFERRED') THEN 1 ELSE 0 END)`,
        })
        .from(tasks)
        .where(inArray(tasks.portalId, portalIds))
        .get();

      if (statsResult) {
        totalTasks = statsResult.total || 0;
        inProgress = statsResult.inProgress || 0;
        completed = statsResult.completed || 0;
        overdue = statsResult.overdue || 0;
      }
    }

    return NextResponse.json({
      data: {
        portalCount: portalIds.length,
        totalTasks,
        inProgress,
        completed,
        overdue,
      },
    });
  } catch (error) {
    console.error('[users/[id]/stats] GET error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to fetch user stats' },
      { status: 500 }
    );
  }
}
