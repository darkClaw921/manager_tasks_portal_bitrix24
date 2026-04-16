/**
 * Unit tests for src/lib/meetings/access.ts.
 *
 * Uses a temporary SQLite file that isolates the test run from any dev DB.
 * The DATABASE_PATH env var MUST be set before importing `@/lib/db` (or any
 * module that transitively imports it), because the DB file is opened at
 * module load time.
 *
 * Runs on Node's built-in `node:test` + tsx (`npm test`).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Isolated DB file for this test run.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskhub-access-test-'));
const tmpDbPath = path.join(tmpDir, 'test.db');
process.env.DATABASE_PATH = tmpDbPath;

// Dynamic imports AFTER env is set. Drizzle / better-sqlite3 will then open
// the tmp file. `db` module also kicks off an async `seedAdmin()` that hits
// bcrypt; we let it run — it's fire-and-forget and won't race our asserts.
const { db } = await import('../../db/index.js');
const schema = await import('../../db/schema.js');

// The db/index.ts bootstrap hardcodes CREATE TABLE for legacy tables but
// leaves meetings-specific tables to `drizzle-kit push`. For the unit test
// we replay the relevant migration statements by hand so isolated runs do
// not depend on having run the drizzle migrations.
interface RawDb {
  $client: { exec(sql: string): void };
}
(db as unknown as RawDb).$client.exec(`
  CREATE TABLE IF NOT EXISTS meetings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    host_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    room_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled',
    recording_enabled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    started_at TEXT,
    ended_at TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS meetings_room_name_unique ON meetings(room_name);
  CREATE TABLE IF NOT EXISTS meeting_participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'participant',
    joined_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    left_at TEXT
  );
  CREATE TABLE IF NOT EXISTS meeting_recordings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    track_type TEXT NOT NULL,
    user_id TEXT,
    file_path TEXT NOT NULL,
    egress_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'recording',
    started_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    ended_at TEXT,
    size_bytes INTEGER
  );
  CREATE UNIQUE INDEX IF NOT EXISTS meeting_recordings_egress_id_unique ON meeting_recordings(egress_id);
  CREATE TABLE IF NOT EXISTS meeting_annotations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
  );
`);

const { canJoinMeeting, isHost } = await import('../access.js');

// ==================== Fixture helpers ====================

function insertUser(
  email: string,
  opts: { isAdmin?: boolean; firstName?: string; lastName?: string } = {}
): number {
  const row = db
    .insert(schema.users)
    .values({
      email,
      passwordHash: 'x',
      firstName: opts.firstName ?? 'Test',
      lastName: opts.lastName ?? 'User',
      isAdmin: opts.isAdmin ?? false,
    })
    .returning({ id: schema.users.id })
    .get();
  return row.id;
}

function insertMeeting(hostId: number, roomName: string): number {
  const row = db
    .insert(schema.meetings)
    .values({
      title: 'Test meeting',
      hostId,
      roomName,
    })
    .returning({ id: schema.meetings.id })
    .get();
  return row.id;
}

function addParticipantRow(meetingId: number, userId: number) {
  db.insert(schema.meetingParticipants)
    .values({ meetingId, userId, role: 'participant' })
    .run();
}

// ==================== Tests ====================

describe('isHost', () => {
  let hostId = 0;
  let otherId = 0;
  let meetingId = 0;

  before(() => {
    hostId = insertUser('host-isHost@test');
    otherId = insertUser('other-isHost@test');
    meetingId = insertMeeting(hostId, 'room-isHost-1');
  });

  it('returns true for the host', async () => {
    assert.equal(await isHost(hostId, meetingId), true);
  });

  it('returns false for a non-host user', async () => {
    assert.equal(await isHost(otherId, meetingId), false);
  });

  it('returns false when the meeting does not exist', async () => {
    assert.equal(await isHost(hostId, 99_999_999), false);
  });
});

describe('canJoinMeeting', () => {
  let hostId = 0;
  let participantId = 0;
  let strangerId = 0;
  let adminId = 0;
  let meetingId = 0;

  before(() => {
    hostId = insertUser('host-canJoin@test');
    participantId = insertUser('participant-canJoin@test');
    strangerId = insertUser('stranger-canJoin@test');
    adminId = insertUser('admin-canJoin@test', { isAdmin: true });
    meetingId = insertMeeting(hostId, 'room-canJoin-1');
    addParticipantRow(meetingId, participantId);
  });

  it('allows the host', async () => {
    assert.equal(await canJoinMeeting(hostId, meetingId), true);
  });

  it('allows a listed participant', async () => {
    assert.equal(await canJoinMeeting(participantId, meetingId), true);
  });

  it('allows a TaskHub admin even when not listed', async () => {
    assert.equal(await canJoinMeeting(adminId, meetingId), true);
  });

  it('denies an unrelated user', async () => {
    assert.equal(await canJoinMeeting(strangerId, meetingId), false);
  });

  it('denies when the meeting does not exist', async () => {
    assert.equal(await canJoinMeeting(hostId, 99_999_999), false);
  });
});

// ==================== Cleanup ====================

after(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // Ignore — tmp dir cleanup is best-effort.
  }
});
