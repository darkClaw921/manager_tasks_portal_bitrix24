/**
 * HTTP API surface for the meeting-worker.
 *
 * Endpoints are authenticated with a TaskHub-issued JWT on the
 * `Authorization: Bearer <token>` header. The Next.js side mints a short-
 * lived "service token" via `src/lib/meetings/egress-client.ts` and we
 * verify it with the same `JWT_SECRET` / issuer / audience that signs user
 * sessions (see `auth.ts`).
 *
 * Canonical paths live under `/recordings/*` to match the existing Next
 * client. Aliases under `/egress/*` are exposed for parity with the
 * infrastructure plan and for direct ops use (curl / debugging).
 *
 * Routes:
 *   POST /recordings/start     → start RoomComposite + per-audio TrackEgress
 *   POST /recordings/stop      → stop every active egress for a meeting
 *   GET  /recordings/status    → summary counts by state
 *   POST /egress/start         → alias
 *   POST /egress/stop          → alias
 */

import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { RoomServiceClient } from 'livekit-server-sdk';
import type { ParticipantInfo, TrackInfo } from '@livekit/protocol';
import { TrackType } from '@livekit/protocol';
import { z } from 'zod';
import { config } from './config.js';
import {
  extractBearer,
  tryVerifyToken,
  type VerifiedSessionPayload,
} from './auth.js';
import {
  getActiveTrackEgressForMeeting,
  getMeeting,
  listRecordingsByMeeting,
} from './db.js';
import { parseUserIdFromIdentity } from './webhooks.js';
import {
  startRoomCompositeEgress,
  startTrackEgress,
  stopAllForMeeting,
} from './egress.js';

// ==================== RoomServiceClient singleton ====================

let roomClient: RoomServiceClient | null = null;

function getRoomClient(): RoomServiceClient {
  if (roomClient) return roomClient;
  roomClient = new RoomServiceClient(
    config.livekit.url,
    config.livekit.apiKey,
    config.livekit.apiSecret,
  );
  return roomClient;
}

export function setRoomServiceClient(client: RoomServiceClient): void {
  roomClient = client;
}

// ==================== Auth helper ====================

async function requireServiceToken(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<VerifiedSessionPayload | null> {
  const header = req.headers['authorization'];
  const token = extractBearer(typeof header === 'string' ? header : null);
  if (!token) {
    void reply.code(401).send({ error: 'missing bearer token' });
    return null;
  }
  const payload = await tryVerifyToken(token);
  if (!payload) {
    void reply.code(401).send({ error: 'invalid token' });
    return null;
  }
  return payload;
}

// ==================== Request schemas ====================

const StartBody = z.object({
  meetingId: z.number().int().positive(),
  roomName: z.string().min(1),
});

const StopBody = z.object({
  meetingId: z.number().int().positive(),
});

const StatusQuery = z.object({
  meetingId: z.coerce.number().int().positive(),
});

// ==================== Handlers ====================

interface StartResponse {
  ok: true;
  egressIds: string[];
}

async function handleStart(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const auth = await requireServiceToken(req, reply);
  if (!auth) return;

  const parsed = StartBody.safeParse(req.body);
  if (!parsed.success) {
    void reply.code(400).send({ error: 'invalid body', issues: parsed.error.issues });
    return;
  }
  const { meetingId, roomName } = parsed.data;

  const meeting = getMeeting(meetingId);
  if (!meeting) {
    void reply.code(404).send({ error: 'unknown meeting' });
    return;
  }
  if (meeting.room_name !== roomName) {
    void reply.code(409).send({ error: 'roomName mismatch' });
    return;
  }

  const egressIds: string[] = [];

  // 1) RoomComposite for the mixed preview.
  try {
    const composite = await startRoomCompositeEgress({ roomName, meetingId });
    egressIds.push(composite.egressId);
    req.log.info(
      { meetingId, egressId: composite.egressId },
      'started room-composite egress',
    );
  } catch (err) {
    req.log.error({ err, meetingId }, 'failed to start room-composite egress');
    // Continue — per-track egresses are still useful on their own.
  }

  // 2) Per-track audio egress for every currently-publishing audio producer.
  let participants: ParticipantInfo[] = [];
  try {
    participants = await getRoomClient().listParticipants(roomName);
  } catch (err) {
    req.log.warn({ err, roomName }, 'listParticipants failed — skipping per-track egresses');
  }

  for (const p of participants) {
    for (const track of p.tracks as TrackInfo[]) {
      if (track.type !== TrackType.AUDIO) continue;
      if (track.muted) continue;

      const uid = parseUserIdFromIdentity(p.identity);
      const userLabel = uid !== null ? String(uid) : p.identity;

      try {
        const started = await startTrackEgress({
          roomName,
          trackId: track.sid,
          userId: userLabel,
          meetingId,
        });
        egressIds.push(started.egressId);
      } catch (err) {
        req.log.error(
          { err, meetingId, trackId: track.sid },
          'failed to start per-track audio egress',
        );
      }
    }
  }

  const payload: StartResponse = { ok: true, egressIds };
  void reply.code(200).send(payload);
}

async function handleStop(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const auth = await requireServiceToken(req, reply);
  if (!auth) return;

  const parsed = StopBody.safeParse(req.body);
  if (!parsed.success) {
    void reply.code(400).send({ error: 'invalid body', issues: parsed.error.issues });
    return;
  }
  const { meetingId } = parsed.data;

  const { stoppedEgressIds, failed } = await stopAllForMeeting(meetingId);

  if (failed.length > 0) {
    req.log.warn({ meetingId, failed }, 'some egresses failed to stop');
  }
  void reply.code(200).send({ ok: true, stoppedEgressIds });
}

async function handleStatus(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const auth = await requireServiceToken(req, reply);
  if (!auth) return;

  const parsed = StatusQuery.safeParse(req.query);
  if (!parsed.success) {
    void reply.code(400).send({ error: 'invalid query', issues: parsed.error.issues });
    return;
  }
  const { meetingId } = parsed.data;

  const all = listRecordingsByMeeting(meetingId);
  const active = getActiveTrackEgressForMeeting(meetingId);

  const processing = all.filter((r) => r.status === 'processing').length;
  const done = all.filter((r) => r.status === 'done').length;
  const failed = all.filter((r) => r.status === 'failed').length;

  void reply.code(200).send({
    meetingId,
    activeEgress: active.length,
    processing,
    done,
    failed,
  });
}

// ==================== Plugin ====================

export const recordingsRoutesPlugin: FastifyPluginAsync = async (app) => {
  app.post('/recordings/start', handleStart);
  app.post('/recordings/stop', handleStop);
  app.get('/recordings/status', handleStatus);

  // Alias paths to match infrastructure docs (`/egress/start|stop`).
  app.post('/egress/start', handleStart);
  app.post('/egress/stop', handleStop);
};
