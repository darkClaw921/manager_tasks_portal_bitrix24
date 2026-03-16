import { db } from '@/lib/db';
import { tasks, notifications, users } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { fetchSingleTask, upsertTask } from './tasks';
import { syncComments } from './comments';
import { syncChecklist } from './checklist';
import { syncFiles } from './files';
import { sendPushNotification } from '@/lib/notifications/push';
import { resolveNotificationRecipients } from '@/lib/portals/notification-resolver';
import type { NotificationType } from '@/types';

/** Portal info passed from the webhook route (no userId — multi-user model) */
interface PortalInfo {
  id: number;
  domain: string;
}

/**
 * Extract task ID from the webhook event data.
 * Task events have FIELDS_AFTER.ID, comment events have FIELDS_AFTER.TASK_ID.
 */
function extractTaskId(data: Record<string, unknown>): number | null {
  const fieldsAfter = data.FIELDS_AFTER as Record<string, string> | undefined;
  if (!fieldsAfter) return null;

  const id = fieldsAfter.ID;
  return id ? parseInt(String(id), 10) : null;
}

/**
 * Extract comment-specific IDs from the webhook event data.
 * ONTASKCOMMENTADD: FIELDS_AFTER.ID = comment ID, FIELDS_AFTER.TASK_ID = task ID
 */
function extractCommentIds(data: Record<string, unknown>): {
  commentId: number | null;
  taskId: number | null;
} {
  const fieldsAfter = data.FIELDS_AFTER as Record<string, string> | undefined;
  if (!fieldsAfter) return { commentId: null, taskId: null };

  return {
    commentId: fieldsAfter.ID ? parseInt(String(fieldsAfter.ID), 10) : null,
    taskId: fieldsAfter.TASK_ID ? parseInt(String(fieldsAfter.TASK_ID), 10) : null,
  };
}

/**
 * Create a notification record in the database.
 */
export function createNotification(params: {
  userId: number;
  type: NotificationType;
  title: string;
  message?: string | null;
  portalId?: number | null;
  taskId?: number | null;
}): number {
  const result = db
    .insert(notifications)
    .values({
      userId: params.userId,
      type: params.type,
      title: params.title,
      message: params.message || null,
      portalId: params.portalId || null,
      taskId: params.taskId || null,
      isRead: false,
      createdAt: new Date().toISOString(),
    })
    .run();

  return Number(result.lastInsertRowid);
}

/**
 * Get user notification preferences.
 * Returns the notify_* flags for the given user.
 */
function getUserNotifyFlags(userId: number) {
  return db
    .select({
      notifyTaskAdd: users.notifyTaskAdd,
      notifyTaskUpdate: users.notifyTaskUpdate,
      notifyTaskDelete: users.notifyTaskDelete,
      notifyCommentAdd: users.notifyCommentAdd,
      notifyMention: users.notifyMention,
      notifyOverdue: users.notifyOverdue,
      notifyDigest: users.notifyDigest,
    })
    .from(users)
    .where(eq(users.id, userId))
    .get();
}

/**
 * Check if user has a specific notification type enabled.
 */
function isNotifyEnabled(userId: number, type: NotificationType): boolean {
  const flags = getUserNotifyFlags(userId);
  if (!flags) return false;

  switch (type) {
    case 'task_add':
      return flags.notifyTaskAdd;
    case 'task_update':
      return flags.notifyTaskUpdate;
    case 'task_delete':
      return flags.notifyTaskDelete;
    case 'comment_add':
      return flags.notifyCommentAdd;
    case 'mention':
      return flags.notifyMention;
    case 'overdue':
      return flags.notifyOverdue;
    case 'digest':
      return flags.notifyDigest;
    default:
      return true;
  }
}

/**
 * Send a notification with push if the user has the notification type enabled.
 * Falls back to DB-only notification if push is disabled or fails.
 */
async function notifyUser(params: {
  userId: number;
  type: NotificationType;
  title: string;
  message?: string | null;
  portalId?: number | null;
  taskId?: number | null;
}): Promise<void> {
  if (!isNotifyEnabled(params.userId, params.type)) {
    console.log(`[webhook-handler] Notification type ${params.type} disabled for user ${params.userId}, skipping`);
    return;
  }

  try {
    await sendPushNotification(params);
  } catch (error) {
    console.error(`[webhook-handler] Failed to send push notification:`, error);
    // Fall back to DB-only notification
    createNotification(params);
  }
}

/**
 * Notify all resolved recipients for a task event.
 * Resolves recipients from notification-resolver and sends to each.
 */
