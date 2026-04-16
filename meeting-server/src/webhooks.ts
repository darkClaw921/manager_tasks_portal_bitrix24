/**
 * LiveKit webhook receiver.
 *
 * LiveKit posts `application/webhook+json` bodies signed with a JWT that
 * embeds a sha256 hash of the payload. We verify it with the official
 * `WebhookReceiver` (which internally uses the API key/secret from config)
 * and then dispatch by event type:
 *
 *   - `track_published`    — if the meeting is currently recording and the
 *     published track is audio, start a per-track egress for it.
 *   - `egress_ended`       — mark the matching `meeting_recordings` row as
 *     done/failed, persist file size + end time, and trigger the muxer once
 *     every per-user audio + composite egress for the meeting is done.
 *   - `participant_joined` — record the join in `meeting_participants` so
 *     the Next.js side has a single source of truth for attendance.
 *   - `participant_left`   — close the corresponding participant row.
 *   - `room_finished`      — stop anything still active for the meeting so
 *     we do not leak egress processes if a host hard-closes a room.
 *
 * Unknown events are logged and acknowledged (2xx) so LiveKit does not
 * retry them into a queue we cannot drain.
 */

import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { WebhookReceiver } from 'livekit-server-sdk';
import type { WebhookEvent } from 'livekit-server-sdk';
import type { EgressInfo, ParticipantInfo, Room, TrackInfo } from '@livekit/protocol';
import { EgressStatus, TrackType } from '@livekit/protocol';
import { config } from './config.js';
import {
  getMeetingByRoomName,
  getRecordingByEgressId,
  listDoneAudioForMeeting,
  listDoneMixedForMeeting,
  markParticipantJoined,
  markParticipantLeft,
  updateRecordingStatus,
} from './db.js';
import { startTrackEgress, stopAllForMeeting } from './egress.js';
import { runForMeeting } from './muxer.js';

// ==================== receiver singleton ====================

let receiver: WebhookReceiver | null = null;

function getReceiver(): WebhookReceiver {
  if (receiver) return receiver;
  receiver = new WebhookReceiver(config.livekit.apiKey, config.livekit.apiSecret);
  return receiver;
}

/** Tests can swap in a stub. */
export function setWebhookReceiver(r: WebhookReceiver): void {
  receiver = r;
}

// ==================== identity helpers ====================

/**
 * LiveKit identities are strings. TaskHub uses numeric `user_id`s embedded in
 * the participant identity as "user:<id>". Anything else is ignored for DB
 * writes but still logged.
 */
export function parseUserIdFromIdentity(identity: string | undefined): number | null {
  if (!identity) return null;
  const m = identity.match(/^user:(\d+)$/);
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isFinite(id) && id > 0 ? id : null;
}

// ==================== event handlers ====================

interface HandlerCtx {
  log: FastifyRequest['log'];
}

async function handleTrackPublished(
  event: WebhookEvent,
  ctx: HandlerCtx,
): Promise<void> {
  const room = event.room as Room | undefined;
  const participant = event.participant as ParticipantInfo | undefined;
  const track = event.track as TrackInfo | undefined;

  if (!room || !participant || !track) {
    ctx.log.warn({ event: event.event }, 'track_published without room/participant/track');
    return;
  }

  // Only audio tracks feed the per-user recorder.
  if (track.type !== TrackType.AUDIO) return;

  const meeting = getMeetingByRoomName(room.name);
  if (!meeting) {
    ctx.log.warn({ roomName: room.name }, 'track_published for unknown meeting room');
    return;
  }
  if (!meeting.recording_enabled || meeting.status !== 'live') {
    // No recording in progress — nothing to do.
    return;
  }

  const uid = parseUserIdFromIdentity(participant.identity);
  const userLabel = uid !== null ? String(uid) : participant.identity;

  try {
    const started = await startTrackEgress({
      roomName: room.name,
      trackId: track.sid,
      userId: userLabel,
      meetingId: meeting.id,
    });
    ctx.log.info(
      { meetingId: meeting.id, trackId: track.sid, egressId: started.egressId },
      'started per-track audio egress on late-join',
    );
  } catch (err) {
    ctx.log.error({ err }, 'failed to start track egress for late-joiner');
  }
}

