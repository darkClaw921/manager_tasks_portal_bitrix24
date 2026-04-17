'use client';

/**
 * Presenter mode for workspaces.
 *
 * One participant ("the presenter") opts in to broadcast their viewport at
 * ~5 Hz over the LiveKit lossy data channel (`workspace.presenter`). All
 * other participants who choose to follow that presenter automatically
 * mirror the broadcast viewport via `workspaceStore.setViewport`.
 *
 * Wire format (`PresenterPayload`):
 *   {
 *     presenterId: number   // app user id of the active presenter
 *     viewport: { x, y, zoom }
 *     ts: number            // epoch ms — used to age out stale presenters
 *   }
 *
 * Conflict resolution: LWW by `ts`. The most-recent broadcast wins, so a
 * second user toggling presenter mode on simply takes over for everyone
 * who's following.
 *
 * Followers leave automatically when:
 *   - 5 s elapse without a presenter heartbeat (presenter disconnected).
 *   - The user manually toggles "stop following".
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Room } from 'livekit-client';
import { useLiveKitData } from './useLiveKitData';
import { useWorkspaceStore } from '@/stores/workspaceStore';

export const PRESENTER_TOPIC = 'workspace.presenter';
const HEARTBEAT_HZ = 5;
const HEARTBEAT_MS = Math.round(1000 / HEARTBEAT_HZ);
/** Followers stop following after this many ms without a heartbeat. */
const STALE_AFTER_MS = 5000;

export interface PresenterPayload {
  presenterId: number;
  viewport: { x: number; y: number; zoom: number };
  ts: number;
}

export interface UseWorkspacePresenterOptions {
  room: Room | null;
  /** Local user id. Used to identify ourselves on broadcasts + filter echoes. */
  currentUserId: number;
}

export interface UseWorkspacePresenterResult {
  /** Are we currently broadcasting our viewport to others? */
  isPresenting: boolean;
  startPresenting: () => void;
  stopPresenting: () => void;
  /** Are we mirroring someone else's viewport right now? */
  isFollowing: boolean;
  /** App user id of the presenter we're currently mirroring (null when not following). */
  followingUserId: number | null;
  /** Most recently observed presenter — set even when we haven't opted to follow yet. */
  lastSeenPresenterId: number | null;
  startFollowing: () => void;
  stopFollowing: () => void;
}

export function useWorkspacePresenter({
  room,
  currentUserId,
}: UseWorkspacePresenterOptions): UseWorkspacePresenterResult {
  const data = useLiveKitData<PresenterPayload>(room, PRESENTER_TOPIC);
  const [isPresenting, setIsPresenting] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [lastSeenPresenterId, setLastSeenPresenterId] = useState<number | null>(null);
  const [followingUserId, setFollowingUserId] = useState<number | null>(null);
  // Mutable refs for fast-path access inside the broadcast loop / handler.
  const isPresentingRef = useRef(false);
  const isFollowingRef = useRef(false);
  const lastHeartbeatRef = useRef<{ presenterId: number; ts: number } | null>(null);
  isPresentingRef.current = isPresenting;
  isFollowingRef.current = isFollowing;

  // ==================== Broadcast loop ====================
  useEffect(() => {
    if (!isPresenting || !room) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      const v = useWorkspaceStore.getState().viewport;
      const payload: PresenterPayload = {
        presenterId: currentUserId,
        viewport: { x: v.x, y: v.y, zoom: v.zoom },
        ts: Date.now(),
      };
      try {
        await data.publish(payload, { reliable: false });
      } catch {
        // Lossy channel — ignore transient publish failures.
      }
    };
    // Tick immediately then on interval.
    void tick();
    const id = setInterval(tick, HEARTBEAT_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isPresenting, room, currentUserId, data]);

  // ==================== Subscribe + apply remote presenter viewport ====================
  useEffect(() => {
    return data.subscribe((msg) => {
      // Drop our own echoes.
      if (msg.presenterId === currentUserId) return;
      // Track the latest presenter id (used by "Follow" UI even when we
      // haven't opted in yet).
      setLastSeenPresenterId(msg.presenterId);
      lastHeartbeatRef.current = { presenterId: msg.presenterId, ts: msg.ts };
      if (!isFollowingRef.current) return;
      // Snap the viewport. We DO bypass any local pan/zoom that the user may
      // have done since the last heartbeat — that's intentional: while
      // following, the local user is a passenger.
      useWorkspaceStore.getState().setViewport(msg.viewport);
      setFollowingUserId(msg.presenterId);
    });
  }, [data, currentUserId]);

  // ==================== Stale-presenter timeout ====================
  useEffect(() => {
    if (!isFollowing) return;
    const id = setInterval(() => {
      const last = lastHeartbeatRef.current;
      if (!last || Date.now() - last.ts > STALE_AFTER_MS) {
        setIsFollowing(false);
        setFollowingUserId(null);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [isFollowing]);

  // ==================== Conflict guard: only one local mode at a time ====================
  // If we toggle on presenting while following, drop following first.
  const startPresenting = useCallback(() => {
    setIsFollowing(false);
    setFollowingUserId(null);
    setIsPresenting(true);
  }, []);
  const stopPresenting = useCallback(() => {
    setIsPresenting(false);
  }, []);
  const startFollowing = useCallback(() => {
    setIsPresenting(false);
    setIsFollowing(true);
  }, []);
  const stopFollowing = useCallback(() => {
    setIsFollowing(false);
    setFollowingUserId(null);
  }, []);

  // Stop presenting when the room disconnects.
  useEffect(() => {
    if (!room) {
      setIsPresenting(false);
      setIsFollowing(false);
    }
  }, [room]);

  return {
    isPresenting,
    startPresenting,
    stopPresenting,
    isFollowing,
    followingUserId,
    lastSeenPresenterId,
    startFollowing,
    stopFollowing,
  };
}
