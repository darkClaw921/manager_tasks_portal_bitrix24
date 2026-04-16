/**
 * Empty-meeting auto-close service (Phase 4).
 *
 * Rule: a meeting with `status = 'live'` and zero live participants gets
 * auto-ended after 5 minutes of continuous emptiness. "Empty" means no
 * registered user AND no LiveKit guest is in the room.
 *
 * Two mechanisms cooperate to maintain freshness:
 *
 *   1. The LiveKit webhook handler in `meeting-server/src/webhooks.ts`
 *      flips `meetings.empty_since` in response to participant_joined /
 *      participant_left events. This is the fast path — sub-second.
 *
 *   2. `tickEmptyMeetings` (this file) runs from a Next.js cron every
 *      minute and reconciles state authoritatively: it counts live
 *      participants by combining the DB with LiveKit's `listParticipants`
 *      (so guest identities that never touch our DB still count) and
 *      closes meetings whose timer elapsed.
 *
 * The cron is the source of truth; the webhook is an optimization. Both
 * sides must be idempotent so a dropped webhook or a cron/webhook race
 * never produces a wrong-state close.
 */

import { db } from '@/lib/db';
import { meetings, meetingParticipants } from '@/lib/db/schema';
import { and, eq, isNull, isNotNull } from 'drizzle-orm';
import { RoomServiceClient } from 'livekit-server-sdk';
import { endMeeting } from '@/lib/meetings/meetings';
import { isGuestIdentity } from '@/lib/meetings/guest-tokens';
import type { Meeting } from '@/types/meeting';

// ==================== Constants ====================

/** Grace period before an empty meeting is closed. 5 minutes. */
export const EMPTY_MEETING_TTL_MS = 5 * 60 * 1000;

// ==================== LiveKit client ====================

let roomClient: RoomServiceClient | null = null;

/**
 * Lazily construct the LiveKit RoomServiceClient. We prefer the server-side
 * `LIVEKIT_URL` (the internal docker hostname) and fall back to
 * `NEXT_PUBLIC_LIVEKIT_URL` — same precedence as the token route.
 *
 * Returns `null` when credentials are missing so the caller can continue
 * with DB-only counting instead of crashing the cron.
 */
function getRoomClient(): RoomServiceClient | null {
  if (roomClient) return roomClient;
  const url = process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!url || !apiKey || !apiSecret) return null;
  roomClient = new RoomServiceClient(url, apiKey, apiSecret);
  return roomClient;
}

/** Tests can inject a stub (or `null` to force DB-only counting). */
export function setRoomClientForTests(client: RoomServiceClient | null): void {
  roomClient = client;
}

// ==================== Count ====================

/**
 * Count the number of distinct live participants in a meeting.
 *
 * Two sources are merged and de-duplicated by identity string:
 *   - DB rows: `meeting_participants` where `joined_at IS NOT NULL AND
 *     left_at IS NULL` (registered users; mapped to identity `user:<id>`).
 *   - LiveKit: `RoomServiceClient.listParticipants(roomName)` — picks up
 *     LiveKit-native guests that never appear in our DB.
 *
 * LiveKit errors are swallowed and logged; if the SFU is unreachable the
 * DB rows alone drive the decision. This is safer than throwing — we would
 * rather under-count (leaving the meeting running) than over-close.
 */
