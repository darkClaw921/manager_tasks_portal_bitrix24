'use client';

/**
 * Cursor presence over the LiveKit data channel.
 *
 * Topology:
 *   - Outbound: `broadcastCursor(x, y)` is called from the canvas mousemove
 *     handler. We throttle to ~20 Hz via a `setTimeout` window — finer than
 *     human perception (>16 ms = 1 frame at 60 fps) but coarse enough to
 *     not saturate the SFU's lossy channel.
 *   - Inbound: every payload received on topic `workspace.cursor` is written
 *     into `workspaceStore.presence`. Echoes from the local user are
 *     filtered by `participant.identity === String(currentUserId)`.
 *   - Stale entries: a periodic interval drops cursors that haven't ticked
 *     in 5 s — covers the case where a peer's tab goes background and
 *     stops sending updates without disconnecting.
 *
 * `CursorPresence.x/y` is normalised to [0..1] of the sender's viewport so
 * receivers don't need to know its window size — the renderer multiplies
 * by its own canvas dimensions.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Room } from 'livekit-client';
import { useLiveKitData } from './useLiveKitData';
import { useWorkspaceStore, type PresenceEntry } from '@/stores/workspaceStore';
import {
  WORKSPACE_CURSOR_TOPIC,
  type CursorPresence,
} from '@/types/workspace';
import { colourForIdentity } from './useWorkspaceRoom';

/** Time between broadcasts (ms). 50 ms ≈ 20 Hz. */
const BROADCAST_MIN_INTERVAL_MS = 50;
/** Drop presence entries we haven't heard from in this many ms. */
const STALE_PRESENCE_MS = 5_000;

export interface UseWorkspacePresenceOptions {
  room: Room | null;
  /** Local user id — matches LiveKit participant.identity. */
  currentUserId: number;
  /** Display name shown next to the remote cursor. */
  currentUserName?: string;
}

export interface UseWorkspacePresenceResult {
  /**
   * Broadcast our cursor position. Coordinates are normalised [0..1] of the
   * sender's viewport. Called per pointermove from the canvas. Internally
   * throttled to 20 Hz; surplus calls are coalesced.
   */
  broadcastCursor: (x: number, y: number) => void;
  /**
   * Stable colour assigned to the local user — useful when the renderer
   * wants to draw the local user's cursor in the participants panel.
   */
  myColor: string;
}

export function useWorkspacePresence({
  room,
  currentUserId,
  currentUserName,
}: UseWorkspacePresenceOptions): UseWorkspacePresenceResult {
  const data = useLiveKitData<CursorPresence>(room, WORKSPACE_CURSOR_TOPIC);
  const localIdentity = useMemo(() => String(currentUserId), [currentUserId]);
  const myColor = useMemo(() => colourForIdentity(localIdentity), [localIdentity]);

  const setPresence = useWorkspaceStore((s) => s.setPresence);
  const removePresence = useWorkspaceStore((s) => s.removePresence);
  const prunePresence = useWorkspaceStore((s) => s.prunePresence);

  // ==================== Inbound ====================

  useEffect(() => {
    const unsubscribe = data.subscribe((payload, participant) => {
      if (!payload || typeof payload !== 'object') return;
      if (typeof payload.x !== 'number' || typeof payload.y !== 'number') return;
      const identity = participant?.identity;
      if (!identity) return;
      // Filter our own echo.
      if (identity === localIdentity) return;

      const entry: PresenceEntry = {
        identity,
        name: participant?.name ?? identity,
        color: payload.color || colourForIdentity(identity),
        x: clamp01(payload.x),
        y: clamp01(payload.y),
        ts: Date.now(),
      };
      setPresence(entry);
    });
    return unsubscribe;
  }, [data, localIdentity, setPresence]);

  // ==================== Stale-entry pruner ====================

  useEffect(() => {
    if (!room) return;
    const interval = setInterval(() => {
      prunePresence(Date.now() - STALE_PRESENCE_MS);
    }, 1_000);
    return () => clearInterval(interval);
  }, [room, prunePresence]);

  // Drop presence when the room transitions away. The store is the source of
  // truth for currently-rendered cursors, so we want to remove ourselves
  // (purely for symmetry — re-mount will re-add).
  useEffect(() => {
    return () => {
      removePresence(localIdentity);
    };
  }, [removePresence, localIdentity]);

  // ==================== Outbound (throttled) ====================
  //
  // Trailing-edge throttle: the latest call within the window is buffered
  // and emitted when the window elapses. This guarantees the resting cursor
  // position is always sent (rather than dropped at the trailing edge).
  const lastSentAtRef = useRef(0);
  const pendingRef = useRef<{ x: number; y: number } | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const publishCursor = useCallback(
    async (x: number, y: number) => {
      if (!room) return;
      const payload: CursorPresence = {
        x: clamp01(x),
        y: clamp01(y),
        color: myColor,
      };
      try {
        await data.publish(payload, { reliable: false });
      } catch (err) {
        // Lossy channel — failures are expected occasionally; log only.
        // eslint-disable-next-line no-console
        console.debug('[useWorkspacePresence] publish failed:', err);
      }
    },
    [data, myColor, room]
  );

  const broadcastCursor = useCallback(
    (x: number, y: number) => {
      const now = Date.now();
      const since = now - lastSentAtRef.current;
      if (since >= BROADCAST_MIN_INTERVAL_MS) {
        lastSentAtRef.current = now;
        pendingRef.current = null;
        if (flushTimerRef.current !== null) {
          clearTimeout(flushTimerRef.current);
          flushTimerRef.current = null;
        }
        void publishCursor(x, y);
        return;
      }
      // Stash the latest position; trailing-edge timer will flush it.
      pendingRef.current = { x, y };
      if (flushTimerRef.current === null) {
        flushTimerRef.current = setTimeout(() => {
          flushTimerRef.current = null;
          const pending = pendingRef.current;
          pendingRef.current = null;
          if (pending) {
            lastSentAtRef.current = Date.now();
            void publishCursor(pending.x, pending.y);
          }
        }, BROADCAST_MIN_INTERVAL_MS - since);
      }
    },
    [publishCursor]
  );

  // Cleanup throttle timer on unmount or room change.
  useEffect(() => {
    return () => {
      if (flushTimerRef.current !== null) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
    };
  }, [room]);

  // The display name parameter is forwarded so future UIs (e.g. label next to
  // own cursor) can show it without another lookup. Suppress unused warning.
  void currentUserName;

  return { broadcastCursor, myColor };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
