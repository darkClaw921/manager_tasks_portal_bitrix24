/**
 * LiveKit token minting.
 *
 * Wraps `livekit-server-sdk`'s AccessToken to produce JWT strings the
 * browser uses to authenticate against the LiveKit SFU.
 *
 * Grants issued for every participant:
 *   - `roomJoin`        — required to connect to the signalling server
 *   - `room`            — scopes the token to a single LiveKit room
 *   - `canPublish`      — publish microphone/camera/screen tracks
 *   - `canSubscribe`    — receive remote tracks
 *   - `canPublishData`  — used for the drawing data channel
 *
 * Additional grants issued only for the host:
 *   - `roomAdmin`  — allows mute/kick/update participant operations
 *   - `roomRecord` — allows the meeting-worker to request egress on this room
 *
 * TTL defaults to 6 hours — plenty for a long meeting, short enough that a
 * leaked token becomes useless quickly.
 */

import { AccessToken } from 'livekit-server-sdk';

export interface IssueTokenInput {
  /** TaskHub user id — becomes the LiveKit participant identity. */
  userId: number;
  /** Display name shown to remote peers (usually "First Last"). */
  userName: string;
  /** Target LiveKit room (from `meetings.roomName`). */
  roomName: string;
  /** When true, includes roomAdmin + roomRecord grants. */
  isHost: boolean;
  /** Override default TTL. Accepts number of seconds or a zeit/ms string. */
  ttl?: number | string;
}

/** Token TTL used when the caller does not pass an override. */
export const DEFAULT_TOKEN_TTL = '6h';

/**
 * Get the LiveKit API key/secret pair.
 *
 * Isolated into a function so it is read at call time — easier to mock in
 * tests by setting `process.env` before invoking `issueLiveKitToken`.
 */
function getLiveKitCredentials(): { apiKey: string; apiSecret: string } {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error(
      'LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set to issue meeting tokens'
    );
  }
  return { apiKey, apiSecret };
}

/**
 * Mint a LiveKit access token for a meeting participant.
 *
 * Returns a JWT string ready to hand to `new Room().connect(url, token)` on
 * the browser. The underlying SDK returns a Promise because it uses jose.
 */
export async function issueLiveKitToken(input: IssueTokenInput): Promise<string> {
  const { userId, userName, roomName, isHost, ttl } = input;

  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error('issueLiveKitToken: userId must be a positive integer');
  }
  if (!roomName || typeof roomName !== 'string') {
    throw new Error('issueLiveKitToken: roomName must be a non-empty string');
  }

  const { apiKey, apiSecret } = getLiveKitCredentials();

  const token = new AccessToken(apiKey, apiSecret, {
    identity: String(userId),
    name: userName,
    ttl: ttl ?? DEFAULT_TOKEN_TTL,
  });

  token.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    // Host-only capabilities.
    ...(isHost
      ? { roomAdmin: true, roomRecord: true }
      : {}),
  });

  return token.toJwt();
}

export interface IssueGuestTokenInput {
  /** Unique identity string, typically `guest:<uuid>`. */
  identity: string;
  /** Display name entered by the guest on the join screen. */
  userName: string;
  /** Target LiveKit room. */
  roomName: string;
  ttl?: number | string;
}

/**
 * Mint a LiveKit token for a guest (no TaskHub account). Capabilities are
 * intentionally minimal — join/publish/subscribe/data only, no room-admin
 * or room-record. Identity is opaque so the caller can collide-proof it
 * (usually via `crypto.randomUUID`).
 */
export async function issueGuestLiveKitToken(
  input: IssueGuestTokenInput
): Promise<string> {
  const { identity, userName, roomName, ttl } = input;
  if (!identity || typeof identity !== 'string') {
    throw new Error('issueGuestLiveKitToken: identity must be a non-empty string');
  }
  if (!roomName || typeof roomName !== 'string') {
    throw new Error('issueGuestLiveKitToken: roomName must be a non-empty string');
  }
  const { apiKey, apiSecret } = getLiveKitCredentials();
  const token = new AccessToken(apiKey, apiSecret, {
    identity,
    name: userName,
    ttl: ttl ?? DEFAULT_TOKEN_TTL,
  });
  token.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });
  return token.toJwt();
}