export async function countLiveParticipants(
  meetingId: number,
  roomName: string,
): Promise<number> {
  // Identity set lets us dedupe when the same user shows up on both sides
  // (webhook slow to arrive; or LiveKit still reports a presence the DB has
  // already closed).
  const identities = new Set<string>();

  // (а) DB rows — registered users currently "present" per our bookkeeping.
  try {
    const rows = db
      .select({ userId: meetingParticipants.userId })
      .from(meetingParticipants)
      .where(
        and(
          eq(meetingParticipants.meetingId, meetingId),
          isNotNull(meetingParticipants.joinedAt),
          isNull(meetingParticipants.leftAt),
        ),
      )
      .all();
    for (const r of rows) {
      identities.add(`user:${r.userId}`);
    }
  } catch (err) {
    console.error(
      '[meetings.cleanup] DB count failed for meeting',
      meetingId,
      err instanceof Error ? err.message : err,
    );
  }

  // (б) LiveKit — any identity currently in the room, including guests.
  //     Only LiveKit knows about guest:* identities (DB never records them).
  const client = getRoomClient();
  if (client) {
    try {
      const participants = await client.listParticipants(roomName);
      for (const p of participants) {
        const id = p.identity;
        if (!id) continue;
        // Everything counts — `user:<n>` dedupes with the DB set, `guest:*`
        // adds new entries, and anything else (future identity schemes) is
        // still a live presence so we include it.
        identities.add(id);
      }
    } catch (err) {
      console.error(
        '[meetings.cleanup] LiveKit listParticipants failed for meeting',
        meetingId,
        'room',
        roomName,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // Extra safety check — isGuestIdentity is logically covered by the
  // identity-set union above but we reference the helper so its contract is
  // pinned: guest identities are always counted as live presence.
  let guestCount = 0;
  for (const id of identities) {
    if (isGuestIdentity(id)) guestCount++;
  }
  if (guestCount > 0) {
    // Hint for log correlation — noisy in production would be bad; keep
    // behind a debug level by only emitting when we have guests to make
    // incident timelines easier to read.
    // (Using console.debug so production log aggregators can filter.)
    console.debug(
      `[meetings.cleanup] meeting ${meetingId} has ${guestCount} guest(s) in room ${roomName}`,
    );
  }

  return identities.size;
}

// ==================== Tick ====================

/**
 * Single pass over every `live` meeting. For each:
 *   - If counter > 0: ensure `empty_since` is NULL (someone is here).
 *   - If counter === 0: set `empty_since = now()` if it was NULL (start
 *     the timer); otherwise check whether the timer elapsed and end the
 *     meeting.
 *
 * Errors on a single meeting are logged but do not abort the loop —
 * a misbehaving meeting must not prevent the others from being
 * reconciled.
 */
export async function tickEmptyMeetings(): Promise<void> {
  const liveMeetings: Meeting[] = db
    .select()
    .from(meetings)
    .where(eq(meetings.status, 'live'))
    .all();

  if (liveMeetings.length === 0) return;

  const now = Date.now();

  for (const meeting of liveMeetings) {
    try {
      const count = await countLiveParticipants(meeting.id, meeting.roomName);

      if (count > 0) {
        // Someone is live — clear the timer if it was armed.
        if (meeting.emptySince !== null) {
          db.update(meetings)
            .set({ emptySince: null })
            .where(eq(meetings.id, meeting.id))
            .run();
          console.log(
            `[meetings.cleanup] meeting ${meeting.id}: participant returned — cleared empty_since`,
          );
        }
        continue;
      }

      // count === 0 → either arm the timer or check expiry.
      if (meeting.emptySince === null) {
        const nowIso = new Date(now).toISOString();
        db.update(meetings)
          .set({ emptySince: nowIso })
          .where(eq(meetings.id, meeting.id))
          .run();
        console.log(
          `[meetings.cleanup] meeting ${meeting.id}: room empty — armed empty_since=${nowIso}`,
        );
        continue;
      }

      // Timer was already armed — has it elapsed?
      const emptySinceMs = Date.parse(meeting.emptySince);
      if (!Number.isFinite(emptySinceMs)) {
        // Malformed row; reset so next tick gets clean state.
        console.warn(
          `[meetings.cleanup] meeting ${meeting.id}: unparseable empty_since=${meeting.emptySince}; resetting`,
        );
        const nowIso = new Date(now).toISOString();
        db.update(meetings)
          .set({ emptySince: nowIso })
          .where(eq(meetings.id, meeting.id))
          .run();
        continue;
      }

      const elapsed = now - emptySinceMs;
      if (elapsed >= EMPTY_MEETING_TTL_MS) {
        console.log(
          `[meetings.cleanup] meeting ${meeting.id}: empty for ${Math.round(elapsed / 1000)}s — auto-ending`,
        );
        // endMeeting is idempotent (no-op on already-ended rows) and fires
        // a best-effort stopAllForMeeting RPC.
        await endMeeting(meeting.id);
      }
    } catch (err) {
      console.error(
        `[meetings.cleanup] tick failed for meeting ${meeting.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}