async function notifyRecipients(
  portalId: number,
  taskInfo: { responsibleId?: string | null; creatorId?: string | null; accomplices?: string | null; auditors?: string | null },
  notification: {
    type: NotificationType;
    title: string;
    message?: string | null;
    taskId?: number | null;
  }
): Promise<void> {
  const recipients = resolveNotificationRecipients(portalId, taskInfo);

  if (recipients.length === 0) {
    console.log(`[webhook-handler] No recipients resolved for portal ${portalId}, skipping notification`);
    return;
  }

  console.log(`[webhook-handler] Notifying ${recipients.length} recipients for portal ${portalId}: [${recipients.join(', ')}]`);

  for (const userId of recipients) {
    await notifyUser({
      userId,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      portalId,
      taskId: notification.taskId,
    });
  }
}

/**
 * Build a TaskInfo object from a Bitrix24 task response.
 * Maps Bitrix field names to the format expected by notification-resolver.
 */
function bitrixTaskToTaskInfo(bitrixTask: Record<string, unknown>): {
  responsibleId: string | null;
  creatorId: string | null;
  accomplices: string | null;
  auditors: string | null;
} {
  const accomplices = bitrixTask.ACCOMPLICES;
  const auditors = bitrixTask.AUDITORS;

  return {
    responsibleId: bitrixTask.RESPONSIBLE_ID ? String(bitrixTask.RESPONSIBLE_ID) : null,
    creatorId: bitrixTask.CREATED_BY ? String(bitrixTask.CREATED_BY) : null,
    accomplices: Array.isArray(accomplices) ? JSON.stringify(accomplices.map(String)) : null,
    auditors: Array.isArray(auditors) ? JSON.stringify(auditors.map(String)) : null,
  };
}

/**
 * Build a TaskInfo object from a local task record.
 */
function localTaskToTaskInfo(localTask: {
  responsibleId?: string | null;
  creatorId?: string | null;
  accomplices?: string | null;
  auditors?: string | null;
}): {
  responsibleId: string | null;
  creatorId: string | null;
  accomplices: string | null;
  auditors: string | null;
} {
  return {
    responsibleId: localTask.responsibleId ?? null,
    creatorId: localTask.creatorId ?? null,
    accomplices: localTask.accomplices ?? null,
    auditors: localTask.auditors ?? null,
  };
}

/**
 * Handle ONTASKADD event.
 * Fetches full task data from Bitrix24 and saves to SQLite.
 */
async function handleTaskAdd(
  data: Record<string, unknown>,
  portal: PortalInfo
): Promise<void> {
  const bitrixTaskId = extractTaskId(data);
  if (!bitrixTaskId) {
    console.error('[webhook-handler] ONTASKADD: Could not extract task ID from data');
    return;
  }

  console.log(`[webhook-handler] ONTASKADD: Fetching task ${bitrixTaskId} from portal ${portal.id}`);

  const bitrixTask = await fetchSingleTask(portal.id, bitrixTaskId);
  if (!bitrixTask) {
    console.error(`[webhook-handler] ONTASKADD: Could not fetch task ${bitrixTaskId} from Bitrix24`);
    return;
  }

  const localTaskId = upsertTask(bitrixTask, portal.id, portal.domain);

  // Sync related data
  try {
    await syncComments(portal.id, bitrixTaskId, localTaskId);
  } catch (error) {
    console.error(`[webhook-handler] ONTASKADD: Failed to sync comments for task ${bitrixTaskId}:`, error);
  }

  try {
    await syncChecklist(portal.id, bitrixTaskId, localTaskId);
  } catch (error) {
    console.error(`[webhook-handler] ONTASKADD: Failed to sync checklist for task ${bitrixTaskId}:`, error);
  }

  try {
    await syncFiles(portal.id, bitrixTaskId, localTaskId);
  } catch (error) {
    console.error(`[webhook-handler] ONTASKADD: Failed to sync files for task ${bitrixTaskId}:`, error);
  }

  // Notify all resolved recipients
  const taskInfo = bitrixTaskToTaskInfo(bitrixTask as unknown as Record<string, unknown>);
  await notifyRecipients(portal.id, taskInfo, {
    type: 'task_add',
    title: 'Новая задача',
    message: `Создана задача: ${bitrixTask.TITLE || `#${bitrixTaskId}`}`,
    taskId: localTaskId,
  });

  console.log(`[webhook-handler] ONTASKADD: Task ${bitrixTaskId} saved as local ID ${localTaskId}`);
}

/**
 * Handle ONTASKUPDATE event.
 * Fetches updated task data from Bitrix24 and updates SQLite.
 */
