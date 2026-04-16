/**
 * Unit / integration tests for src/lib/meetings/invite-notifications.ts.
 *
 * Mirrors the bootstrap trick used in `access.test.mts`: the `db/index.ts`
 * loader hard-codes `CREATE TABLE IF NOT EXISTS` for legacy tables but leaves
 * meetings-specific tables to `drizzle-kit push`. For this isolated test we
 * replay those DDLs by hand against a tmp SQLite file.
 *
 * Scope:
 *   1. notifyInvitedUsers writes a notifications row per invitee with
 *      type='meeting_invite' and link='/meetings/<id>'.
 *   2. Inviter is excluded even if listed in the userIds array.
 *   3. Duplicate userIds are collapsed to a single notification.
 *   4. Missing meeting is a no-op (no rows inserted, no throw).
 *
 * Web push delivery is exercised by the production code path but will
 * silently no-op in tests because VAPID keys are not configured — the
 * `deliverWebPush` helper early-returns and returns false without raising.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';

// Isolated DB file for this test run — MUST happen before any @/lib/db import.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskhub-invite-notif-test-'));
const tmpDbPath = path.join(tmpDir, 'test.db');
process.env.DATABASE_PATH = tmpDbPath;

const { db } = await import('../../db/index.js');
const schema = await import('../../db/schema.js');

interface RawDb {
  $client: { exec(sql: string): void };
}

// Replay meetings-specific DDL (see note above).
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
`);

const { notifyInvitedUsers } = await import('../invite-notifications.js');

// ==================== Fixture helpers ====================

function insertUser(
  email: string,
  opts: { firstName?: string; lastName?: string } = {}
): number {
  const row = db
    .insert(schema.users)
    .values({
      email,
      passwordHash: 'x',
      firstName: opts.firstName ?? 'Test',
      lastName: opts.lastName ?? 'User',
    })
    .returning({ id: schema.users.id })
    .get();
  return row.id;
}

function insertMeeting(hostId: number, title: string, roomName: string): number {
  const row = db
    .insert(schema.meetings)
    .values({ title, hostId, roomName })
    .returning({ id: schema.meetings.id })
    .get();
  return row.id;
}

function getNotifications(userId: number) {
  return db
    .select()
    .from(schema.notifications)
    .where(eq(schema.notifications.userId, userId))
    .all();
}

// ==================== Tests ====================

describe('notifyInvitedUsers', () => {
  let inviterId = 0;
  let invitee1 = 0;
  let invitee2 = 0;
  let meetingId = 0;

  before(() => {
    inviterId = insertUser('inviter@invite-test', {
      firstName: 'Ivan',
      lastName: 'Organizer',
    });
    invitee1 = insertUser('invitee1@invite-test');
    invitee2 = insertUser('invitee2@invite-test');
    meetingId = insertMeeting(inviterId, 'Planning sync', 'room-invite-1');
  });

  it('creates one meeting_invite notification per invitee', async () => {
    await notifyInvitedUsers(meetingId, [invitee1, invitee2], inviterId);

    const rows1 = getNotifications(invitee1);
    const rows2 = getNotifications(invitee2);

    assert.equal(rows1.length, 1, 'invitee1 should have exactly one notification');
    assert.equal(rows2.length, 1, 'invitee2 should have exactly one notification');

    assert.equal(rows1[0].type, 'meeting_invite');
    assert.equal(rows1[0].link, `/meetings/${meetingId}`);
    assert.equal(rows1[0].title, 'Приглашение на встречу');
    assert.ok(
      rows1[0].message?.includes('Ivan Organizer') &&
        rows1[0].message?.includes('Planning sync'),
      'message should include inviter name and meeting title'
    );
    assert.equal(rows1[0].isRead, false);
  });

  it('does not notify the inviter even if present in the userIds list', async () => {
    // Reset notifications for this test slice.
    db.delete(schema.notifications).run();

    await notifyInvitedUsers(meetingId, [invitee1, inviterId], inviterId);

    const inviterRows = getNotifications(inviterId);
    const invitee1Rows = getNotifications(invitee1);

    assert.equal(inviterRows.length, 0, 'inviter must not receive self-invite');
    assert.equal(invitee1Rows.length, 1);
  });

  it('de-duplicates repeated userIds', async () => {
    db.delete(schema.notifications).run();

    await notifyInvitedUsers(
      meetingId,
      [invitee2, invitee2, invitee2],
      inviterId
    );

    const rows = getNotifications(invitee2);
    assert.equal(rows.length, 1, 'duplicate userIds must collapse to one row');
  });

  it('is a no-op for an empty userIds array', async () => {
    db.delete(schema.notifications).run();

    await notifyInvitedUsers(meetingId, [], inviterId);

    const allRows = db.select().from(schema.notifications).all();
    assert.equal(allRows.length, 0);
  });

  it('is a no-op when the meeting does not exist', async () => {
    db.delete(schema.notifications).run();

    await notifyInvitedUsers(99_999_999, [invitee1], inviterId);

    const rows = getNotifications(invitee1);
    assert.equal(rows.length, 0);
  });
});

// ==================== Cleanup ====================

after(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // Ignore.
  }
});
