/**
 * Meeting-invite notifications.
 *
 * Fans a single invite event out to every newly added participant:
 *   - writes a row to `notifications` (type: `meeting_invite`, link:
 *     `/meetings/<id>`) so the in-app bell picks it up;
 *   - attempts a Web Push via the shared `sendPushNotification` helper so
 *     users with an active subscription hear about the invite even if the
 *     portal tab is closed.
 *
 * Errors per-recipient are logged but never propagated — a failing push
 * for one invitee must not block the rest of the fan-out or the caller's
 * HTTP response. The caller decides whether to await the full batch.
 */

import { db } from '@/lib/db';
import { meetings, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { sendPushNotification } from '@/lib/notifications/push';

/**
 * Notify each `userId` that they have been invited to `meetingId`.
 *
 * - Looks up the meeting title and the inviter's name once, then fans
 *   out one notification + push per invitee.
 * - Skips `inviterId` if it appears in `userIds` (no one should be
 *   notified that they invited themselves).
 * - Returns when all per-user writes/pushes have settled. Resolves to
 *   `void` regardless of individual failures.
 */
export async function notifyInvitedUsers(
  meetingId: number,
  userIds: number[],
  inviterId: number
): Promise<void> {
  if (!Array.isArray(userIds) || userIds.length === 0) return;

  // Look up the meeting — if it no longer exists we silently bail. The
  // caller has already checked existence by the time we get here, so a
  // miss would only happen in race-condition / deletion scenarios.
  const meeting = db
    .select({ id: meetings.id, title: meetings.title })
    .from(meetings)
    .where(eq(meetings.id, meetingId))
    .get();
  if (!meeting) {
    console.warn(
      `[invite-notifications] meeting ${meetingId} not found; skipping notify`
    );
    return;
  }

  // Inviter name — used in the notification body. Missing user → fall
  // back to a generic label so we still produce a readable push.
  const inviter = db
    .select({ firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(eq(users.id, inviterId))
    .get();
  const inviterName = inviter
    ? `${inviter.firstName} ${inviter.lastName}`.trim() || 'Организатор'
    : 'Организатор';

  const link = `/meetings/${meeting.id}`;
  const title = 'Приглашение на встречу';
  const message = `${inviterName} пригласил вас на встречу: ${meeting.title}`;

  // De-duplicate and drop the inviter, in case they appear in the list.
  const recipients = Array.from(new Set(userIds)).filter(
    (uid) => Number.isInteger(uid) && uid > 0 && uid !== inviterId
  );

  if (recipients.length === 0) return;

  await Promise.all(
    recipients.map(async (userId) => {
      try {
        await sendPushNotification({
          userId,
          type: 'meeting_invite',
          title,
          message,
          link,
        });
      } catch (err) {
        console.error(
          `[invite-notifications] failed to notify user ${userId} for meeting ${meetingId}:`,
          err instanceof Error ? err.message : err
        );
      }
    })
  );
}
