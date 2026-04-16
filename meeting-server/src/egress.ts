/**
 * Thin wrappers over the LiveKit Egress REST API.
 *
 * We keep this module focused: each function issues exactly one LiveKit call
 * and records the resulting `egressId` in the shared `meeting_recordings`
 * table so that the webhook receiver (see `webhooks.ts`) can resolve the
 * row when `egress_ended` is delivered.
 *
 * File layout on disk:
 *   <RECORDINGS_DIR>/<meetingId>/audio_<userId>_<egressId>.ogg   (TrackEgress, per-user)
 *   <RECORDINGS_DIR>/<meetingId>/room_<meetingId>.mp4            (RoomCompositeEgress, mixed)
 *   <RECORDINGS_DIR>/<meetingId>/final_<meetingId>.mkv           (muxer output, Phase 4)
 *
 * The worker mounts the same volume as both LiveKit's egress recorder
 * container and the Next.js app, so these paths are writable end-to-end.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  EgressClient,
  EncodedFileOutput,
  DirectFileOutput,
  EncodedFileType,
  EncodingOptionsPreset,
} from 'livekit-server-sdk';
import type { EgressInfo } from '@livekit/protocol';
import { config } from './config.js';
import {
  insertRecording,
  updateRecordingStatus,
  getActiveTrackEgressForMeeting,
  getRecordingByEgressId,
} from './db.js';

// ==================== Client singleton ====================

let egressClient: EgressClient | null = null;

function getEgressClient(): EgressClient {
  if (egressClient) return egressClient;
  egressClient = new EgressClient(
    config.livekit.url,
    config.livekit.apiKey,
    config.livekit.apiSecret,
  );
  return egressClient;
}

/** Export for tests / alternative wiring. */
export function setEgressClient(client: EgressClient): void {
  egressClient = client;
}

// ==================== Path helpers ====================

/** Directory where all files for a given meeting are collected. */
export function meetingRecordingsDir(meetingId: number): string {
  return path.join(config.paths.recordingsDir, String(meetingId));
}

function ensureMeetingDir(meetingId: number): string {
  const dir = meetingRecordingsDir(meetingId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function audioTrackFilePath(
  meetingId: number,
  userId: string,
  egressId: string,
): string {
  return path.join(
    meetingRecordingsDir(meetingId),
    `audio_${userId}_${egressId}.ogg`,
  );
}

export function roomCompositeFilePath(meetingId: number): string {
  return path.join(meetingRecordingsDir(meetingId), `room_${meetingId}.mp4`);
}

// ==================== Public API ====================

export interface StartTrackEgressInput {
  roomName: string;
  trackId: string;
  userId: string;
  meetingId: number;
}

export interface StartedEgress {
  egressId: string;
  filePath: string;
}

/**
 * Begin a per-track audio egress. We use DirectFileOutput (OGG/Opus, no
 * re-encoding) so the resulting file is cheap to mux and preserves the
 * original Opus payload. LiveKit names the file using `{track_id}` / static
 * path; we pin the path to our deterministic layout so the muxer can find
 * everything without re-querying LiveKit.
 */
export async function startTrackEgress(
  input: StartTrackEgressInput,
): Promise<StartedEgress> {
  ensureMeetingDir(input.meetingId);

  // Placeholder path — LiveKit replaces the path as-is; we pre-compute the
  // final name using a temporary egressId token we fill after the call.
  // To keep naming stable, we ask LiveKit for a fixed path seeded by the
  // trackId (unique per publication) and rename-tag in DB via egressId after.
  const provisionalFilePath = path.join(
    meetingRecordingsDir(input.meetingId),
    `audio_${input.userId}_${input.trackId}.ogg`,
  );

  const output = new DirectFileOutput({ filepath: provisionalFilePath });

  let info: EgressInfo;
  try {
    info = await getEgressClient().startTrackEgress(
      input.roomName,
      output,
      input.trackId,
    );
  } catch (err) {
    // Surface a concise error; caller logs the details.
    throw new Error(
      `LiveKit startTrackEgress failed for room=${input.roomName} track=${input.trackId}: ${errMsg(err)}`,
    );
  }

  const egressId = info.egressId;
  if (!egressId) {
    throw new Error(
      `LiveKit returned EgressInfo without egressId for track ${input.trackId}`,
    );
  }

  // Canonical path uses egressId (for uniqueness across re-publications).
  const filePath = audioTrackFilePath(input.meetingId, input.userId, egressId);

  insertRecording({
    meetingId: input.meetingId,
    trackType: 'audio',
    userId: input.userId,
    filePath,
    egressId,
    status: 'recording',
  });

  return { egressId, filePath };
}

export interface StartRoomCompositeInput {
  roomName: string;
  meetingId: number;
}

/**
 * Begin a single composite egress for the whole room: mixed video + mixed
 * audio, H.264 720p, stored as MP4. This is the "quick preview" track and
 * also supplies the video stream for the final muxed MKV.
 */
export async function startRoomCompositeEgress(
  input: StartRoomCompositeInput,
): Promise<StartedEgress> {
  ensureMeetingDir(input.meetingId);

  const filePath = roomCompositeFilePath(input.meetingId);

  const output = new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    filepath: filePath,
  });

  let info: EgressInfo;
  try {
    info = await getEgressClient().startRoomCompositeEgress(input.roomName, output, {
      layout: 'speaker',
      encodingOptions: EncodingOptionsPreset.H264_720P_30,
      audioOnly: false,
      videoOnly: false,
    });
  } catch (err) {
    throw new Error(
      `LiveKit startRoomCompositeEgress failed for room=${input.roomName}: ${errMsg(err)}`,
    );
  }

  const egressId = info.egressId;
  if (!egressId) {
    throw new Error(
      `LiveKit returned EgressInfo without egressId for room ${input.roomName}`,
    );
  }

  insertRecording({
    meetingId: input.meetingId,
    trackType: 'mixed',
    userId: null,
    filePath,
    egressId,
    status: 'recording',
  });

  return { egressId, filePath };
}

