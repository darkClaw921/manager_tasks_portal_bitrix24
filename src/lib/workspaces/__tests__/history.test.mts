/**
 * Unit tests for src/lib/workspaces/history.ts.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskhub-history-test-'));
const tmpDbPath = path.join(tmpDir, 'test.db');
process.env.DATABASE_PATH = tmpDbPath;

const { db } = await import('../../db/index.js');
const schema = await import('../../db/schema.js');
const { recordHistorySnapshot, listHistory, getHistoryRow, countHistory } = await import('../history.js');

function insertUser(email: string): number {
  const row = db
    .insert(schema.users)
    .values({ email, passwordHash: 'x', firstName: 'A', lastName: 'B' })
    .returning({ id: schema.users.id })
    .get();
  return row.id;
}

function insertWorkspace(ownerId: number, room: string): number {
  const row = db
    .insert(schema.workspaces)
    .values({ ownerId, title: 'Test', roomName: room })
    .returning({ id: schema.workspaces.id })
    .get();
  return row.id;
}

describe('workspace snapshot history', () => {
  let userId = 0;
  let wsId = 0;

  before(() => {
    userId = insertUser('history-test-1@test');
    wsId = insertWorkspace(userId, 'history-room');
  });

  after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('records a new history row and returns it', () => {
    const row = recordHistorySnapshot({
      workspaceId: wsId,
      version: 1,
      payload: '{"elements":{}}',
      createdBy: userId,
    });
    assert.ok(row);
    assert.equal(row?.version, 1);
    assert.equal(row?.workspaceId, wsId);
  });

  it('is idempotent on (workspaceId, version) — duplicate insert returns null', () => {
    const dup = recordHistorySnapshot({
      workspaceId: wsId,
      version: 1,
      payload: '{"elements":{"a":1}}',
      createdBy: userId,
    });
    assert.equal(dup, null);
  });

  it('lists history newest first with author metadata', () => {
    recordHistorySnapshot({
      workspaceId: wsId,
      version: 2,
      payload: '{"elements":{}}',
      createdBy: userId,
    });
    const list = listHistory(wsId);
    assert.ok(list.length >= 2);
    // Newest first → version 2 above version 1.
    assert.ok(list[0].version >= list[list.length - 1].version);
    assert.ok(list[0].authorName.length > 0);
  });

  it('getHistoryRow returns the full payload', () => {
    const all = listHistory(wsId);
    const first = all[0];
    const row = getHistoryRow(wsId, first.id);
    assert.ok(row);
    assert.equal(row?.id, first.id);
    assert.ok(row?.payload.length > 0);
  });

  it('countHistory tallies workspace-scoped rows', () => {
    const c = countHistory(wsId);
    assert.ok(c >= 2);
  });

  it('prunes oldest entries when over the per-workspace cap', () => {
    // Insert a bunch more so we cross the 30-row cap.
    for (let v = 3; v <= 40; v += 1) {
      recordHistorySnapshot({
        workspaceId: wsId,
        version: v,
        payload: '{"elements":{}}',
        createdBy: userId,
      });
    }
    const total = countHistory(wsId);
    // Cap is 30; should be at or under (we previously had 2 entries before
    // the loop, then 38 added, so post-prune ≤30).
    assert.ok(total <= 30, `expected ≤30 history rows, got ${total}`);
  });
});
