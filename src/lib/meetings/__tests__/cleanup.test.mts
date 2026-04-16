/**
 * Unit tests for src/lib/meetings/cleanup.ts.
 *
 * The goal is to exercise the tickEmptyMeetings() state machine end-to-end
 * against a real SQLite instance, with the LiveKit RoomServiceClient stubbed
 * out (no SFU dependency in tests). We cover:
 *   - Empty meeting without an armed timer -> arms empty_since.
 *   - Empty meeting with armed timer that has NOT elapsed -> still live.
 *   - Empty meeting with armed timer that HAS elapsed -> status -> ended.
 *   - Meeting that went from empty to non-empty -> empty_since cleared.
 *   - Meeting with a LiveKit-only guest identity -> counted as live.
 *   - Meetings with status != 'live' are ignored.
 *   - endMeeting is idempotent (second tick on already-ended is a no-op).
 *
 * Follows the pattern in access.test.mts: isolated tmp SQLite file via
 * DATABASE_PATH, LiveKit credentials stubbed via process.env so the client
 * constructor is happy.
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';

// ---- Env isolation (BEFORE any @/lib/db or cleanup import) ----
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskhub-cleanup-test-'));
const tmpDbPath = path.join(tmpDir, 'test.db');
process.env.DATABASE_PATH = tmpDbPath;
// cleanup.ts / meetings.ts read these at call time; provide safe stubs so
// token / client construction paths do not throw when exercised. The
// RoomServiceClient itself is swapped out via setRoomClientForTests.
process.env.LIVEKIT_URL = process.env.LIVEKIT_URL || 'http://livekit.test';
process.env.LIVEKIT_API_KEY =
  process.env.LIVEKIT_API_KEY || 'devkey0123456789';
process.env.LIVEKIT_API_SECRET =
  process.env.LIVEKIT_API_SECRET || 'devsecret0123456789abcd';

const { db } = await import('../../db/index.js');
const schema = await import('../../db/schema.js');

// Ensure meetings DDL is present (index.ts bootstrap covers legacy tables,
// meeting DDL lives in drizzle migrations + updated bootstrap — replay
// defensively so this test stands on its own).
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
    ended_at TEXT,
    empty_since TEXT
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
`);

// The legacy bootstrap might have beaten us to creating `meetings` without
// empty_since. Align the schema with an idempotent ALTER so every test run
// sees the column (the real runtime migration does the same thing).
try {
  (db as unknown as RawDb).$client.exec(
    `ALTER TABLE meetings ADD COLUMN empty_since TEXT`,
  );
} catch {
  // Column already exists — ignore.
}

const cleanup = await import('../cleanup.js');
const { tickEmptyMeetings, setRoomClientForTests, EMPTY_MEETING_TTL_MS } =
  cleanup;

// ---- Stub RoomServiceClient so no real LiveKit call is made ----
// The real client exposes .listParticipants(roomName) which returns an
// array-like of { identity, ... }. Our stub mirrors that minimally.
interface StubParticipant {
  identity: string;
}
const stubRoomParticipants: Record<string, StubParticipant[]> = {};
const stubClient = {
  async listParticipants(roomName: string): Promise<StubParticipant[]> {
    return stubRoomParticipants[roomName] ?? [];
  },
} as unknown as import('livekit-server-sdk').RoomServiceClient;

setRoomClientForTests(stubClient);

// ---- Fixture helpers ----
function insertUser(email: string): number {
  const row = db
    .insert(schema.users)
    .values({
      email,
      passwordHash: 'x',
      firstName: 'Test',
      lastName: 'User',
      isAdmin: false,
    })
    .returning({ id: schema.users.id })
    .get();
  return row.id;
}

function createLiveMeeting(
  hostId: number,
  roomName: string,
  opts: { emptySince?: string | null } = {},
): number {
  const row = db
    .insert(schema.meetings)
    .values({
      title: `Meeting ${roomName}`,
      hostId,
      roomName,
      status: 'live',
      recordingEnabled: false,
      startedAt: new Date().toISOString(),
      emptySince: opts.emptySince ?? null,
    })
    .returning({ id: schema.meetings.id })
    .get();
  return row.id;
}

function insertLiveParticipant(meetingId: number, userId: number): void {
  db.insert(schema.meetingParticipants)
    .values({
      meetingId,
      userId,
      role: 'participant',
      joinedAt: new Date().toISOString(),
    })
    .run();
}

function getMeetingRow(id: number) {
  return db
    .select()
    .from(schema.meetings)
    .where(eq(schema.meetings.id, id))
    .get();
}

// ---- Tests ----

describe('cleanup.tickEmptyMeetings', () => {
  after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('arms empty_since when a live meeting has zero participants and none are in LiveKit', async () => {
    const hostId = insertUser(`host-${Date.now()}-1@test`);
    const mid = createLiveMeeting(hostId, `room-empty-new-${Date.now()}`);
    stubRoomParticipants[`room-empty-new-${Date.now()}`] = [];

    await tickEmptyMeetings();

    const m = getMeetingRow(mid);
    assert.ok(m, 'meeting exists');
    assert.equal(m.status, 'live', 'status stays live within grace window');
    assert.ok(m.emptySince, 'empty_since armed');
    assert.ok(
      Math.abs(Date.parse(m.emptySince!) - Date.now()) < 10_000,
      'empty_since is near now',
    );
  });

  it('clears empty_since when someone rejoins (DB participant present)', async () => {
    const hostId = insertUser(`host-${Date.now()}-2@test`);
    const roomName = `room-rejoin-${Date.now()}`;
    // Meeting had its timer armed 1 minute ago.
    const oneMinAgo = new Date(Date.now() - 60_000).toISOString();
    const mid = createLiveMeeting(hostId, roomName, { emptySince: oneMinAgo });
    insertLiveParticipant(mid, hostId);
    stubRoomParticipants[roomName] = [];

    await tickEmptyMeetings();

    const m = getMeetingRow(mid);
    assert.equal(m?.status, 'live');
    assert.equal(m?.emptySince, null, 'empty_since cleared on rejoin');
  });

  it('clears empty_since when a LiveKit guest identity is in the room (no DB row)', async () => {
    const hostId = insertUser(`host-${Date.now()}-3@test`);
    const roomName = `room-guest-${Date.now()}`;
    const recentIso = new Date(Date.now() - 30_000).toISOString();
    const mid = createLiveMeeting(hostId, roomName, { emptySince: recentIso });
    // No DB participant row — but LiveKit reports a guest live in the room.
    stubRoomParticipants[roomName] = [{ identity: 'guest:abc-123' }];

    await tickEmptyMeetings();

    const m = getMeetingRow(mid);
    assert.equal(m?.status, 'live');
    assert.equal(m?.emptySince, null, 'guest presence clears empty_since');
  });

  it('auto-ends a meeting whose empty_since is older than EMPTY_MEETING_TTL_MS', async () => {
    const hostId = insertUser(`host-${Date.now()}-4@test`);
    const roomName = `room-expired-${Date.now()}`;
    const sixMinAgo = new Date(
      Date.now() - (EMPTY_MEETING_TTL_MS + 60_000),
    ).toISOString();
    const mid = createLiveMeeting(hostId, roomName, { emptySince: sixMinAgo });
    stubRoomParticipants[roomName] = [];

    await tickEmptyMeetings();

    const m = getMeetingRow(mid);
    assert.equal(m?.status, 'ended', 'meeting auto-ended after 5min grace');
    assert.ok(m?.endedAt, 'ended_at stamped');
  });

  it('leaves meeting live when empty_since is within grace window', async () => {
    const hostId = insertUser(`host-${Date.now()}-5@test`);
    const roomName = `room-within-${Date.now()}`;
    // Empty for 2 minutes — should still be alive.
    const twoMinAgo = new Date(Date.now() - 2 * 60_000).toISOString();
    const mid = createLiveMeeting(hostId, roomName, { emptySince: twoMinAgo });
    stubRoomParticipants[roomName] = [];

    await tickEmptyMeetings();

    const m = getMeetingRow(mid);
    assert.equal(m?.status, 'live', 'status stays live inside grace');
    assert.equal(m?.emptySince, twoMinAgo, 'empty_since unchanged');
  });

  it('is idempotent: ticking an already-ended meeting is a no-op', async () => {
    const hostId = insertUser(`host-${Date.now()}-6@test`);
    const roomName = `room-ended-${Date.now()}`;
    const mid = createLiveMeeting(hostId, roomName);
    // Simulate a prior close.
    db.update(schema.meetings)
      .set({ status: 'ended', endedAt: new Date().toISOString() })
      .where(eq(schema.meetings.id, mid))
      .run();
    stubRoomParticipants[roomName] = [];

    await tickEmptyMeetings(); // should not touch ended meetings at all

    const m = getMeetingRow(mid);
    assert.equal(m?.status, 'ended');
    assert.equal(m?.emptySince, null, 'ended meetings are not armed');
  });

  it('ignores meetings in status scheduled', async () => {
    const hostId = insertUser(`host-${Date.now()}-7@test`);
    const roomName = `room-sched-${Date.now()}`;
    const row = db
      .insert(schema.meetings)
      .values({
        title: 'sched',
        hostId,
        roomName,
        status: 'scheduled',
        recordingEnabled: false,
        emptySince: null,
      })
      .returning({ id: schema.meetings.id })
      .get();
    stubRoomParticipants[roomName] = [];

    await tickEmptyMeetings();

    const m = getMeetingRow(row.id);
    assert.equal(m?.status, 'scheduled', 'scheduled meetings left alone');
    assert.equal(m?.emptySince, null);
  });
});
