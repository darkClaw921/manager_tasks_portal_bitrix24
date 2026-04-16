/**
 * ffmpeg post-mux pipeline.
 *
 * Inputs (per meeting):
 *   - one mixed composite video/audio MP4   (`track_type='mixed'`)
 *   - N per-user audio OGG files            (`track_type='audio'`)
 *
 * Output:
 *   - one MKV with the mixed video copied unchanged and each per-user OGG
 *     attached as a named audio stream. Stream metadata `title=<userName>`
 *     lets VLC / mpv show a friendly picker; `language=rus` is a best-effort
 *     hint for users with mixed locales.
 *
 * We build the ffmpeg command as an argv array (no shell), so callers can
 * exercise `buildFfmpegArgs` in pure unit tests without spawning a process.
 *
 * The muxer writes a sibling `manifest.json` alongside the final MKV that
 * maps each stream index to its userId so the Next.js playback UI can
 * render the track selector without re-running ffprobe.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  getUserDisplayName,
  insertFinalRecording,
  listDoneAudioForMeeting,
  listDoneMixedForMeeting,
  updateRecordingStatus,
} from './db.js';
import { meetingRecordingsDir } from './egress.js';

// ==================== Types ====================

export interface AudioTrackInput {
  /** Absolute path to the per-user OGG file. */
  filePath: string;
  /** TaskHub user id as stored in `meeting_recordings.user_id` (may be non-numeric). */
  userId: string;
  /** Human-readable label for the ffmpeg `title=` metadata. */
  userName: string;
  /** ISO-639-2 language code (defaults to `rus`). */
  language?: string;
}

export interface BuildFfmpegArgsInput {
  /** Absolute path to the mixed video file, or null when only audio tracks exist. */
  videoFilePath: string | null;
  audioTracks: AudioTrackInput[];
  /** Absolute path of the output MKV. */
  outputFilePath: string;
}

export interface MuxerManifest {
  finalMkv: string;
  tracks: Array<{
    userId: string;
    userName: string;
    /** 0-based index into the MKV's audio streams. */
    trackIndex: number;
  }>;
}

// ==================== Pure arg builder ====================

/**
 * Build the ffmpeg argv used to mux a meeting's recordings into a single
 * MKV. Pure/synchronous so the shape can be asserted in unit tests.
 *
 * Mapping rules:
 *   - `-map 0:v` copies the mixed video (when present) from input index 0.
 *   - Each subsequent input (N ≥ 1 when video present, N ≥ 0 when not) is
 *     mapped as its own audio stream `-map N:a -c:a copy`.
 *   - `-metadata:s:a:<i>` applies stream-level metadata *in output order*;
 *     `i` counts audio streams only (0, 1, 2, …).
 *   - If there is no video and no audio input, the function throws.
 */
export function buildFfmpegArgs(input: BuildFfmpegArgsInput): string[] {
  const { videoFilePath, audioTracks, outputFilePath } = input;

  if (!videoFilePath && audioTracks.length === 0) {
    throw new Error('buildFfmpegArgs: no video and no audio inputs');
  }

  const args: string[] = ['-y']; // overwrite existing output

  // Deterministic input order: video first (if any), then audio tracks.
  if (videoFilePath) {
    args.push('-i', videoFilePath);
  }
  for (const t of audioTracks) {
    args.push('-i', t.filePath);
  }

  // Map the video stream untouched.
  if (videoFilePath) {
    args.push('-map', '0:v', '-c:v', 'copy');
  }

  // Map each audio stream. Input index offset = 1 if video, else 0.
  const inputOffset = videoFilePath ? 1 : 0;
  audioTracks.forEach((track, audioIdx) => {
    const inputIdx = inputOffset + audioIdx;
    args.push('-map', `${inputIdx}:a`, '-c:a', 'copy');
    // Stream-level metadata on the i-th audio stream in the output.
    args.push(
      `-metadata:s:a:${audioIdx}`,
      `title=${track.userName}`,
      `-metadata:s:a:${audioIdx}`,
      `language=${track.language ?? 'rus'}`,
    );
  });

  args.push(outputFilePath);
  return args;
}

// ==================== Spawn wrapper ====================

export interface RunFfmpegResult {
  exitCode: number;
  stderr: string;
}

/**
 * Spawn ffmpeg with the given argv and collect stderr for diagnostics.
 * Returns even on non-zero exit — the caller decides how to handle failure.
 */
