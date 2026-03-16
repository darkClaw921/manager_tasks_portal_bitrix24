import { db } from '@/lib/db';
import { taskComments, tasks, notifications } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { sendPushNotification } from '@/lib/notifications/push';
import { resolveRecipientsForMention } from '@/lib/portals/notification-resolver';

/**
 * Detect [user=ID] mentions in Bitrix24 BBCode format.
 * Returns array of unique mentioned Bitrix user IDs.
 *
 * Supported patterns:
 * - [user=123]Name[/user] (standard Bitrix24 BBCode)
 * - [user=123] (without closing tag)
 */
export function detectMentions(text: string): number[] {
  if (!text) return [];

  const mentions: number[] = [];
  // Bitrix24 format: [user=123]Name[/user] or [user=123]
  const regex = /\[user=(\d+)\]/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const userId = parseInt(match[1], 10);
    if (userId > 0 && !mentions.includes(userId)) {
      mentions.push(userId);
    }
  }

  return mentions;
}

/**
 * Check the most recently added comment for mentions and create notifications.
 * Called from handleCommentAdd webhook handler.
 *
 * Approach:
 * - Get the latest comment for the task (the one just added by the webhook)
 * - Parse it for [user=ID] mentions
 * - Resolve mentioned Bitrix24 user IDs to app users via user_bitrix_mappings
 * - Create mention notifications for each resolved app user
 * - Only creates notification if no duplicate mention notification already exists
 *   for this task from the same user within 60 seconds
 * - Sends Web Push notification with "mention" type (respects notify_mention flag)
 */
export async function detectAndNotifyMentions(
  portalId: number,
  localTaskId: number,
  _bitrixTaskId: number
): Promise<void> {
  // Get the task title for notification message
  const task = db
    .select({ title: tasks.title })
    .from(tasks)
    .where(eq(tasks.id, localTaskId))
    .get();

  const taskTitle = task?.title || `Задача #${localTaskId}`;

  // Get the most recent comment for this task (the one just added)
  const latestComment = db
    .select({
      id: taskComments.id,
      postMessage: taskComments.postMessage,
      authorId: taskComments.authorId,
      authorName: taskComments.authorName,
    })
    .from(taskComments)
    .where(eq(taskComments.taskId, localTaskId))
    .orderBy(desc(taskComments.id))
    .limit(1)
    .get();

  if (!latestComment || !latestComment.postMessage) return;

  const mentionedBitrixUserIds = detectMentions(latestComment.postMessage);
  if (mentionedBitrixUserIds.length === 0) return;

  const authorName = latestComment.authorName || 'Кто-то';

  // Resolve mentioned Bitrix24 user IDs to app users via mapping
  const mentionedBitrixStrings = mentionedBitrixUserIds.map(String);
  const recipientUserIds = resolveRecipientsForMention(portalId, mentionedBitrixStrings);

  if (recipientUserIds.length === 0) {
    console.log(
      `[mention-detector] No mapped app users for mentioned bitrix IDs [${mentionedBitrixUserIds.join(', ')}] on portal ${portalId}`
    );
    return;
  }

  // Send mention notification to each resolved app user (with dedup check)
  for (const recipientUserId of recipientUserIds) {
    // Check if we already have a recent mention notification for this task and user
    // to avoid duplicates from webhook retries
    const existingMention = db
      .select({ id: notifications.id, createdAt: notifications.createdAt })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, recipientUserId),
          eq(notifications.type, 'mention'),
          eq(notifications.taskId, localTaskId)
        )
      )
      .orderBy(desc(notifications.id))
      .limit(1)
      .get();

    // If there's a very recent mention notification (within last 60 seconds), skip
    if (existingMention?.createdAt) {
      const createdTime = new Date(existingMention.createdAt).getTime();
      const now = Date.now();
      if (now - createdTime < 60_000) {
        console.log(
          `[mention-detector] Skipping duplicate mention notification for user ${recipientUserId} (within 60s)`
        );
        continue;
      }
    }

    // Send mention notification with push (respects notify_mention flag via sendPushNotification)
    await sendPushNotification({
      userId: recipientUserId,
      type: 'mention',
      title: 'Вас упомянули в комментарии',
      message: `${authorName} упомянул вас в задаче: ${taskTitle}`,
      portalId,
      taskId: localTaskId,
    });
  }

  console.log(
    `[mention-detector] Created mention notifications for users [${recipientUserIds.join(', ')}], ` +
    `task ${localTaskId}, mentioned bitrix IDs: [${mentionedBitrixUserIds.join(', ')}]`
  );
}
