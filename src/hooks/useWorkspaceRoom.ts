'use client';

/**
 * Hook that owns the lifecycle of a single LiveKit `Room` instance for a
 * workspace. Adapted from `useMeetingRoom.ts` — workspaces don't need
 * audio/video, so we connect with `enableMedia=false` semantics by default
 * (no mic/camera publishing), and we wire participant events into the
 * workspaceStore presence map for the cursors layer.
 *
 * Inputs:
 *   - `token` and `url`: from `POST /api/workspaces/[id]/token`.
 *   - `userId`/`userName`: used to label our own presence locally and to
 *     filter our own echoes in `useWorkspaceOps`.
 *
 * Output mirrors `useMeetingRoom` so the data-channel hooks (which already
 * accept `Room | null`) work without changes.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Room,
  RoomEvent,
  ConnectionState,
  DisconnectReason,
  type RemoteParticipant,
} from 'livekit-client';
import { useWorkspaceStore, type PresenceEntry } from '@/stores/workspaceStore';

export interface UseWorkspaceRoomOptions {
  token: string | null;
  url: string | null;
  /** Local user id — written into presence so the renderer can colour our own cursor. */
  userId: number;
  /** Display name for the local participant. Falls back to `User #<id>`. */
  userName?: string;
}

export interface UseWorkspaceRoomResult {
  room: Room | null;
  isConnected: boolean;
  connectionState: ConnectionState;
  error: Error | null;
  /**
   * Last disconnect reason emitted by LiveKit. `PARTICIPANT_REMOVED` (kicked)
   * is the signal a workspace owner used `removeParticipant` against us; the
   * UI uses it to redirect away from the canvas.
   */
  disconnectReason: DisconnectReason | null;
  reconnect: () => void;
}

/** Stable colour assignment from a participant identity (Phase 1: hash-based). */
export function colourForIdentity(identity: string): string {
  // Simple FNV-1a hash → hue. Collision is harmless — colours are decorative.
  let hash = 2166136261;
  for (let i = 0; i < identity.length; i += 1) {
    hash ^= identity.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue}, 70%, 50%)`;
}

export function useWorkspaceRoom({
  token,
  url,
  userId,
  userName,
}: UseWorkspaceRoomOptions): UseWorkspaceRoomResult {
  const [room, setRoom] = useState<Room | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    ConnectionState.Disconnected
  );
  const [error, setError] = useState<Error | null>(null);
  const [disconnectReason, setDisconnectReason] = useState<DisconnectReason | null>(null);
  const [reconnectNonce, setReconnectNonce] = useState(0);

  const setPresence = useWorkspaceStore((s) => s.setPresence);
  const removePresence = useWorkspaceStore((s) => s.removePresence);

  // Stable refs so the connect effect doesn't tear down on every name change.
  const userIdRef = useRef(userId);
  const userNameRef = useRef(userName);
  userIdRef.current = userId;
  userNameRef.current = userName;

  const reconnect = useCallback(() => {
    setReconnectNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!token || !url) return;

    let cancelled = false;
    const r = new Room({
      adaptiveStream: false,
      dynacast: false,
      // Workspaces don't broadcast media — keep capture defaults minimal so the
      // hook never trips a mic/camera permission prompt.
    });

    const stampedSetPresence = (identity: string, displayName: string) => {
      // Insert a placeholder so the participants panel sees the join event
      // even before the peer broadcasts a cursor. Cursor coords are at (0,0)
      // until the user moves the mouse.
      const entry: PresenceEntry = {
        identity,
        name: displayName,
        color: colourForIdentity(identity),
        x: 0,
        y: 0,
        ts: Date.now(),
      };
      setPresence(entry);
    };

    const onConnectionStateChanged = (state: ConnectionState) => {
      setConnectionState(state);
      setIsConnected(state === ConnectionState.Connected);
    };

    const onConnected = () => {
      setIsConnected(true);
      setError(null);
      // Seed presence with already-present remotes (they will publish their
      // own cursor next tick; we just want the peer to show up immediately).
      r.remoteParticipants.forEach((p) => {
        stampedSetPresence(p.identity, p.name ?? p.identity);
      });
    };

    const onDisconnected = (reason?: DisconnectReason) => {
      setIsConnected(false);
      if (reason !== undefined) setDisconnectReason(reason);
    };

    const onParticipantConnected = (p: RemoteParticipant) => {
      stampedSetPresence(p.identity, p.name ?? p.identity);
    };

    const onParticipantDisconnected = (p: RemoteParticipant) => {
      removePresence(p.identity);
    };

    r.on(RoomEvent.ConnectionStateChanged, onConnectionStateChanged)
      .on(RoomEvent.Connected, onConnected)
      .on(RoomEvent.Disconnected, onDisconnected)
      .on(RoomEvent.ParticipantConnected, onParticipantConnected)
      .on(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);

    setRoom(r);
    setError(null);
    setDisconnectReason(null);

    (async () => {
      try {
        await r.connect(url, token, {
          autoSubscribe: false, // we don't need media tracks
          maxRetries: 3,
        });
        if (cancelled) return;
        // Publish our own placeholder presence so other participants see us
        // as soon as the cursor hook spins up.
        stampedSetPresence(
          String(userIdRef.current),
          userNameRef.current?.trim() || `User #${userIdRef.current}`
        );
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsConnected(false);
      }
    })();

    return () => {
      cancelled = true;
      r.off(RoomEvent.ConnectionStateChanged, onConnectionStateChanged);
      r.off(RoomEvent.Connected, onConnected);
      r.off(RoomEvent.Disconnected, onDisconnected);
      r.off(RoomEvent.ParticipantConnected, onParticipantConnected);
      r.off(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
      void r.disconnect();
      setRoom(null);
      setIsConnected(false);
      setConnectionState(ConnectionState.Disconnected);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, url, reconnectNonce]);

  return { room, isConnected, connectionState, error, disconnectReason, reconnect };
}
