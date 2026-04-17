/**
 * Unit tests for src/lib/workspaces/templates.ts.
 *
 * Pure-function module — no DB. Verifies the catalogue is wired and
 * `instantiateTemplate` produces a fresh-id snapshot.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { WORKSPACE_TEMPLATES, getTemplate, instantiateTemplate } = await import('../templates.js');

describe('templates', () => {
  it('ships at least three built-in templates', () => {
    assert.ok(WORKSPACE_TEMPLATES.length >= 3);
    const ids = WORKSPACE_TEMPLATES.map((t) => t.id);
    assert.ok(ids.includes('kanban'));
    assert.ok(ids.includes('retro'));
    assert.ok(ids.includes('mind-map'));
  });

  it('every template has a non-empty title and description', () => {
    for (const t of WORKSPACE_TEMPLATES) {
      assert.ok(t.title.length > 0);
      assert.ok(t.description.length > 0);
    }
  });

  it('every template snapshot has at least one element', () => {
    for (const t of WORKSPACE_TEMPLATES) {
      const count = Object.keys(t.snapshot.elements).length;
      assert.ok(count > 0, `template ${t.id} has no elements`);
    }
  });

  it('getTemplate returns null for unknown id', () => {
    assert.equal(getTemplate('nope'), null);
  });

  it('instantiateTemplate remaps ids to fresh UUIDs and stamps owner+updatedAt', () => {
    const tpl = getTemplate('kanban')!;
    const before = Date.now();
    const inst = instantiateTemplate(tpl, 42);
    const after = Date.now();

    const originalIds = new Set(Object.keys(tpl.snapshot.elements));
    const newIds = new Set(Object.keys(inst.elements));
    assert.equal(newIds.size, originalIds.size);
    // Every new id must be different from every original id (UUIDs are unique).
    for (const id of newIds) assert.ok(!originalIds.has(id), `id ${id} clashes with template`);

    for (const el of Object.values(inst.elements)) {
      assert.equal(el.createdBy, 42);
      assert.ok(el.updatedAt >= before && el.updatedAt <= after);
    }
  });

  it('instantiateTemplate is idempotent — multiple calls produce non-overlapping id sets', () => {
    const tpl = getTemplate('retro')!;
    const a = instantiateTemplate(tpl, 1);
    const b = instantiateTemplate(tpl, 1);
    const aIds = new Set(Object.keys(a.elements));
    const bIds = new Set(Object.keys(b.elements));
    for (const id of aIds) assert.ok(!bIds.has(id));
  });
});