async function handleParticipantJoined(
  event: WebhookEvent,
  ctx: HandlerCtx,
): Promise<void> {
  const room = event.room as Room | undefined;
  const participant = event.participant as ParticipantInfo | undefined;
  if (!room || !participant) return;

  const meeting = getMeetingByRoomName(room.name);
  if (!meeting) {
    ctx.log.warn({ roomName: room.name }, 'participant_joined for unknown room');
    return;
  }
  const uid = parseUserIdFromIdentity(participant.identity);
  if (uid === null) {
    ctx.log.warn(
      { identity: participant.identity },
      'participant_joined with non-user identity — skipping DB write',
    );
    return;
  }
  markParticipantJoined(meeting.id, uid);
}

async function handleParticipantLeft(
  event: WebhookEvent,
  ctx: HandlerCtx,
): Promise<void> {
  const room = event.room as Room | undefined;
  const participant = event.participant as ParticipantInfo | undefined;
  if (!room || !participant) return;

  const meeting = getMeetingByRoomName(room.name);
  if (!meeting) return;
  const uid = parseUserIdFromIdentity(participant.identity);
  if (uid === null) {
    ctx.log.warn({ identity: participant.identity }, 'participant_left with non-user identity');
    return;
  }
  markParticipantLeft(meeting.id, uid);
}

async function handleEgressEnded(
  event: WebhookEvent,
  ctx: HandlerCtx,
): Promise<void> {
  const egress = event.egressInfo as EgressInfo | undefined;
  if (!egress || !egress.egressId) {
    ctx.log.warn({ event: event.event }, 'egress_ended without egressInfo');
    return;
  }

  const row = getRecordingByEgressId(egress.egressId);
  if (!row) {
    ctx.log.warn({ egressId: egress.egressId }, 'egress_ended for unknown recording');
    return;
  }

  const finalStatus =
    egress.status === EgressStatus.EGRESS_COMPLETE ? 'done' : 'failed';

  // Prefer the size reported in the first file result; fall back to null.
  const fileResult = egress.fileResults?.[0];
  const sizeBytes =
    fileResult && fileResult.size !== undefined ? Number(fileResult.size) : null;

  // LiveKit timestamps are in nanoseconds (bigint) per the proto; convert to
  // an ISO string for DB storage.
  const endedAt =
    egress.endedAt && egress.endedAt > 0n
      ? new Date(Number(egress.endedAt / 1_000_000n)).toISOString()
      : new Date().toISOString();

  updateRecordingStatus(
    egress.egressId,
    finalStatus,
    sizeBytes,
    endedAt,
  );

  ctx.log.info(
    { egressId: egress.egressId, status: finalStatus, sizeBytes },
    'egress ended — recording settled',
  );

  if (finalStatus !== 'done') return;

  // After every audio + mixed egress for the meeting has settled to `done`,
  // kick the muxer. A pending per-track egress (for another speaker) will
  // defer the mux until its own egress_ended arrives.
  const meetingId = row.meeting_id;
  const hasPendingRecording = await anyRecordingStillActive(meetingId);
  if (hasPendingRecording) return;

  // Confirm we actually have at least one audio and one mixed completed.
  const audios = listDoneAudioForMeeting(meetingId);
  const mixed = listDoneMixedForMeeting(meetingId);
  if (audios.length === 0 && mixed.length === 0) return;

  try {
    await runForMeeting(meetingId);
  } catch (err) {
    ctx.log.error({ err, meetingId }, 'muxer.runForMeeting failed');
  }
}

