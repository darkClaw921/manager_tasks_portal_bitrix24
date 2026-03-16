import { db } from '@/lib/db';
import { tasks, users } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { sendPushNotification, deliverPushNotification } from './push';
import { createNotification } from '@/lib/bitrix/webhook-handlers';
import { buildTaskAccessFilter } from '@/lib/portals/task-filter';
import { generateDailySnapshot } from './snapshot';
import type { SnapshotTask } from './snapshot';

// ==================== Priority Display ====================

/** Bitrix24 priority values: '0' = low, '1' = normal, '2' = high */
const PRIORITY_LABELS: Record<string, string> = {
  '0': 'НИЗКИЙ',
  '1': '',       // Normal priority — no label shown
  '2': 'ВЫСОКИЙ',
};

// ==================== Formatting Helpers ====================

/** Max tasks to show in push notification body before truncation */
const MAX_TASKS_IN_PUSH = 5;
/** Max characters for push notification body */
const MAX_PUSH_BODY_LENGTH = 200;

/**
 * Format a deadline for display (short Russian date).
 * Example: "14 мар", "15 мар 14:30"
 */
function formatDeadlineShort(deadline: string | null): string {
  if (!deadline) return '';
  try {
    const date = new Date(deadline);
    const day = date.getDate();
    const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    const month = months[date.getMonth()];
    return `${day} ${month}`;
  } catch {
    return '';
  }
}

/**
 * Format a single task line for the digest.
 * Example: "Исправить баг логина [ВЫСОКИЙ]"
 * Example: "Отчёт клиенту (дедлайн: 14 мар)"
 */
function formatTaskLine(task: SnapshotTask, showDeadline: boolean): string {
  const priorityLabel = PRIORITY_LABELS[task.priority] || '';
  const parts: string[] = [task.title];

  if (priorityLabel) {
    parts[0] = `${task.title} [${priorityLabel}]`;
  }

  if (showDeadline && task.deadline) {
    const deadlineStr = formatDeadlineShort(task.deadline);
    if (deadlineStr) {
      parts.push(`(дедлайн: ${deadlineStr})`);
    }
  }

  return parts.join(' ');
}

/**
 * Build a section of the digest (today tasks or overdue tasks).
 * Truncates to MAX_TASKS_IN_PUSH with "...ещё N" suffix.
 */
function buildSection(
  header: string,
  taskList: SnapshotTask[],
  showDeadline: boolean
): string {
  if (taskList.length === 0) return '';

  const lines: string[] = [`${header} (${taskList.length}):`];
  const displayCount = Math.min(taskList.length, MAX_TASKS_IN_PUSH);

  for (let i = 0; i < displayCount; i++) {
    lines.push(`  \u2022 ${formatTaskLine(taskList[i], showDeadline)}`);
  }

  const remaining = taskList.length - displayCount;
  if (remaining > 0) {
    lines.push(`  ...ещё ${remaining}`);
  }

  return lines.join('\n');
}

/**
 * Build the full rich digest message (for DB notification record).
 * Contains all task details without truncation limits.
 */
function buildFullMessage(
  todayTasks: SnapshotTask[],
  overdueTasks: SnapshotTask[],
  stats: { total: number; inProgress: number; completed: number }
): string {
  const sections: string[] = [];

  if (todayTasks.length > 0) {
    const lines = [`Задачи на сегодня (${todayTasks.length}):`];
    for (const task of todayTasks) {
      lines.push(`  \u2022 ${formatTaskLine(task, false)}`);
    }
    sections.push(lines.join('\n'));
  }

  if (overdueTasks.length > 0) {
    const lines = [`Просрочено (${overdueTasks.length}):`];
    for (const task of overdueTasks) {
      lines.push(`  \u2022 ${formatTaskLine(task, true)}`);
    }
    sections.push(lines.join('\n'));
  }

  // Stats summary
  const statParts: string[] = [];
  if (stats.total > 0) statParts.push(`Всего активных: ${stats.total}`);
  if (stats.inProgress > 0) statParts.push(`В работе: ${stats.inProgress}`);
  if (stats.completed > 0) statParts.push(`Завершено сегодня: ${stats.completed}`);
  if (statParts.length > 0) {
    sections.push(statParts.join(' | '));
  }

  return sections.join('\n\n');
}

/**
 * Build truncated push notification body.
 * Keeps within MAX_PUSH_BODY_LENGTH characters.
 */
