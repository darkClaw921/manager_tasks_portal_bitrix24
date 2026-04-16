/**
 * Meetings service layer: CRUD + lifecycle transitions.
 *
 * A meeting's lifecycle:
 *   `scheduled` → `live` (first participant joins) → `ended` (host leaves/deletes)
 *
 * Rules enforced here (rather than in the route handler) so any caller —
 * future background jobs, cron cleanups, test fixtures — goes through the
 * same funnel:
 *   - `createMeeting` always inserts a unique UUID `roomName`.
 *   - `endMeeting` is idempotent: calling it on an already-ended meeting is
 *     a no-op and does NOT re-dispatch the worker stop RPC.
 *   - `markParticipantJoined` auto-upgrades status `scheduled` → `live`.
 *
 * Worker coupling: `endMeeting` asks the meeting-worker to stop any active
 * egress. Worker errors are logged but never propagate — a DB state of
 * `ended` is more important than a clean egress shutdown (worker has its
 * own reconciliation via the `track_published`/`egress_ended` webhooks).
 */

import { db } from '@/lib/db';
import {
  meetings,
  meetingParticipants,
  users,
} from '@/lib/db/schema';
import { eq, and, or, isNull, asc, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { isHost } from '@/lib/meetings/access';
import { stopAllForMeeting } from '@/lib/meetings/egress-client';
import type {
  Meeting,
  MeetingParticipant,
  MeetingStatus,
  ParticipantRole,
} from '@/types/meeting';

// ==================== Inputs ====================

export interface CreateMeetingInput {
  hostId: number;
  title: string;
  recordingEnabled?: boolean;
}

export interface MeetingDetail extends Meeting {
  participants: Array<MeetingParticipant & { userName: string | null }>;
}

// ==================== Queries ====================

/**
 * Create a new meeting. The host is recorded on `meetings.hostId` and also
 * inserted into `meeting_participants` with role `host` so downstream
 * access/listing logic treats them uniformly.
 */
export function createMeeting(input: CreateMeetingInput): Meeting {
  const title = input.title.trim();
  if (!title) {
    throw new Error('createMeeting: title must not be empty');
  }
  if (!Number.isInteger(input.hostId) || input.hostId <= 0) {
    throw new Error('createMeeting: hostId must be a positive integer');
  }

  const roomName = randomUUID();
  const recordingEnabled = Boolean(input.recordingEnabled);

  const meeting = db
    .insert(meetings)
    .values({
      title,
      hostId: input.hostId,
      roomName,
      status: 'scheduled',
      recordingEnabled,
    })
    .returning()
    .get();

  // Host row in the participant table — cheap denormalization that keeps
  // list/access queries symmetric for hosts and invitees.
  db.insert(meetingParticipants)
    .values({
      meetingId: meeting.id,
      userId: input.hostId,
      role: 'host',
    })
    .run();

  return meeting;
}

export function getMeeting(id: number): Meeting | null {
  const row = db
    .select()
    .from(meetings)
    .where(eq(meetings.id, id))
    .get();
  return row ?? null;
}

/**
 * Fetch a meeting together with its participants, joined to `users` for
 * display names. Returns null if the meeting does not exist.
 */
export function getMeetingDetail(id: number): MeetingDetail | null {
  const meeting = getMeeting(id);
  if (!meeting) return null;

  const rows = db
    .select({
      participant: meetingParticipants,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(meetingParticipants)
    .leftJoin(users, eq(users.id, meetingParticipants.userId))
    .where(eq(meetingParticipants.meetingId, id))
    .orderBy(asc(meetingParticipants.joinedAt))
    .all();

  const participants = rows.map((r) => ({
    ...r.participant,
    userName:
      r.firstName && r.lastName ? `${r.firstName} ${r.lastName}`.trim() : null,
  }));

  return { ...meeting, participants };
}

/**
 * List meetings for a user: either host or listed participant. Ordered
 * newest-created first.
 */
export function listMeetings({ userId }: { userId: number }): Meeting[] {
  // Two-step approach avoids DISTINCT/GROUP BY quirks on SQLite joins.
  const meetingIdSet = new Set<number>();

  const hostedIds = db
    .select({ id: meetings.id })
    .from(meetings)
    .where(eq(meetings.hostId, userId))
    .all();
  for (const r of hostedIds) meetingIdSet.add(r.id);

  const participantIds = db
    .select({ meetingId: meetingParticipants.meetingId })
    .from(meetingParticipants)
    .where(eq(meetingParticipants.userId, userId))
    .all();
  for (const r of participantIds) meetingIdSet.add(r.meetingId);

  if (meetingIdSet.size === 0) return [];

  const rows = db
    .select()
    .from(meetings)
    .where(inArray(meetings.id, Array.from(meetingIdSet)))
    .all();

  // Newest first (createdAt is ISO string, lex order matches chronological).
  rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return rows;
}

// ==================== Participants ====================

/**
 * Idempotently add a participant. If the user is already listed the
 * existing row is returned unchanged (role is not downgraded).
 */
export function addParticipant(
  meetingId: number,
  userId: number,
  role: ParticipantRole = 'participant'
): MeetingParticipant {
  const existing = db
    .select()
    .from(meetingParticipants)
    .where(
      and(
        eq(meetingParticipants.meetingId, meetingId),
        eq(meetingParticipants.userId, userId)
      )
    )
    .get();

  if (existing) return existing;

  return db
    .insert(meetingParticipants)
    .values({ meetingId, userId, role })
    .returning()
    .get();
}

/**
 * Remove a participant from a meeting. No-op if the row does not exist.
 * Refuses to remove the host (host removal is via `endMeeting`).
 */
export function removeParticipant(meetingId: number, userId: number): boolean {
  const meeting = db
    .select({ hostId: meetings.hostId })
    .from(meetings)
    .where(eq(meetings.id, meetingId))
    .get();
  if (!meeting) return false;
  if (meeting.hostId === userId) {
    throw new Error('Cannot remove the host from a meeting');
  }
  const result = db
    .delete(meetingParticipants)
    .where(
      and(
        eq(meetingParticipants.meetingId, meetingId),
        eq(meetingParticipants.userId, userId)
      )
    )
    .run();
  return result.changes > 0;
}

/**
 * Record that the participant is currently in the LiveKit room.
 *
 * If the meeting was still `scheduled`, flip it to `live` and set
 * `startedAt`. If no participant row exists yet, one is created
 * (role `participant`). Intended to be called from the `/token` route or
 * from a LiveKit webhook handler in later phases.
 */
export function markParticipantJoined(
  meetingId: number,
  userId: number,
  opts?: { role?: ParticipantRole }
): MeetingParticipant {
  const nowIso = new Date().toISOString();

  // Ensure the row exists (as above, idempotent).
  const participant = addParticipant(meetingId, userId, opts?.role ?? 'participant');

  // Refresh joinedAt only if the participant had previously left — otherwise
  // leave the original join timestamp alone.
  if (participant.leftAt) {
    db.update(meetingParticipants)
      .set({ joinedAt: nowIso, leftAt: null })
      .where(eq(meetingParticipants.id, participant.id))
      .run();
  }

  // Transition meeting to `live` if it was merely `scheduled`.
  const current = db
    .select({ status: meetings.status, startedAt: meetings.startedAt })
    .from(meetings)
    .where(eq(meetings.id, meetingId))
    .get();

  if (current && current.status === 'scheduled') {
    db.update(meetings)
      .set({
        status: 'live',
        startedAt: current.startedAt ?? nowIso,
      })
      .where(eq(meetings.id, meetingId))
      .run();
  }

  return (
    db
      .select()
      .from(meetingParticipants)
      .where(eq(meetingParticipants.id, participant.id))
      .get() ?? participant
  );
}

/**
 * Record that a participant has left. Safe to call repeatedly — only the
 * first call actually writes `leftAt`.
 */
export function markParticipantLeft(
  meetingId: number,
  userId: number
): void {
  const nowIso = new Date().toISOString();
  db.update(meetingParticipants)
    .set({ leftAt: nowIso })
    .where(
      and(
        eq(meetingParticipants.meetingId, meetingId),
        eq(meetingParticipants.userId, userId),
        isNull(meetingParticipants.leftAt)
      )
    )
    .run();
}

// ==================== Lifecycle ====================

/**
 * End a meeting. Transitions status → `ended`, stamps `endedAt`, and
 * fires a best-effort stop-egress RPC to the worker. Idempotent: calling
 * on an already-ended meeting is a no-op.
 */
export async function endMeeting(meetingId: number): Promise<Meeting | null> {
  const current = db
    .select()
    .from(meetings)
    .where(eq(meetings.id, meetingId))
    .get();

  if (!current) return null;
  if (current.status === 'ended') return current;

  const nowIso = new Date().toISOString();

  // Mark every active participant row as left, so the detail view agrees
  // with the meeting status.
  db.update(meetingParticipants)
    .set({ leftAt: nowIso })
    .where(
      and(
        eq(meetingParticipants.meetingId, meetingId),
        isNull(meetingParticipants.leftAt)
      )
    )
    .run();

  const updated = db
    .update(meetings)
    .set({ status: 'ended', endedAt: nowIso })
    .where(eq(meetings.id, meetingId))
    .returning()
    .get();

  // Best-effort worker notification. Never fails the lifecycle transition.
  try {
    await stopAllForMeeting(meetingId);
  } catch (err) {
    console.error(
      '[meetings.endMeeting] meeting-worker stop failed (best-effort):',
      err instanceof Error ? err.message : err
    );
  }

  return updated ?? current;
}

// ==================== Re-exports for convenience ====================

export { isHost };

// Re-exported as plain TypeScript types (not values). This is erased at
// runtime — kept so callers can `import { MeetingStatus } from '.../meetings'`.
export type { MeetingStatus };

// Internal helper used by the participant listing query; re-exported so
// tests and future callers do not need to re-derive a user-filter clause.
export const anyMeetingFilter = (userId: number) =>
  or(
    eq(meetings.hostId, userId),
    eq(meetingParticipants.userId, userId)
  );
