/**
 * Direct better-sqlite3 access to the SQLite file that Drizzle manages from
 * the Next.js side. We intentionally avoid pulling Drizzle into the worker
 * to keep the service small and its build fast; the set of queries here is
 * narrow (read meetings, CRUD recordings) and closed.
 *
 * The DB file is a shared volume between the Next.js container and this
 * worker. WAL mode is enabled so that two processes can read/write
 * concurrently without blocking one another.
 */
import Database from 'better-sqlite3';
import type { Database as DatabaseType, Statement } from 'better-sqlite3';
import { config } from './config.js';

// ==================== Row types ====================
// These mirror the Drizzle-managed schema from src/lib/db/schema.ts on the
// Next.js side. Keep in sync when migrations change.

export interface MeetingRow {
  id: number;
  title: string;
  host_id: number;
  room_name: string;
  status: 'scheduled' | 'live' | 'ended';
  recording_enabled: 0 | 1;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  // ISO timestamp marking when the meeting went empty. NULL while someone
  // is live in the room. See src/lib/meetings/cleanup.ts on the Next side
  // and the webhook handlers for participant_joined/left that maintain it.
  empty_since: string | null;
}

export type RecordingTrackType = 'audio' | 'video' | 'mixed' | 'final_mkv';
export type RecordingStatus = 'recording' | 'processing' | 'done' | 'failed';

export interface RecordingRow {
  id: number;
  meeting_id: number;
  track_type: RecordingTrackType;
  user_id: string | null;
  file_path: string;
  egress_id: string;
  status: RecordingStatus;
  started_at: string;
  ended_at: string | null;
  size_bytes: number | null;
}

export interface InsertRecordingInput {
  meetingId: number;
  trackType: RecordingTrackType;
  userId?: string | null;
  filePath: string;
  egressId: string;
  status?: RecordingStatus;
}

// ==================== Connection ====================

let db: DatabaseType | null = null;

/** Open (or return existing) connection to the shared SQLite file. */
export function getDb(): DatabaseType {
  if (db) return db;

  db = new Database(config.paths.dbPath, {
    // fileMustExist: true — the DB is provisioned by Next.js via Drizzle
    // migrations before the worker starts.
    fileMustExist: true,
  });

  // Concurrency + integrity pragmas. WAL lets readers and a single writer
  // proceed without blocking each other — essential for a two-process setup.
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');

  return db;
}

/** Close the connection (called from graceful shutdown). */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// ==================== Prepared statements ====================
// Created lazily on first use so tests / tooling can import this module
// without opening a connection.

interface PreparedStatements {
  selectMeetingById: Statement<[number], MeetingRow>;
  selectMeetingByRoomName: Statement<[string], MeetingRow>;

  selectRecordingByEgressId: Statement<[string], RecordingRow>;
  insertRecording: Statement<
    [number, RecordingTrackType, string | null, string, string, RecordingStatus]
  >;
  updateRecordingStatus: Statement<[RecordingStatus, number | null, string | null, string]>;
  listRecordingsByMeeting: Statement<[number], RecordingRow>;
  listActiveTrackEgressForMeeting: Statement<[number], RecordingRow>;

  insertFinalRecording: Statement<
    [number, string, string, RecordingStatus, number | null]
  >;
  listDoneAudioForMeeting: Statement<[number], RecordingRow>;
  listDoneMixedForMeeting: Statement<[number], RecordingRow>;

  upsertParticipantJoined: Statement<[number, number]>;
  markParticipantLeft: Statement<[number, number]>;

  // Phase 4: empty-meeting timer. setMeetingEmptySince writes either an ISO
  // timestamp (room went empty at ...) or NULL (someone joined). The count
  // query is used by webhook handlers to decide whether a participant_left
  // leaves the room truly empty.
  setMeetingEmptySince: Statement<[string | null, number]>;
  countLiveParticipantsLocal: Statement<[number], { cnt: number }>;

  selectUserName: Statement<[number], { first_name: string; last_name: string }>;
}

let stmts: PreparedStatements | null = null;

