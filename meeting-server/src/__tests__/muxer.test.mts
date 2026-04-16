/**
 * Unit tests for meeting-server/src/muxer.ts (buildFfmpegArgs).
 *
 * Focus: the shape of the ffmpeg argv for the supported input permutations:
 *   (a) video + 1 audio track
 *   (b) video + 3 audio tracks (metadata indices 0..2 in correct order)
 *   (c) video only (no audio)
 *   (d) audio only (no video)
 *   (e) nothing at all — must throw
 *
 * Run via:
 *   npm test                          (from meeting-server/)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// muxer.ts imports config.ts which validates env at load time. Populate the
// minimum required vars before dynamic import so the module loads cleanly.
process.env.NODE_ENV = 'test';
process.env.LIVEKIT_URL = 'http://localhost:7880';
process.env.LIVEKIT_API_KEY = 'APIdevkey';
process.env.LIVEKIT_API_SECRET = 'dev-secret-for-unit-tests-32bytesXX';
process.env.JWT_SECRET = 'dev-secret-for-unit-tests-32bytesXX';
process.env.DB_PATH = '/tmp/taskhub-test.db';
process.env.RECORDINGS_DIR = '/tmp/taskhub-recordings';

const { buildFfmpegArgs } = await import('../muxer.js');

/** Helper: find 0-based index of each occurrence of `needle` in `haystack`. */
function allIndexesOf(haystack: string[], needle: string): number[] {
  const out: number[] = [];
  haystack.forEach((v, i) => {
    if (v === needle) out.push(i);
  });
  return out;
}

describe('buildFfmpegArgs — video + 1 audio', () => {
  const args = buildFfmpegArgs({
    videoFilePath: '/rec/1/room_1.mp4',
    audioTracks: [
      { filePath: '/rec/1/audio_42_e1.ogg', userId: '42', userName: 'Иван' },
    ],
    outputFilePath: '/rec/1/final_1.mkv',
  });

  it('includes -y as first flag', () => {
    assert.equal(args[0], '-y');
  });

  it('orders inputs video then audio', () => {
    const iIdx = allIndexesOf(args, '-i');
    assert.equal(iIdx.length, 2);
    assert.equal(args[iIdx[0]! + 1], '/rec/1/room_1.mp4');
    assert.equal(args[iIdx[1]! + 1], '/rec/1/audio_42_e1.ogg');
  });

  it('maps 0:v with copy and 1:a with copy', () => {
    assert.ok(args.includes('-map'));
    // Find "-map 0:v" pair
    const m0 = args.findIndex((v, i) => v === '-map' && args[i + 1] === '0:v');
    assert.notEqual(m0, -1, 'should map 0:v');
    assert.equal(args[m0 + 2], '-c:v');
    assert.equal(args[m0 + 3], 'copy');

    const m1 = args.findIndex((v, i) => v === '-map' && args[i + 1] === '1:a');
    assert.notEqual(m1, -1, 'should map 1:a');
    assert.equal(args[m1 + 2], '-c:a');
    assert.equal(args[m1 + 3], 'copy');
  });

  it('adds title and language metadata for audio stream index 0', () => {
    const titleIdx = args.indexOf('-metadata:s:a:0');
    assert.notEqual(titleIdx, -1);
    assert.equal(args[titleIdx + 1], 'title=Иван');

    // Next metadata flag should be the language line.
    const langIdx = args.indexOf('-metadata:s:a:0', titleIdx + 1);
    assert.notEqual(langIdx, -1);
    assert.equal(args[langIdx + 1], 'language=rus');
  });

  it('ends with the output path', () => {
    assert.equal(args[args.length - 1], '/rec/1/final_1.mkv');
  });
});

