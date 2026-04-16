/**
 * Unit tests for src/lib/meetings/tokens.ts.
 *
 * Runs on Node's built-in `node:test` + tsx. Invoke via:
 *
 *   npm test
 *
 * which maps to `tsx --test src/lib/meetings/__tests__/*.test.ts`.
 *
 * Strategy: issue a token, verify it against the same API secret using
 * `livekit-server-sdk`'s `TokenVerifier`, then assert the decoded `video`
 * grant claims match what we asked for (participant grants for non-hosts,
 * + roomAdmin/roomRecord for hosts).
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { TokenVerifier } from 'livekit-server-sdk';

// Set LiveKit credentials before importing tokens.ts so getLiveKitCredentials()
// sees them when issueLiveKitToken is invoked. These are test-only values.
const TEST_API_KEY = 'APIdevkey';
const TEST_API_SECRET = 'dev-secret-for-unit-tests-32bytesXX';
process.env.LIVEKIT_API_KEY = TEST_API_KEY;
process.env.LIVEKIT_API_SECRET = TEST_API_SECRET;

// Dynamic import so env assignment above is visible before any tokens.ts
// code runs. Top-level await works because this file is an ESM `.mts`.
const { issueLiveKitToken, DEFAULT_TOKEN_TTL } = await import('../tokens.js');

const verifier = new TokenVerifier(TEST_API_KEY, TEST_API_SECRET);

/** Pull the `video` claim off a verified token, typed loosely to avoid protobuf coupling. */
async function decodeVideoGrant(token: string): Promise<Record<string, unknown>> {
  const claims = await verifier.verify(token);
  assert.ok(claims.video, 'verified claims must contain video grant');
  return claims.video as unknown as Record<string, unknown>;
}

describe('issueLiveKitToken', () => {
  before(() => {
    // Sanity: ensure env is correctly in place — if the test file is re-run
    // after a previous test wiped env, issueLiveKitToken would throw.
    assert.equal(process.env.LIVEKIT_API_KEY, TEST_API_KEY);
  });

  it('returns a non-empty JWT string', async () => {
    const token = await issueLiveKitToken({
      userId: 42,
      userName: 'Alice Example',
      roomName: 'room-abc',
      isHost: false,
    });
    assert.equal(typeof token, 'string');
    assert.ok(token.length > 20, 'token should look like a JWT');
    // JWT format: three dot-separated base64url parts.
    assert.equal(token.split('.').length, 3);
  });

  it('grants participant-level permissions for non-host', async () => {
    const token = await issueLiveKitToken({
      userId: 10,
      userName: 'Bob',
      roomName: 'room-xyz',
      isHost: false,
    });
    const video = await decodeVideoGrant(token);

    assert.equal(video.roomJoin, true, 'roomJoin must be true');
    assert.equal(video.room, 'room-xyz', 'room must match input');
    assert.equal(video.canPublish, true, 'canPublish must be true');
    assert.equal(video.canSubscribe, true, 'canSubscribe must be true');
    assert.equal(video.canPublishData, true, 'canPublishData must be true');

    // Host-only grants must NOT be present / must not be truthy.
    assert.notEqual(video.roomAdmin, true, 'non-host must not get roomAdmin');
    assert.notEqual(video.roomRecord, true, 'non-host must not get roomRecord');
  });

  it('adds roomAdmin and roomRecord for host', async () => {
    const token = await issueLiveKitToken({
      userId: 77,
      userName: 'Charlie Host',
      roomName: 'room-host',
      isHost: true,
    });
    const video = await decodeVideoGrant(token);

    assert.equal(video.roomJoin, true);
    assert.equal(video.room, 'room-host');
    assert.equal(video.canPublish, true);
    assert.equal(video.canSubscribe, true);
    assert.equal(video.canPublishData, true);
    assert.equal(video.roomAdmin, true, 'host must get roomAdmin');
    assert.equal(video.roomRecord, true, 'host must get roomRecord');
  });

  it('encodes user identity and name into the token', async () => {
    const token = await issueLiveKitToken({
      userId: 5,
      userName: 'Dave Display',
      roomName: 'room-5',
      isHost: false,
    });
    const claims = await verifier.verify(token);
    // livekit-server-sdk stores identity in JWT `sub`, display name in `name`.
    assert.equal(claims.sub, '5');
    assert.equal(claims.name, 'Dave Display');
  });

  it('rejects invalid userId', async () => {
    await assert.rejects(
      () =>
        issueLiveKitToken({
          userId: 0,
          userName: 'nope',
          roomName: 'r',
          isHost: false,
        }),
      /positive integer/i
    );
  });

  it('rejects empty roomName', async () => {
    await assert.rejects(
      () =>
        issueLiveKitToken({
          userId: 1,
          userName: 'nope',
          roomName: '',
          isHost: false,
        }),
      /roomName/i
    );
  });

  it('DEFAULT_TOKEN_TTL is a positive duration string', () => {
    assert.equal(typeof DEFAULT_TOKEN_TTL, 'string');
    assert.match(DEFAULT_TOKEN_TTL, /\d/);
  });
});