function buildPushBody(
  todayTasks: SnapshotTask[],
  overdueTasks: SnapshotTask[]
): string {
  const sections: string[] = [];

  if (todayTasks.length > 0) {
    sections.push(buildSection('Задачи на сегодня', todayTasks, false));
  }

  if (overdueTasks.length > 0) {
    sections.push(buildSection('Просрочено', overdueTasks, true));
  }

  if (sections.length === 0) {
    return 'Нет срочных задач';
  }

  let body = sections.join('\n\n');

  // Truncate if exceeds push body limit
  if (body.length > MAX_PUSH_BODY_LENGTH) {
    body = body.substring(0, MAX_PUSH_BODY_LENGTH - 3) + '...';
  }

  return body;
}

// ==================== Main Digest Function ====================

/**
 * Generate and send a daily digest notification for a user.
 *
 * Uses generateDailySnapshot to get task data on-the-fly, then builds:
 * 1. Rich notification message (full details stored in DB notification record)
 * 2. Truncated push body (for mobile push notification)
 *
 * Format example:
 *   Задачи на сегодня (3):
 *     - Исправить баг логина [ВЫСОКИЙ]
 *     - Ревью PR #42
 *     - Подготовка к встрече
 *
 *   Просрочено (1):
 *     - Отчёт клиенту (дедлайн: 14 мар)
 */
export async function generateDigest(userId: number): Promise<void> {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user || !user.notifyDigest) return;

  // Generate snapshot on-the-fly
  const snapshot = generateDailySnapshot(userId);

  if (!snapshot) {
    // User has no portal access — skip digest
    return;
  }

  const { todayTasks, overdueTasks, stats } = snapshot;

  // Nothing to report
  if (todayTasks.length === 0 && overdueTasks.length === 0) {
    return;
  }

  const title = 'Ежедневная сводка';

  // Full message for DB notification record (all task details)
  const fullMessage = buildFullMessage(todayTasks, overdueTasks, stats);

  // Truncated body for push notification (~200 chars)
  const pushBody = buildPushBody(todayTasks, overdueTasks);

  // 1. Create notification in DB with FULL message (all task details)
  createNotification({
    userId,
    type: 'digest',
    title,
    message: fullMessage,
  });

  // 2. Deliver push notification with TRUNCATED body (~200 chars)
  await deliverPushNotification({
    userId,
    type: 'digest',
    title,
    body: pushBody,
  });

  console.log(
    `[digest] Sent rich digest to user ${userId}: today=${todayTasks.length}, overdue=${overdueTasks.length}, stats=${JSON.stringify(stats)}`
  );
}

/**
 * Check for overdue tasks across all users and create notifications.
 *
 * Uses user_portal_access to find each user's accessible portals,
 * then buildTaskAccessFilter to check only tasks they have permission to see.
 */
export async function checkOverdueTasks(): Promise<void> {
  const now = new Date().toISOString();

  // Find all active users with notify_overdue enabled
  const activeUsers = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.notifyOverdue, true))
    .all();

  for (const user of activeUsers) {
    try {
      // Build task access filter based on user_portal_access + user_bitrix_mappings
      const accessFilter = buildTaskAccessFilter(user.id);

      if (!accessFilter) {
        // User has no portal access or no permissions — skip
        continue;
      }

      // Find newly overdue tasks (deadline passed in the last hour, not completed)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      const newlyOverdue = db
        .select({
          id: tasks.id,
          title: tasks.title,
          portalId: tasks.portalId,
          deadline: tasks.deadline,
        })
        .from(tasks)
        .where(
          and(
            accessFilter,
            sql`${tasks.deadline} BETWEEN ${oneHourAgo} AND ${now}
              AND ${tasks.status} NOT IN ('COMPLETED', 'DEFERRED')`
          )
        )
        .all();

      for (const task of newlyOverdue) {
        await sendPushNotification({
          userId: user.id,
          type: 'overdue',
          title: 'Просроченная задача',
          message: `Задача "${task.title}" просрочена`,
          portalId: task.portalId,
          taskId: task.id,
        });
      }

      if (newlyOverdue.length > 0) {
        console.log(
          `[overdue] Found ${newlyOverdue.length} overdue tasks for user ${user.id}`
        );
      }
    } catch (error) {
      console.error(`[overdue] Error checking user ${user.id}:`, error);
    }
  }
}