describe('buildFfmpegArgs — video + 3 audio tracks', () => {
  const args = buildFfmpegArgs({
    videoFilePath: '/rec/2/room_2.mp4',
    audioTracks: [
      { filePath: '/rec/2/a_u1.ogg', userId: '1', userName: 'Alice' },
      { filePath: '/rec/2/a_u2.ogg', userId: '2', userName: 'Bob' },
      { filePath: '/rec/2/a_u3.ogg', userId: '3', userName: 'Carol', language: 'eng' },
    ],
    outputFilePath: '/rec/2/final_2.mkv',
  });

  it('has exactly 4 -i inputs', () => {
    assert.equal(allIndexesOf(args, '-i').length, 4);
  });

  it('maps audio inputs 1:a, 2:a, 3:a in order', () => {
    const mapIndices = args
      .map((v, i) => (v === '-map' ? args[i + 1] : null))
      .filter((v): v is string => v !== null);
    // First is 0:v, then 1:a / 2:a / 3:a
    assert.deepEqual(mapIndices, ['0:v', '1:a', '2:a', '3:a']);
  });

  it('metadata stream indices count 0, 1, 2 (not 1, 2, 3)', () => {
    // `-metadata:s:a:N` counts *audio streams in the output*, not input index.
    assert.ok(args.includes('-metadata:s:a:0'));
    assert.ok(args.includes('-metadata:s:a:1'));
    assert.ok(args.includes('-metadata:s:a:2'));
    assert.ok(!args.includes('-metadata:s:a:3'));
  });

  it('associates titles with the right stream index', () => {
    // Find each title metadata and check the stream index is correct.
    const checks: Array<[string, string]> = [
      ['-metadata:s:a:0', 'title=Alice'],
      ['-metadata:s:a:1', 'title=Bob'],
      ['-metadata:s:a:2', 'title=Carol'],
    ];
    for (const [flag, expectedTitle] of checks) {
      const idx = args.indexOf(flag);
      assert.notEqual(idx, -1, `missing flag ${flag}`);
      assert.equal(args[idx + 1], expectedTitle);
    }
  });

  it('respects custom language code per track', () => {
    // Carol is the only one with an eng override; first two default to rus.
    const carolTitle = args.indexOf('title=Carol');
    // The language metadata for stream 2 should come *after* Carol's title.
    const langIdx = args.indexOf('-metadata:s:a:2', carolTitle);
    assert.notEqual(langIdx, -1);
    assert.equal(args[langIdx + 1], 'language=eng');
  });
});

describe('buildFfmpegArgs — video only (no audio)', () => {
  const args = buildFfmpegArgs({
    videoFilePath: '/rec/3/room_3.mp4',
    audioTracks: [],
    outputFilePath: '/rec/3/final_3.mkv',
  });

  it('has exactly one -i input', () => {
    assert.equal(allIndexesOf(args, '-i').length, 1);
  });

  it('maps only 0:v, no audio stream maps', () => {
    const mapIndices = args
      .map((v, i) => (v === '-map' ? args[i + 1] : null))
      .filter((v): v is string => v !== null);
    assert.deepEqual(mapIndices, ['0:v']);
  });

  it('emits no -metadata:s:a:* flags', () => {
    assert.ok(!args.some((v) => v.startsWith('-metadata:s:a:')));
  });
});

describe('buildFfmpegArgs — audio only (no video)', () => {
  const args = buildFfmpegArgs({
    videoFilePath: null,
    audioTracks: [
      { filePath: '/rec/4/a_u1.ogg', userId: '1', userName: 'Alice' },
      { filePath: '/rec/4/a_u2.ogg', userId: '2', userName: 'Bob' },
    ],
    outputFilePath: '/rec/4/final_4.mkv',
  });

  it('has exactly two -i inputs', () => {
    assert.equal(allIndexesOf(args, '-i').length, 2);
  });

  it('maps audio inputs 0:a and 1:a (no video map)', () => {
    const mapIndices = args
      .map((v, i) => (v === '-map' ? args[i + 1] : null))
      .filter((v): v is string => v !== null);
    assert.deepEqual(mapIndices, ['0:a', '1:a']);
  });

  it('metadata still indexed from 0 for audio streams', () => {
    assert.ok(args.includes('-metadata:s:a:0'));
    assert.ok(args.includes('-metadata:s:a:1'));
  });
});

describe('buildFfmpegArgs — empty inputs', () => {
  it('throws when there is no video and no audio', () => {
    assert.throws(
      () =>
        buildFfmpegArgs({
          videoFilePath: null,
          audioTracks: [],
          outputFilePath: '/rec/5/final.mkv',
        }),
      /no video and no audio/,
    );
  });
});
