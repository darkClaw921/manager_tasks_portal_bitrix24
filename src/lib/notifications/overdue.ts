import { db } from '@/lib/db';
import { tasks, users } from '@/lib/db/schema';
import { eq, and, lt, not, inArray } from 'drizzle-orm';
import { sendPushNotification } from '@/lib/notifications/push';
import { buildTaskAccessFilter } from '@/lib/portals/task-filter';

/**
 * Check for overdue tasks and send push notifications.
 *
 * For each user (via user_portal_access, not portals.userId):
 * 1. Build a task access filter based on user's portal permissions and mappings
 * 2. Find tasks matching the filter with deadline < now and not completed/deferred
 * 3. Send a push notification for each overdue task (respects notify_overdue flag)
 *
 * @param userId - If provided, check only for this user. Otherwise check all users.
 */
export async function checkOverdueTasks(userId?: number): Promise<number> {
  const now = new Date().toISOString();
  let notificationCount = 0;

  // Get users to check
  let userList: Array<{ id: number; notifyOverdue: boolean }>;

  if (userId) {
    const user = db
      .select({ id: users.id, notifyOverdue: users.notifyOverdue })
      .from(users)
      .where(eq(users.id, userId))
      .get();

    userList = user ? [user] : [];
  } else {
    userList = db
      .select({ id: users.id, notifyOverdue: users.notifyOverdue })
      .from(users)
      .all();
  }

  for (const user of userList) {
    // Skip users who disabled overdue notifications
    if (!user.notifyOverdue) {
      continue;
    }

    // Build task access filter based on user_portal_access + user_bitrix_mappings
    const accessFilter = buildTaskAccessFilter(user.id);

    if (!accessFilter) {
      // User has no portal access or no permissions — skip
      continue;
    }

    // Find overdue tasks: deadline is past AND not completed/deferred,
    // filtered by user's access permissions
    const completedStatuses = ['COMPLETED', 'DEFERRED', 'SUPPOSEDLY_COMPLETED'];
    const overdueTasks = db
      .select({
        id: tasks.id,
        title: tasks.title,
        deadline: tasks.deadline,
        portalId: tasks.portalId,
        status: tasks.status,
      })
      .from(tasks)
      .where(
        and(
          accessFilter,
          lt(tasks.deadline, now),
          not(inArray(tasks.status, completedStatuses))
        )
      )
      .all();

    for (const task of overdueTasks) {
      if (!task.deadline) continue;

      try {
        await sendPushNotification({
          userId: user.id,
          type: 'overdue',
          title: 'Просроченная задача',
          message: `Задача "${task.title}" просрочена (дедлайн: ${formatDeadline(task.deadline)})`,
          portalId: task.portalId,
          taskId: task.id,
        });
        notificationCount++;
      } catch (error) {
        console.error(`[overdue] Failed to notify user ${user.id} about task ${task.id}:`, error);
      }
    }

    if (overdueTasks.length > 0) {
      console.log(`[overdue] Found ${overdueTasks.length} overdue tasks for user ${user.id}, sent ${notificationCount} notifications`);
    }
  }

  return notificationCount;
}

/**
 * Format a deadline string for display in notifications.
 */
function formatDeadline(deadline: string): string {
  try {
    const date = new Date(deadline);
    return date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return deadline;
  }
}
