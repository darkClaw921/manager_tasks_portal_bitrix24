/**
 * Meeting recordings service layer.
 *
 * Reads `meeting_recordings` rows for a given meeting and assembles the
 * playback manifest consumed by:
 *   - `GET /api/meetings/[id]/recordings` (returns the manifest)
 *   - `GET /api/meetings/[id]/recordings/[trackId]` (streams a file)
 *
 * The shape of the returned manifest is deliberately aligned with the one
 * the meeting-worker writes next to the final MKV in Phase 4 so both
 * sources can be merged without translation on the frontend.
 */

import fs from 'node:fs';
import path from 'node:path';
import { db } from '@/lib/db';
import { meetingRecordings, users } from '@/lib/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import type {
  MeetingRecording,
  RecordingTrackType,
  RecordingStatus,
} from '@/types/meeting';

/** Processing states considered "ready for playback/download". */
const DONE_STATUSES: RecordingStatus[] = ['done'];

/**
 * A single audio track entry in the manifest, enriched with the human name
 * so the UI can label the track selector without a second round-trip.
 */
export interface ManifestAudioTrack {
  recordingId: number;
  userId: number | null;
  userName: string | null;
  filePath: string;
  /**
   * Index of this audio stream inside the muxed final MKV. `null` until the
   * worker's post-mux has stamped it (for raw per-user OGG rows).
   */
  trackIndex: number | null;
}

export interface ManifestFile {
  recordingId: number;
  filePath: string;
  sizeBytes: number | null;
}

export interface RecordingsManifest {
  meetingId: number;
  /** Overall rollup so callers can render a "processing…" placeholder. */
  status: 'empty' | 'processing' | 'ready';
  /** Post-muxed MKV with mixed video + named audio tracks. */
  finalMkv: ManifestFile | null;
  /** Raw RoomComposite MP4 (mixed video + mixed audio). Present pre-mux. */
  roomComposite: ManifestFile | null;
  /** One entry per participant for whom a per-user audio egress ran. */
  perUserAudio: ManifestAudioTrack[];
}

// ==================== Queries ====================

/**
 * List all recordings (any status) for the given meeting, ordered by
 * startedAt ASC. Callers that only want ready-to-play rows should filter
 * by `status === 'done'`.
 */
export function listRecordings(meetingId: number): MeetingRecording[] {
  return db
    .select()
    .from(meetingRecordings)
    .where(eq(meetingRecordings.meetingId, meetingId))
    .orderBy(asc(meetingRecordings.startedAt))
    .all();
}

/**
 * List only recordings that have completed egress + post-mux and are safe
 * to expose for download/playback.
 */
export function listDoneRecordings(meetingId: number): MeetingRecording[] {
  return db
    .select()
    .from(meetingRecordings)
    .where(
      and(
        eq(meetingRecordings.meetingId, meetingId),
        eq(meetingRecordings.status, 'done')
      )
    )
    .orderBy(asc(meetingRecordings.startedAt))
    .all();
}

export function getRecording(id: number): MeetingRecording | null {
  const row = db
    .select()
    .from(meetingRecordings)
    .where(eq(meetingRecordings.id, id))
    .get();
  return row ?? null;
}

/**
 * Resolve an absolute filesystem path suitable for `fs.createReadStream`.
 *
 * The worker writes files under `RECORDINGS_DIR`. We accept both absolute
 * paths (current worker behaviour) and relative ones, anchoring relatives
 * to the same `RECORDINGS_DIR` that the worker uses. Returns `null` if the
 * recording does not exist or the file has been removed from disk.
 */
export function getStreamPath(recordingId: number): string | null {
  const row = getRecording(recordingId);
  if (!row) return null;

  const filePath = row.filePath;
  const absolute = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(
        process.env.RECORDINGS_DIR ?? path.join(process.cwd(), 'data', 'recordings'),
        filePath
      );

  try {
    const stat = fs.statSync(absolute);
    if (!stat.isFile()) return null;
    return absolute;
  } catch {
    return null;
  }
}

// ==================== Manifest assembly ====================

/**
 * Build the playback manifest for a meeting.
 *
 * Implementation detail: we `JOIN` to `users` via a manual map rather than
 * SQL because `meetingRecordings.userId` is stored as TEXT (nullable, may
 * hold arbitrary identity strings from LiveKit in future). Collecting the
 * numeric ids in JS keeps the join safe.
 */
export function buildManifest(meetingId: number): RecordingsManifest {
  const rows = listRecordings(meetingId);

  if (rows.length === 0) {
    return {
      meetingId,
      status: 'empty',
      finalMkv: null,
      roomComposite: null,
      perUserAudio: [],
    };
  }

  // Split by trackType for downstream mapping.
  const audioRows = rows.filter((r) => r.trackType === ('audio' satisfies RecordingTrackType));
  const mixedRows = rows.filter((r) => r.trackType === ('mixed' satisfies RecordingTrackType));
  const finalRows = rows.filter(
    (r) => r.trackType === ('final_mkv' satisfies RecordingTrackType)
  );

  // Gather all numeric userIds referenced by audio rows and fetch names in one query.
  const userIdSet = new Set<number>();
  for (const r of audioRows) {
    if (r.userId) {
      const n = Number.parseInt(r.userId, 10);
      if (Number.isInteger(n) && n > 0) userIdSet.add(n);
    }
  }
  const userNameById = new Map<number, string>();
  if (userIdSet.size > 0) {
    const userRows = db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(users)
      .all();
    for (const u of userRows) {
      if (userIdSet.has(u.id)) {
        userNameById.set(u.id, `${u.firstName} ${u.lastName}`.trim());
      }
    }
  }

  const perUserAudio: ManifestAudioTrack[] = audioRows
    .filter((r) => DONE_STATUSES.includes(r.status as RecordingStatus))
    .map((r, idx) => {
      const userId = r.userId ? Number.parseInt(r.userId, 10) : NaN;
      const resolvedUserId = Number.isInteger(userId) && userId > 0 ? userId : null;
      return {
        recordingId: r.id,
        userId: resolvedUserId,
        userName: resolvedUserId ? userNameById.get(resolvedUserId) ?? null : null,
        filePath: r.filePath,
        // Default to stable ordering; the worker may overwrite this later
        // when it emits its own manifest.json alongside the final MKV.
        trackIndex: idx,
      };
    });

  const finalMkv: ManifestFile | null = (() => {
    const done = finalRows.find((r) => r.status === 'done');
    if (!done) return null;
    return {
      recordingId: done.id,
      filePath: done.filePath,
      sizeBytes: done.sizeBytes ?? null,
    };
  })();

  const roomComposite: ManifestFile | null = (() => {
    const done = mixedRows.find((r) => r.status === 'done');
    if (!done) return null;
    return {
      recordingId: done.id,
      filePath: done.filePath,
      sizeBytes: done.sizeBytes ?? null,
    };
  })();

  // Rollup: `ready` if at least one final/mixed track is done;
  // `processing` if all rows are still active or processing; `empty` if none exist.
  const anyDone = rows.some((r) => r.status === 'done');
  const anyActive = rows.some(
    (r) => r.status === 'recording' || r.status === 'processing'
  );
  const status: RecordingsManifest['status'] = anyDone
    ? 'ready'
    : anyActive
      ? 'processing'
      : 'empty';

  return {
    meetingId,
    status,
    finalMkv,
    roomComposite,
    perUserAudio,
  };
}
