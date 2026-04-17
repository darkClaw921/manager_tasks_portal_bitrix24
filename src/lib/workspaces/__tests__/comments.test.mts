/**
 * Unit tests for src/lib/workspaces/comments.ts.
 *
 * Uses an isolated SQLite file. Workspace tables are bootstrapped by the
 * `db/index.ts` initialise step, so no manual CREATE TABLE is needed for them
 * — only the `users` row + `workspaces` parent are seeded by hand.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskhub-comments-test-'));
const tmpDbPath = path.join(tmpDir, 'test.db');
process.env.DATABASE_PATH = tmpDbPath;

const { db } = await import('../../db/index.js');
const schema = await import('../../db/schema.js');
const {
  createComment,
  listCommentsForElement,
  getCommentCountsByElement,
  setCommentResolved,
  deleteComment,
  getComment,
} = await import('../comments.js');

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

describe('workspace comments', () => {
  let userId = 0;
  let user2Id = 0;
  let wsId = 0;

  before(() => {
    userId = insertUser('comments-test-1@test');
    user2Id = insertUser('comments-test-2@test');
    wsId = insertWorkspace(userId, 'comments-room');
  });

  after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('creates a comment with author metadata', () => {
    const c = createComment({
      workspaceId: wsId,
      elementId: 'el-1',
      userId,
      content: 'Hello world',
    });
    assert.equal(c.content, 'Hello world');
    assert.equal(c.workspaceId, wsId);
    assert.equal(c.elementId, 'el-1');
    assert.ok(c.authorName.length > 0);
  });

  it('rejects empty content', () => {
    assert.throws(() =>
      createComment({ workspaceId: wsId, elementId: 'el-1', userId, content: '   ' })
    );
  });

  it('lists comments for an element ordered by createdAt', async () => {
    createComment({ workspaceId: wsId, elementId: 'el-2', userId, content: 'first' });
    // Tiny wait so timestamps differ.
    await new Promise((r) => setTimeout(r, 5));
    createComment({ workspaceId: wsId, elementId: 'el-2', userId: user2Id, content: 'second' });
    const list = listCommentsForElement(wsId, 'el-2');
    assert.equal(list.length, 2);
    assert.equal(list[0].content, 'first');
    assert.equal(list[1].content, 'second');
  });

  it('counts comments per element, excluding resolved by default', () => {
    const c = createComment({ workspaceId: wsId, elementId: 'el-3', userId, content: 'one' });
    createComment({ workspaceId: wsId, elementId: 'el-3', userId, content: 'two' });
    let counts = getCommentCountsByElement(wsId);
    assert.equal(counts['el-3'], 2);
    setCommentResolved(c.id, true);
    counts = getCommentCountsByElement(wsId);
    assert.equal(counts['el-3'], 1);
    counts = getCommentCountsByElement(wsId, { includeResolved: true });
    assert.equal(counts['el-3'], 2);
  });

  it('toggles resolved flag', () => {
    const c = createComment({ workspaceId: wsId, elementId: 'el-4', userId, content: 'x' });
    assert.equal(c.resolved, 0);
    setCommentResolved(c.id, true);
    const after1 = getComment(c.id);
    assert.equal(after1?.resolved, 1);
    setCommentResolved(c.id, false);
    const after2 = getComment(c.id);
    assert.equal(after2?.resolved, 0);
  });

  it('deletes a comment by id', () => {
    const c = createComment({ workspaceId: wsId, elementId: 'el-5', userId, content: 'gone' });
    assert.ok(getComment(c.id));
    assert.equal(deleteComment(c.id), true);
    assert.equal(getComment(c.id), null);
    // Idempotent — deleting twice returns false but does not throw.
    assert.equal(deleteComment(c.id), false);
  });
});