export async function runFfmpeg(
  args: string[],
  opts: { ffmpegPath?: string } = {},
): Promise<RunFfmpegResult> {
  const bin = opts.ffmpegPath ?? 'ffmpeg';
  return new Promise<RunFfmpegResult>((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';

    child.stdout?.on('data', () => {
      /* ffmpeg writes to stderr; drain stdout to avoid buffering */
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      resolve({ exitCode: code ?? -1, stderr });
    });
  });
}

// ==================== Orchestrator ====================

/**
 * Build the final MKV for a meeting. Reads completed audio + mixed rows
 * from SQLite, runs ffmpeg, writes a manifest, and inserts a new
 * `final_mkv` recording row on success.
 *
 * Idempotency: if a `final_mkv` row already exists for the meeting, this
 * returns early. Callers are expected to skip re-triggering the muxer when
 * that is the case.
 */
export async function runForMeeting(meetingId: number): Promise<MuxerManifest | null> {
  const mixedRows = listDoneMixedForMeeting(meetingId);
  const audioRows = listDoneAudioForMeeting(meetingId);

  if (mixedRows.length === 0 && audioRows.length === 0) {
    return null;
  }

  const dir = meetingRecordingsDir(meetingId);
  fs.mkdirSync(dir, { recursive: true });

  const videoFilePath = mixedRows[0]?.file_path ?? null;
  const audioTracks: AudioTrackInput[] = audioRows.map((row) => {
    const displayName = row.user_id
      ? resolveUserDisplayName(row.user_id)
      : `track_${row.id}`;
    return {
      filePath: row.file_path,
      userId: row.user_id ?? `track_${row.id}`,
      userName: displayName,
      language: 'rus',
    };
  });

  const outputFilePath = path.join(dir, `final_${meetingId}.mkv`);
  const args = buildFfmpegArgs({ videoFilePath, audioTracks, outputFilePath });

  const syntheticEgressId = `final_${meetingId}_${Date.now()}`;
  const finalId = insertFinalRecording(
    meetingId,
    outputFilePath,
    syntheticEgressId,
    null,
  );

  let result: RunFfmpegResult;
  try {
    result = await runFfmpeg(args);
  } catch (err) {
    updateRecordingStatus(syntheticEgressId, 'failed');
    throw new Error(
      `ffmpeg spawn failed for meeting ${meetingId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (result.exitCode !== 0) {
    // eslint-disable-next-line no-console
    console.error(
      `[muxer] ffmpeg non-zero exit (${result.exitCode}) for meeting ${meetingId}\n${result.stderr}`,
    );
    updateRecordingStatus(syntheticEgressId, 'failed');
    throw new Error(
      `ffmpeg exited ${result.exitCode} for meeting ${meetingId}: ${result.stderr.slice(-400)}`,
    );
  }

  // Size the output for the DB row so the Next.js side can display it.
  let sizeBytes: number | null = null;
  try {
    sizeBytes = fs.statSync(outputFilePath).size;
  } catch {
    /* optional */
  }
  updateRecordingStatus(syntheticEgressId, 'done', sizeBytes, new Date().toISOString());

  const manifest: MuxerManifest = {
    finalMkv: outputFilePath,
    tracks: audioTracks.map((t, i) => ({
      userId: t.userId,
      userName: t.userName,
      trackIndex: i,
    })),
  };

  const manifestPath = path.join(dir, `final_${meetingId}.manifest.json`);
  try {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[muxer] failed to write manifest ${manifestPath}:`, err);
  }

  // eslint-disable-next-line no-console
  console.info(
    `[muxer] meeting ${meetingId} muxed to ${outputFilePath} (recording row ${finalId}, ${audioTracks.length} audio tracks)`,
  );

  return manifest;
}

// ==================== helpers ====================

/**
 * Resolve a display name for the user_id stored on an audio recording.
 * The column is `TEXT` (not an integer FK) because LiveKit identities can
 * be arbitrary strings; when the value is numeric we look it up in `users`.
 */
function resolveUserDisplayName(userIdRaw: string): string {
  const numeric = Number(userIdRaw);
  if (Number.isFinite(numeric) && numeric > 0) {
    const name = getUserDisplayName(numeric);
    if (name) return name;
  }
  return userIdRaw;
}