function getStatements(): PreparedStatements {
  if (stmts) return stmts;
  const d = getDb();

  stmts = {
    selectMeetingById: d.prepare<[number], MeetingRow>(
      `SELECT * FROM meetings WHERE id = ?`,
    ),
    selectMeetingByRoomName: d.prepare<[string], MeetingRow>(
      `SELECT * FROM meetings WHERE room_name = ?`,
    ),

    selectRecordingByEgressId: d.prepare<[string], RecordingRow>(
      `SELECT * FROM meeting_recordings WHERE egress_id = ?`,
    ),

    insertRecording: d.prepare<
      [number, RecordingTrackType, string | null, string, string, RecordingStatus]
    >(
      `INSERT INTO meeting_recordings
         (meeting_id, track_type, user_id, file_path, egress_id, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ),

    // Params: status, size_bytes, ended_at, egress_id
    updateRecordingStatus: d.prepare<[RecordingStatus, number | null, string | null, string]>(
      `UPDATE meeting_recordings
         SET status      = ?,
             size_bytes  = COALESCE(?, size_bytes),
             ended_at    = COALESCE(?, ended_at)
       WHERE egress_id = ?`,
    ),

    listRecordingsByMeeting: d.prepare<[number], RecordingRow>(
      `SELECT * FROM meeting_recordings
         WHERE meeting_id = ?
         ORDER BY started_at ASC`,
    ),

    // All rows still in 'recording' state for the meeting — when the host
    // stops a session we stop every live egress regardless of track type.
    listActiveTrackEgressForMeeting: d.prepare<[number], RecordingRow>(
      `SELECT * FROM meeting_recordings
         WHERE meeting_id = ?
           AND status     = 'recording'`,
    ),

    // Params: meetingId, filePath, egressId, status, sizeBytes
    insertFinalRecording: d.prepare<[number, string, string, RecordingStatus, number | null]>(
      `INSERT INTO meeting_recordings
         (meeting_id, track_type, user_id, file_path, egress_id, status, size_bytes)
       VALUES (?, 'final_mkv', NULL, ?, ?, ?, ?)`,
    ),

    listDoneAudioForMeeting: d.prepare<[number], RecordingRow>(
      `SELECT * FROM meeting_recordings
         WHERE meeting_id = ?
           AND track_type = 'audio'
           AND status     = 'done'
         ORDER BY started_at ASC`,
    ),

    listDoneMixedForMeeting: d.prepare<[number], RecordingRow>(
      `SELECT * FROM meeting_recordings
         WHERE meeting_id = ?
           AND track_type = 'mixed'
           AND status     = 'done'
         ORDER BY started_at ASC`,
    ),

    // Upsert semantics: insert a row if the user has no active session for
    // this meeting. We treat an existing row whose left_at is NULL as "still
    // joined" and skip the insert. If the prior row has left_at set we
    // insert a fresh one so each join becomes its own segment.
    upsertParticipantJoined: d.prepare<[number, number]>(
      `INSERT INTO meeting_participants (meeting_id, user_id)
         SELECT ?, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM meeting_participants
           WHERE meeting_id = ?1 AND user_id = ?2 AND left_at IS NULL
       )`,
    ),

    markParticipantLeft: d.prepare<[number, number]>(
      `UPDATE meeting_participants
          SET left_at = CURRENT_TIMESTAMP
        WHERE meeting_id = ? AND user_id = ? AND left_at IS NULL`,
    ),

    // Params: empty_since (ISO or NULL), meeting_id. Safe to call multiple
    // times — the cron on the Next side is the source of truth, this is just
    // faster feedback from the webhook layer.
    setMeetingEmptySince: d.prepare<[string | null, number]>(
      `UPDATE meetings SET empty_since = ? WHERE id = ?`,
    ),

    // Counts DB-visible live participants (real users only). LiveKit guests
    // are NOT in meeting_participants — the full count is computed on the
    // Next side via RoomServiceClient; this local count only serves the
    // webhook "participant_left -> is the room now empty?" decision.
    countLiveParticipantsLocal: d.prepare<[number], { cnt: number }>(
      `SELECT COUNT(*) AS cnt
         FROM meeting_participants
        WHERE meeting_id = ?
          AND joined_at IS NOT NULL
          AND left_at IS NULL`,
    ),

    selectUserName: d.prepare<[number], { first_name: string; last_name: string }>(
      `SELECT first_name, last_name FROM users WHERE id = ?`,
    ),
  };

  return stmts;
}

// ==================== Typed queries ====================

export function getMeeting(id: number): MeetingRow | undefined {
  return getStatements().selectMeetingById.get(id);
}

export function getMeetingByRoomName(roomName: string): MeetingRow | undefined {
  return getStatements().selectMeetingByRoomName.get(roomName);
}

export function getRecordingByEgressId(egressId: string): RecordingRow | undefined {
  return getStatements().selectRecordingByEgressId.get(egressId);
}

export function insertRecording(input: InsertRecordingInput): number {
  const status: RecordingStatus = input.status ?? 'recording';
  const info = getStatements().insertRecording.run(
    input.meetingId,
    input.trackType,
    input.userId ?? null,
    input.filePath,
    input.egressId,
    status,
  );
  return Number(info.lastInsertRowid);
}

export function updateRecordingStatus(
  egressId: string,
  status: RecordingStatus,
  sizeBytes?: number | null,
  endedAt?: string | null,
): void {
  getStatements().updateRecordingStatus.run(
    status,
    sizeBytes ?? null,
    endedAt ?? null,
    egressId,
  );
}

export function listRecordingsByMeeting(meetingId: number): RecordingRow[] {
  return getStatements().listRecordingsByMeeting.all(meetingId);
}

export function getActiveTrackEgressForMeeting(meetingId: number): RecordingRow[] {
  return getStatements().listActiveTrackEgressForMeeting.all(meetingId);
}

export function listDoneAudioForMeeting(meetingId: number): RecordingRow[] {
  return getStatements().listDoneAudioForMeeting.all(meetingId);
}

export function listDoneMixedForMeeting(meetingId: number): RecordingRow[] {
  return getStatements().listDoneMixedForMeeting.all(meetingId);
}

export function insertFinalRecording(
  meetingId: number,
  filePath: string,
  egressId: string,
  sizeBytes?: number | null,
): number {
  const info = getStatements().insertFinalRecording.run(
    meetingId,
    filePath,
    egressId,
    'done',
    sizeBytes ?? null,
  );
  return Number(info.lastInsertRowid);
}

/**
 * Mark a participant as currently in the meeting. If a prior row exists
 * without a `left_at`, this is a no-op (LiveKit may replay joins).
 */
export function markParticipantJoined(meetingId: number, userId: number): void {
  getStatements().upsertParticipantJoined.run(meetingId, userId);
}

/**
 * Mark all open participant rows for (meeting, user) as left. Idempotent.
 */
export function markParticipantLeft(meetingId: number, userId: number): void {
  getStatements().markParticipantLeft.run(meetingId, userId);
}

/**
 * Fetch a user's "First Last" name from the shared users table. Returns
 * null if the user id is unknown — callers should fall back to the id.
 */
export function getUserDisplayName(userId: number): string | null {
  const row = getStatements().selectUserName.get(userId);
  if (!row) return null;
  const name = `${row.first_name} ${row.last_name}`.trim();
  return name.length > 0 ? name : null;
}

/**
 * Phase 4 helper: write the `meetings.empty_since` timer anchor. Pass `null`
 * to clear it (someone joined) or an ISO-8601 string when the room went
 * empty. Works directly against the shared SQLite file; the Next.js cron
 * (`src/lib/meetings/cleanup.ts`) reads this column every minute to decide
 * whether to auto-end the meeting.
 */
export function setMeetingEmptySince(
  meetingId: number,
  emptySinceIso: string | null,
): void {
  getStatements().setMeetingEmptySince.run(emptySinceIso, meetingId);
}

/**
 * Phase 4 helper: count DB rows in `meeting_participants` that still
 * represent a live presence (`joined_at NOT NULL AND left_at IS NULL`). This
 * is only the "registered users" portion of the live count — guests live in
 * LiveKit rather than in our DB. The webhook layer uses this to short-circuit
 * the `participant_left -> empty_since = now` decision without reaching out
 * to LiveKit's REST API on every event.
 */
export function countLiveParticipantsLocal(meetingId: number): number {
  const row = getStatements().countLiveParticipantsLocal.get(meetingId);
  return row ? Number(row.cnt) : 0;
}
