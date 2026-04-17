/**
 * Unit tests for the buildInverse helper used by the client-side undo stack.
 *
 * The hook itself is React — we don't render it here. We only verify the
 * inverse-op math which is pure.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { buildInverse } = await import('../undo.js');
import type { Element } from '../../../types/workspace.js';

const sample: Element = {
  id: 'el-1',
  kind: 'rect',
  x: 100,
  y: 200,
  w: 50,
  h: 60,
  z: 1,
  style: { stroke: '#000', fill: '#fff' },
  createdBy: 1,
  updatedAt: 1,
};

describe('useUndoRedo.buildInverse', () => {
  it('inverts add → delete by id', () => {
    const op = { type: 'add' as const, el: sample, opId: 'a', v: 0 };
    const inv = buildInverse(op, undefined);
    assert.ok(inv);
    assert.equal(inv?.type, 'delete');
    if (inv?.type === 'delete') {
      assert.deepEqual(inv.ids, ['el-1']);
    }
  });

  it('inverts delete → add for the first element in the snapshot', () => {
    const op = { type: 'delete' as const, ids: ['el-1'], opId: 'd', v: 0 };
    const inv = buildInverse(op, [sample]);
    assert.ok(inv);
    assert.equal(inv?.type, 'add');
    if (inv?.type === 'add') {
      assert.equal(inv.el.id, 'el-1');
      assert.equal(inv.el.x, 100);
    }
  });

  it('returns null for delete without snapshot', () => {
    const op = { type: 'delete' as const, ids: ['el-1'], opId: 'd', v: 0 };
    assert.equal(buildInverse(op, undefined), null);
  });

  it('inverts update by patching back the previous values', () => {
    const op = {
      type: 'update' as const,
      id: 'el-1',
      patch: { x: 999, y: 888, updatedAt: 5 },
      opId: 'u',
      v: 0,
    };
    const inv = buildInverse(op, sample);
    assert.ok(inv);
    if (inv?.type === 'update') {
      const patch = inv.patch as Record<string, unknown>;
      assert.equal(patch.x, 100);
      assert.equal(patch.y, 200);
      // updatedAt is intentionally NOT inverted — it's set on apply.
      assert.equal('updatedAt' in patch, false);
    }
  });

  it('inverts transform by capturing pre-mutation x/y/w/h/rot', () => {
    const op = {
      type: 'transform' as const,
      id: 'el-1',
      xy: [500, 600] as [number, number],
      size: [80, 90] as [number, number],
      rot: 1.5,
      opId: 't',
      v: 0,
    };
    const inv = buildInverse(op, sample);
    assert.ok(inv);
    if (inv?.type === 'transform') {
      assert.deepEqual(inv.xy, [100, 200]);
      assert.deepEqual(inv.size, [50, 60]);
      assert.equal(inv.rot, 0); // sample has no rot → defaults to 0
    }
  });

  it('returns null for a no-op transform (no fields supplied)', () => {
    const op = { type: 'transform' as const, id: 'el-1', opId: 't', v: 0 };
    assert.equal(buildInverse(op, sample), null);
  });

  it('inverts z by capturing the previous index', () => {
    const op = { type: 'z' as const, id: 'el-1', index: 99, opId: 'z', v: 0 };
    const inv = buildInverse(op, sample);
    assert.ok(inv);
    if (inv?.type === 'z') {
      assert.equal(inv.index, 1);
    }
  });

  it('returns null for update/transform/z when before snapshot is missing', () => {
    assert.equal(
      buildInverse({ type: 'update' as const, id: 'el-1', patch: { x: 1 }, opId: 'u', v: 0 }, undefined),
      null
    );
    assert.equal(
      buildInverse({ type: 'transform' as const, id: 'el-1', xy: [1, 2], opId: 't', v: 0 }, undefined),
      null
    );
    assert.equal(buildInverse({ type: 'z' as const, id: 'el-1', index: 5, opId: 'z', v: 0 }, undefined), null);
  });
});
