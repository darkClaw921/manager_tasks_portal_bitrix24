/**
 * Access control for meetings.
 *
 * A user can join a meeting if any of the following holds:
 *   1. They are the host (`meetings.hostId === userId`).
 *   2. They are listed in `meeting_participants` (persisted membership).
 *   3. They have TaskHub admin role (`users.isAdmin === true`).
 *
 * The functions never throw for a "permission denied" state — they return
 * `false`. Actual 401/403 HTTP mapping happens in the route layer.
 */

import { db } from '@/lib/db';
import { meetings, meetingParticipants, users } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * Returns true iff `userId` is the host of the given meeting.
 *
 * Returns false if the meeting does not exist.
 */
export async function isHost(userId: number, meetingId: number): Promise<boolean> {
  const row = db
    .select({ hostId: meetings.hostId })
    .from(meetings)
    .where(eq(meetings.id, meetingId))
    .get();

  if (!row) return false;
  return row.hostId === userId;
}

/**
 * Returns true iff `userId` is allowed to join the meeting.
 *
 * Evaluation order matches the rules in the module docstring: host → listed
 * participant → TaskHub admin. Non-existent meetings resolve to `false`.
 */
export async function canJoinMeeting(
  userId: number,
  meetingId: number
): Promise<boolean> {
  // 1. Host check (also verifies meeting exists).
  const meetingRow = db
    .select({ hostId: meetings.hostId })
    .from(meetings)
    .where(eq(meetings.id, meetingId))
    .get();

  if (!meetingRow) return false;
  if (meetingRow.hostId === userId) return true;

  // 2. Listed participant check.
  const participantRow = db
    .select({ id: meetingParticipants.id })
    .from(meetingParticipants)
    .where(
      and(
        eq(meetingParticipants.meetingId, meetingId),
        eq(meetingParticipants.userId, userId)
      )
    )
    .get();

  if (participantRow) return true;

  // 3. TaskHub admin override.
  const adminRow = db
    .select({ isAdmin: users.isAdmin })
    .from(users)
    .where(eq(users.id, userId))
    .get();

  if (adminRow?.isAdmin) return true;

  return false;
}
