import { db } from '@/lib/db';
import { tasks, portals, users, userPortalAccess } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { buildTaskAccessFilter } from '@/lib/portals/task-filter';

// ==================== Types ====================

export interface SnapshotTask {
  id: number;
  title: string;
  deadline: string | null;
  priority: string;
  status: string;
  portalName: string;
  portalId: number;
}

export interface DailySnapshot {
  todayTasks: SnapshotTask[];
  overdueTasks: SnapshotTask[];
  stats: {
    total: number;
    inProgress: number;
    completed: number;
  };
  generatedAt: string;
}

// ==================== Functions ====================

/**
 * Generate a daily task snapshot for a specific user.
 *
 * For each portal the user has access to (via user_portal_access):
 * - Queries tasks matching their permissions filter (buildTaskAccessFilter)
 * - Collects: tasks with deadline today, overdue tasks, general stats
 *
 * @returns Structured snapshot data or null if user has no access
 */
export function generateDailySnapshot(userId: number): DailySnapshot | null {
  // Build task access filter based on user_portal_access + user_bitrix_mappings
  const accessFilter = buildTaskAccessFilter(userId);

  if (!accessFilter) {
    // User has no portal access or no permissions — return empty snapshot
    return {
      todayTasks: [],
      overdueTasks: [],
      stats: { total: 0, inProgress: 0, completed: 0 },
      generatedAt: new Date().toISOString(),
    };
  }

  const today = new Date().toISOString().split('T')[0];
  const todayStart = `${today}T00:00:00.000Z`;
  const todayEnd = `${today}T23:59:59.999Z`;
  const now = new Date().toISOString();

  // Tasks with deadline today (not completed/deferred)
  const todayTasks = db
    .select({
      id: tasks.id,
      title: tasks.title,
      deadline: tasks.deadline,
      priority: tasks.priority,
      status: tasks.status,
      portalId: tasks.portalId,
      portalName: portals.name,
    })
    .from(tasks)
    .innerJoin(portals, eq(tasks.portalId, portals.id))
    .where(
      and(
        accessFilter,
        sql`${tasks.deadline} BETWEEN ${todayStart} AND ${todayEnd}
          AND ${tasks.status} NOT IN ('COMPLETED', 'DEFERRED', 'SUPPOSEDLY_COMPLETED')`
      )
    )
    .all();

  // Overdue tasks (deadline < today start, not completed/deferred)
  const overdueTasks = db
    .select({
      id: tasks.id,
      title: tasks.title,
      deadline: tasks.deadline,
      priority: tasks.priority,
      status: tasks.status,
      portalId: tasks.portalId,
      portalName: portals.name,
    })
    .from(tasks)
    .innerJoin(portals, eq(tasks.portalId, portals.id))
    .where(
      and(
        accessFilter,
        sql`${tasks.deadline} < ${todayStart}
          AND ${tasks.deadline} IS NOT NULL
          AND ${tasks.status} NOT IN ('COMPLETED', 'DEFERRED', 'SUPPOSEDLY_COMPLETED')`
      )
    )
    .all();

  // General stats: total active tasks, in progress, completed today
  const totalActive = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(tasks)
    .where(
      and(
        accessFilter,
        sql`${tasks.status} NOT IN ('COMPLETED', 'DEFERRED')`
      )
    )
    .get();

  const inProgress = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(tasks)
    .where(
      and(
        accessFilter,
        sql`${tasks.status} = 'IN_PROGRESS'`
      )
    )
    .get();

  const completedToday = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(tasks)
    .where(
      and(
        accessFilter,
        sql`${tasks.status} = 'COMPLETED'
          AND ${tasks.closedDate} BETWEEN ${todayStart} AND ${todayEnd}`
      )
    )
    .get();

  return {
    todayTasks: todayTasks.map((t) => ({
      id: t.id,
      title: t.title,
      deadline: t.deadline,
      priority: t.priority,
      status: t.status,
      portalName: t.portalName,
      portalId: t.portalId,
    })),
    overdueTasks: overdueTasks.map((t) => ({
      id: t.id,
      title: t.title,
      deadline: t.deadline,
      priority: t.priority,
      status: t.status,
      portalName: t.portalName,
      portalId: t.portalId,
    })),
    stats: {
      total: totalActive?.count ?? 0,
      inProgress: inProgress?.count ?? 0,
      completed: completedToday?.count ?? 0,
    },
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generate daily snapshots for all active users with digest notifications enabled.
 *
 * Called by the midnight cron job. Since snapshots are generated on-the-fly
 * (not stored in DB), this primarily serves as a pre-check / logging mechanism.
 *
 * @returns Map of userId → DailySnapshot for all processed users
 */
export function generateAllSnapshots(): Map<number, DailySnapshot> {
  const results = new Map<number, DailySnapshot>();

  // Find all users who have at least one portal access and digest enabled
  const activeUsers = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.notifyDigest, true))
    .all();

  for (const user of activeUsers) {
    try {
      // Check if user has any portal access
      const hasAccess = db
        .select({ id: userPortalAccess.id })
        .from(userPortalAccess)
        .where(eq(userPortalAccess.userId, user.id))
        .get();

      if (!hasAccess) {
        continue; // Skip users with no portal access
      }

      const snapshot = generateDailySnapshot(user.id);
      if (snapshot) {
        results.set(user.id, snapshot);
      }
    } catch (error) {
      console.error(`[snapshot] Failed to generate snapshot for user ${user.id}:`, error);
    }
  }

  console.log(
    `[snapshot] Generated ${results.size} snapshots for ${activeUsers.length} digest-enabled users`
  );

  return results;
}