async function handleTaskUpdate(
  data: Record<string, unknown>,
  portal: PortalInfo
): Promise<void> {
  const bitrixTaskId = extractTaskId(data);
  if (!bitrixTaskId) {
    console.error('[webhook-handler] ONTASKUPDATE: Could not extract task ID from data');
    return;
  }

  console.log(`[webhook-handler] ONTASKUPDATE: Fetching task ${bitrixTaskId} from portal ${portal.id}`);

  const bitrixTask = await fetchSingleTask(portal.id, bitrixTaskId);
  if (!bitrixTask) {
    console.error(`[webhook-handler] ONTASKUPDATE: Could not fetch task ${bitrixTaskId} from Bitrix24`);
    return;
  }

  const localTaskId = upsertTask(bitrixTask, portal.id, portal.domain);

  // Sync related data (might have changed too)
  try {
    await syncComments(portal.id, bitrixTaskId, localTaskId);
  } catch (error) {
    console.error(`[webhook-handler] ONTASKUPDATE: Failed to sync comments for task ${bitrixTaskId}:`, error);
  }

  try {
    await syncChecklist(portal.id, bitrixTaskId, localTaskId);
  } catch (error) {
    console.error(`[webhook-handler] ONTASKUPDATE: Failed to sync checklist for task ${bitrixTaskId}:`, error);
  }

  // Notify all resolved recipients
  const taskInfo = bitrixTaskToTaskInfo(bitrixTask as unknown as Record<string, unknown>);
  await notifyRecipients(portal.id, taskInfo, {
    type: 'task_update',
    title: 'Задача обновлена',
    message: `Обновлена задача: ${bitrixTask.TITLE || `#${bitrixTaskId}`}`,
    taskId: localTaskId,
  });

  console.log(`[webhook-handler] ONTASKUPDATE: Task ${bitrixTaskId} updated (local ID ${localTaskId})`);
}

/**
 * Handle ONTASKDELETE event.
 * Deletes the task from SQLite.
 */
async function handleTaskDelete(
  data: Record<string, unknown>,
  portal: PortalInfo
): Promise<void> {
  const bitrixTaskId = extractTaskId(data);
  if (!bitrixTaskId) {
    console.error('[webhook-handler] ONTASKDELETE: Could not extract task ID from data');
    return;
  }

  console.log(`[webhook-handler] ONTASKDELETE: Deleting task ${bitrixTaskId} from portal ${portal.id}`);

  // Find the local task first (for notification + recipient resolution)
  const localTask = db
    .select({
      id: tasks.id,
      title: tasks.title,
      responsibleId: tasks.responsibleId,
      creatorId: tasks.creatorId,
      accomplices: tasks.accomplices,
      auditors: tasks.auditors,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.portalId, portal.id),
        eq(tasks.bitrixTaskId, bitrixTaskId)
      )
    )
    .get();

  if (!localTask) {
    console.log(`[webhook-handler] ONTASKDELETE: Task ${bitrixTaskId} not found locally, skipping`);
    return;
  }

  // Resolve recipients BEFORE deleting the task
  const taskInfo = localTaskToTaskInfo(localTask);
  await notifyRecipients(portal.id, taskInfo, {
    type: 'task_delete',
    title: 'Задача удалена',
    message: `Удалена задача: ${localTask.title || `#${bitrixTaskId}`}`,
    taskId: null, // Task will be deleted, so no reference
  });

  // Delete the task (cascades to comments, checklist, files)
  db.delete(tasks)
    .where(eq(tasks.id, localTask.id))
    .run();

  console.log(`[webhook-handler] ONTASKDELETE: Task ${bitrixTaskId} (local ID ${localTask.id}) deleted`);
}

/**
 * Handle ONTASKCOMMENTADD event.
 * Fetches the comment and syncs to SQLite. Also checks for mentions.
 */
