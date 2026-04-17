/**
 * Server-side LiveKit kick helper for workspaces.
 *
 * Used when an owner removes a participant from the DB — we also evict the
 * peer from the LiveKit room so they cannot keep broadcasting ops over the
 * data channel until their token TTL expires (6h).
 *
 * Identity convention mirrors `issueLiveKitToken`: `String(userId)`.
 *
 * Failure behaviour: best-effort. LiveKit/network errors are logged and
 * swallowed so a transient infra hiccup does not block the DB-level
 * removal that the caller already committed.
 */

import { RoomServiceClient } from 'livekit-server-sdk';

let cachedClient: RoomServiceClient | null = null;

function getRoomClient(): RoomServiceClient | null {
  if (cachedClient) return cachedClient;
  const url = process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!url || !apiKey || !apiSecret) return null;
  cachedClient = new RoomServiceClient(url, apiKey, apiSecret);
  return cachedClient;
}

export async function kickFromWorkspaceRoom(
  roomName: string,
  userId: number
): Promise<void> {
  const client = getRoomClient();
  if (!client) return;
  const identity = String(userId);
  try {
    await client.removeParticipant(roomName, identity);
  } catch (err) {
    // Common: participant is not currently in the room (404). Swallow.
    const msg = err instanceof Error ? err.message : String(err);
    if (/not found|404/i.test(msg)) return;
    console.warn(
      `[workspaces/livekit-kick] removeParticipant(${roomName}, ${identity}) failed: ${msg}`
    );
  }
}