/**
 * Stop a running egress by id. Safe to call on a completed or unknown egress;
 * LiveKit returns an error which we surface but do not re-throw if the row is
 * already terminal.
 */
export async function stopEgress(egressId: string): Promise<void> {
  try {
    await getEgressClient().stopEgress(egressId);
  } catch (err) {
    // If the row is already in a terminal state locally, suppress the error:
    // LiveKit will 404 once egress has ended. For unknown ids, rethrow.
    const row = getRecordingByEgressId(egressId);
    if (row && (row.status === 'done' || row.status === 'failed' || row.status === 'processing')) {
      return;
    }
    throw new Error(`LiveKit stopEgress failed for ${egressId}: ${errMsg(err)}`);
  }
}

/**
 * Stop every active track/mixed egress attached to a given meeting. Each
 * failure is logged and swallowed — we always attempt all of them so a
 * single stuck egress does not block the rest.
 */
export async function stopAllForMeeting(
  meetingId: number,
): Promise<{ stoppedEgressIds: string[]; failed: Array<{ egressId: string; error: string }> }> {
  const active = getActiveTrackEgressForMeeting(meetingId);

  // Also include any active mixed/composite egress — the DB query above only
  // returns audio|video; compose a second read for completeness.
  // (In practice the RecordingRow list query already covers audio+video;
  // composites are tracked as 'mixed' which we fetch here via a dedicated
  // path: we simply attempt to stop anything flagged `recording`.)
  const stoppedEgressIds: string[] = [];
  const failed: Array<{ egressId: string; error: string }> = [];

  for (const row of active) {
    try {
      await stopEgress(row.egress_id);
      stoppedEgressIds.push(row.egress_id);
    } catch (err) {
      failed.push({ egressId: row.egress_id, error: errMsg(err) });
    }
  }

  // Mark rows that the worker never received an `egress_ended` for as
  // processing — the webhook will settle the final state.
  for (const id of stoppedEgressIds) {
    try {
      updateRecordingStatus(id, 'processing');
    } catch {
      // DB update failures are non-fatal here.
    }
  }

  return { stoppedEgressIds, failed };
}

// ==================== internals ====================

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