async function handleRoomFinished(
  event: WebhookEvent,
  ctx: HandlerCtx,
): Promise<void> {
  const room = event.room as Room | undefined;
  if (!room) return;
  const meeting = getMeetingByRoomName(room.name);
  if (!meeting) return;

  // Defensive: stop any egress still marked `recording` in our DB. Fires and
  // forgets — the `egress_ended` webhook will reconcile the rows.
  try {
    const { stoppedEgressIds, failed } = await stopAllForMeeting(meeting.id);
    ctx.log.info(
      { meetingId: meeting.id, stopped: stoppedEgressIds.length, failed: failed.length },
      'room_finished — issued stopEgress for remaining active egresses',
    );
  } catch (err) {
    ctx.log.error({ err, meetingId: meeting.id }, 'room_finished cleanup failed');
  }
}

// ==================== dispatch ====================

/**
 * Route a verified event to its handler. Exported so tests can bypass the
 * Fastify + signature layer and exercise pure logic.
 */
export async function dispatchWebhookEvent(
  event: WebhookEvent,
  ctx: HandlerCtx,
): Promise<void> {
  switch (event.event) {
    case 'track_published':
      await handleTrackPublished(event, ctx);
      return;
    case 'participant_joined':
      await handleParticipantJoined(event, ctx);
      return;
    case 'participant_left':
      await handleParticipantLeft(event, ctx);
      return;
    case 'egress_ended':
      await handleEgressEnded(event, ctx);
      return;
    case 'room_finished':
      await handleRoomFinished(event, ctx);
      return;
    default:
      ctx.log.debug({ event: event.event, id: event.id }, 'unhandled webhook event');
  }
}

// ==================== Fastify plugin ====================

/**
 * Registers `POST /webhook`. Installs a raw-body content-type parser for
 * `application/webhook+json` — LiveKit's default Content-Type — so the
 * signature verifier sees exactly the bytes that were signed.
 */
export const webhooksPlugin: FastifyPluginAsync = async (app) => {
  // Parse LiveKit webhook bodies as raw text (NOT JSON) so the signature
  // verifier receives the canonical payload. Fastify's default JSON parser
  // covers application/json for other routes.
  app.addContentTypeParser(
    'application/webhook+json',
    { parseAs: 'string' },
    (_req, body, done) => {
      done(null, body);
    },
  );

  app.post('/webhook', async (req: FastifyRequest, reply: FastifyReply) => {
    const authHeader =
      req.headers['authorization'] ?? req.headers['Authorization' as never];
    if (typeof authHeader !== 'string' || authHeader.length === 0) {
      req.log.warn('webhook: missing Authorization header');
      return reply.code(401).send({ error: 'missing authorization' });
    }

    // If the body came through as parsed JSON (a misconfigured client), fall
    // back to stringifying it — but we lose signature verification. Prefer
    // raw string so we verify the exact payload.
    const body =
      typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? '');

    let event: WebhookEvent;
    try {
      event = await getReceiver().receive(body, authHeader);
    } catch (err) {
      req.log.warn({ err }, 'webhook signature verification failed');
      return reply.code(401).send({ error: 'invalid signature' });
    }

    req.log.info({ event: event.event, id: event.id }, 'webhook received');

    try {
      await dispatchWebhookEvent(event, { log: req.log });
    } catch (err) {
      // We still return 2xx on handler errors to avoid LiveKit retry storms —
      // the error is recorded in our logs and any DB side-effects that
      // partially applied stay.
      req.log.error({ err, event: event.event }, 'webhook handler threw');
    }

    return reply.code(200).send({ ok: true });
  });
};

// ==================== helpers ====================

async function anyRecordingStillActive(meetingId: number): Promise<boolean> {
  // Import lazily to avoid a cyclic dep at module-load: db.ts → (nothing).
  const { getActiveTrackEgressForMeeting } = await import('./db.js');
  return getActiveTrackEgressForMeeting(meetingId).length > 0;
}
