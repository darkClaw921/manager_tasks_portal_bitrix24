/**
 * Guest invite token service.
 *
 * A host can mint a random URL-safe token that lets unauthenticated users
 * join a meeting with a display name of their choice. The token itself is
 * the only bearer: anyone holding the URL can join. Tokens are revocable
 * by the host — revocation stamps `revokedAt` and blocks further joins.
 *
 * We deliberately do not rate-limit or pre-register guest names: the host
 * is responsible for sharing the link securely. LiveKit identities are
 * generated per-join as `guest:<uuid>` so participant counts are accurate
 * even when two guests pick the same display name.
 */

import { db } from '@/lib/db';
import { meetingGuestTokens } from '@/lib/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { randomBytes, randomUUID } from 'node:crypto';
import type { MeetingGuestToken } from '@/lib/db/schema';

/** Minted token bound to a specific meeting. */
export interface GuestInviteRecord {
  token: string;
  meetingId: number;
  createdBy: number;
  createdAt: string;
}

/** Identity string used when minting a LiveKit token for a guest. */
export function buildGuestIdentity(): string {
  return `guest:${randomUUID()}`;
}

/** True iff the identity was minted by `buildGuestIdentity`. */
export function isGuestIdentity(identity: string): boolean {
  return identity.startsWith('guest:');
}

/**
 * Create a new guest invite token for a meeting. Callers are expected to
 * have verified host/admin permission on the meeting.
 */
export function createGuestToken(
  meetingId: number,
  createdBy: number
): GuestInviteRecord {
  const token = randomBytes(24).toString('base64url');
  const row = db
    .insert(meetingGuestTokens)
    .values({ meetingId, token, createdBy })
    .returning()
    .get();
  return {
    token: row.token,
    meetingId: row.meetingId,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

/** List active (non-revoked) guest tokens for a meeting. */
export function listActiveGuestTokens(meetingId: number): MeetingGuestToken[] {
  return db
    .select()
    .from(meetingGuestTokens)
    .where(
      and(
        eq(meetingGuestTokens.meetingId, meetingId),
        isNull(meetingGuestTokens.revokedAt)
      )
    )
    .all();
}

/**
 * Resolve an invite token to its meetingId. Returns null when the token is
 * unknown or has been revoked.
 */
export function findActiveGuestToken(token: string): MeetingGuestToken | null {
  const row = db
    .select()
    .from(meetingGuestTokens)
    .where(
      and(
        eq(meetingGuestTokens.token, token),
        isNull(meetingGuestTokens.revokedAt)
      )
    )
    .get();
  return row ?? null;
}

/**
 * Revoke a guest token. Idempotent: revoking an already-revoked or missing
 * token returns `false` instead of throwing.
 */
export function revokeGuestToken(token: string): boolean {
  const nowIso = new Date().toISOString();
  const result = db
    .update(meetingGuestTokens)
    .set({ revokedAt: nowIso })
    .where(
      and(
        eq(meetingGuestTokens.token, token),
        isNull(meetingGuestTokens.revokedAt)
      )
    )
    .run();
  return result.changes > 0;
}
