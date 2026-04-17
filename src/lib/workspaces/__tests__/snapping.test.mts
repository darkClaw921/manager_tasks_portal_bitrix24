/**
 * Unit tests for src/lib/workspaces/snapping.ts.
 *
 * Pure-function module — no DB, no imports beyond `snap` itself.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { snap } = await import('../snapping.js');

describe('snapping.snap', () => {
  it('returns input bbox unchanged when no targets are within threshold', () => {
    const bbox = { x: 100, y: 100, w: 50, h: 50 };
    const result = snap(bbox, [{ id: 'far', x: 1000, y: 1000, w: 50, h: 50 }], { threshold: 6 });
    assert.deepEqual(result.bbox, bbox);
    assert.equal(result.guides.length, 0);
  });

  it('snaps left edge to a neighbour\'s left edge when within threshold', () => {
    const bbox = { x: 103, y: 200, w: 50, h: 50 };
    const target = { id: 't1', x: 100, y: 200, w: 80, h: 80 };
    const result = snap(bbox, [target], { threshold: 6 });
    assert.equal(result.bbox.x, 100, 'x should snap to target left edge');
    assert.equal(result.bbox.y, 200, 'y unchanged when target y also matches');
    assert.ok(result.guides.length >= 1, 'at least one guide drawn');
  });

  it('snaps both axes independently', () => {
    const bbox = { x: 102, y: 198, w: 50, h: 50 };
    const target = { id: 't1', x: 100, y: 200, w: 80, h: 80 };
    const result = snap(bbox, [target], { threshold: 6 });
    assert.equal(result.bbox.x, 100);
    assert.equal(result.bbox.y, 200);
    // Two guides — one vertical for x, one horizontal for y.
    const vertical = result.guides.filter((g) => g.axis === 'v').length;
    const horizontal = result.guides.filter((g) => g.axis === 'h').length;
    assert.equal(vertical, 1);
    assert.equal(horizontal, 1);
  });

  it('snaps to grid when gridStep is provided', () => {
    // bbox.x=11 (closest grid 16), bbox.x+w=61 (closest grid 64), center=36 (closest 32).
    // Smallest delta is 3 (right edge → 64), so x_new = 11 + 3 = 14.
    const bbox = { x: 11, y: 22, w: 50, h: 50 };
    const result = snap(bbox, [], { threshold: 6, gridStep: 16 });
    assert.equal(result.bbox.x, 14, 'x snaps to nearest grid edge by smallest delta');
    // bbox.y=22 → top to 16 (delta -6); bottom to 64+8 = 72 (delta -10? actually y+h=72, grid 64 delta -8); center=47 → 48 (delta +1). center wins.
    assert.equal(result.bbox.y, 23, 'y snaps to grid via center (delta +1, smallest)');
  });

  it('threshold of 0 disables snapping', () => {
    const bbox = { x: 102, y: 102, w: 50, h: 50 };
    const result = snap(bbox, [{ id: 't', x: 100, y: 100, w: 50, h: 50 }], { threshold: 0 });
    assert.deepEqual(result.bbox, bbox);
    assert.equal(result.guides.length, 0);
  });

  it('snaps centers when both centers are close', () => {
    const bbox = { x: 100, y: 100, w: 50, h: 50 };
    // Target whose horizontal center matches: target.x + target.w/2 == bbox.x + bbox.w/2
    // bbox center.x = 125. Target with x=200 w=50 → center=225. Make target close.
    const target = { id: 't', x: 102, y: 200, w: 46, h: 50 }; // center = 125
    const result = snap(bbox, [target], { threshold: 6 });
    // bbox center matches target center → no x shift needed.
    assert.equal(result.bbox.x, 100);
  });
});