async function handleCommentAdd(
  data: Record<string, unknown>,
  portal: PortalInfo
): Promise<void> {
  const { commentId, taskId: bitrixTaskId } = extractCommentIds(data);

  if (!bitrixTaskId) {
    // For comment events, try extracting from FIELDS_AFTER.TASK_ID
    // If still no taskId, try to use the data.ID (which might be the task ID in some event formats)
    console.error('[webhook-handler] ONTASKCOMMENTADD: Could not extract task ID from data');
    return;
  }

  console.log(`[webhook-handler] ONTASKCOMMENTADD: Comment ${commentId} on task ${bitrixTaskId}, portal ${portal.id}`);

  // Find the local task
  const localTask = db
    .select({
      id: tasks.id,
      title: tasks.title,
      responsibleId: tasks.responsibleId,
      creatorId: tasks.creatorId,
      accomplices: tasks.accomplices,
      auditors: tasks.auditors,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.portalId, portal.id),
        eq(tasks.bitrixTaskId, bitrixTaskId)
      )
    )
    .get();

  if (!localTask) {
    // Task doesn't exist locally yet - try to sync it first
    console.log(`[webhook-handler] ONTASKCOMMENTADD: Task ${bitrixTaskId} not found locally, syncing first`);
    const bitrixTask = await fetchSingleTask(portal.id, bitrixTaskId);
    if (!bitrixTask) {
      console.error(`[webhook-handler] ONTASKCOMMENTADD: Could not fetch task ${bitrixTaskId} from Bitrix24`);
      return;
    }

    const newLocalTaskId = upsertTask(bitrixTask, portal.id, portal.domain);
    await syncComments(portal.id, bitrixTaskId, newLocalTaskId);

    // Notify all resolved recipients for new comment
    const taskInfo = bitrixTaskToTaskInfo(bitrixTask as unknown as Record<string, unknown>);
    await notifyRecipients(portal.id, taskInfo, {
      type: 'comment_add',
      title: 'Новый комментарий',
      message: `Новый комментарий к задаче: ${bitrixTask.TITLE || `#${bitrixTaskId}`}`,
      taskId: newLocalTaskId,
    });

    // Check for mentions in the new comments
    try {
      const { detectAndNotifyMentions } = await import('@/lib/notifications/mention-detector');
      await detectAndNotifyMentions(portal.id, newLocalTaskId, bitrixTaskId);
    } catch (error) {
      console.error('[webhook-handler] ONTASKCOMMENTADD: Mention detection failed:', error);
    }

    return;
  }

  // Sync comments for existing task
  await syncComments(portal.id, bitrixTaskId, localTask.id);

  // Notify all resolved recipients
  const taskInfo = localTaskToTaskInfo(localTask);
  await notifyRecipients(portal.id, taskInfo, {
    type: 'comment_add',
    title: 'Новый комментарий',
    message: `Новый комментарий к задаче: ${localTask.title || `#${bitrixTaskId}`}`,
    taskId: localTask.id,
  });

  // Check for mentions
  try {
    const { detectAndNotifyMentions } = await import('@/lib/notifications/mention-detector');
    await detectAndNotifyMentions(portal.id, localTask.id, bitrixTaskId);
  } catch (error) {
    console.error('[webhook-handler] ONTASKCOMMENTADD: Mention detection failed:', error);
  }

  console.log(`[webhook-handler] ONTASKCOMMENTADD: Comment synced for task ${bitrixTaskId} (local ID ${localTask.id})`);
}

/**
 * Handle ONTASKCOMMENTUPDATE event.
 * Re-syncs all comments for the task.
 */
async function handleCommentUpdate(
  data: Record<string, unknown>,
  portal: PortalInfo
): Promise<void> {
  const { taskId: bitrixTaskId } = extractCommentIds(data);

  if (!bitrixTaskId) {
    console.error('[webhook-handler] ONTASKCOMMENTUPDATE: Could not extract task ID from data');
    return;
  }

  // Find the local task
  const localTask = db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.portalId, portal.id),
        eq(tasks.bitrixTaskId, bitrixTaskId)
      )
    )
    .get();

  if (!localTask) {
    console.log(`[webhook-handler] ONTASKCOMMENTUPDATE: Task ${bitrixTaskId} not found locally, skipping`);
    return;
  }

  // Re-sync all comments
  await syncComments(portal.id, bitrixTaskId, localTask.id);

  console.log(`[webhook-handler] ONTASKCOMMENTUPDATE: Comments re-synced for task ${bitrixTaskId}`);
}

/**
 * Main event dispatcher.
 * Routes the webhook event to the appropriate handler.
 */
export async function handleWebhookEvent(
  event: string,
  data: Record<string, unknown>,
  portal: PortalInfo
): Promise<void> {
  switch (event) {
    case 'ONTASKADD':
      await handleTaskAdd(data, portal);
      break;
    case 'ONTASKUPDATE':
      await handleTaskUpdate(data, portal);
      break;
    case 'ONTASKDELETE':
      await handleTaskDelete(data, portal);
      break;
    case 'ONTASKCOMMENTADD':
      await handleCommentAdd(data, portal);
      break;
    case 'ONTASKCOMMENTUPDATE':
      await handleCommentUpdate(data, portal);
      break;
    default:
      console.log(`[webhook-handler] Unhandled event type: ${event}`);
  }
}
