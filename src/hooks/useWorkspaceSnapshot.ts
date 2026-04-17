'use client';

/**
 * Periodic snapshot writer.
 *
 * Why not run on the server? Snapshots aggregate the entire current element
 * set — the server would need to keep an in-memory replica per workspace
 * which doubles complexity. Doing it client-side leans on the fact that all
 * peers already have the consolidated state in `workspaceStore.elements`.
 *
 * Coordination (Phase 1, single-leader):
 *   - The OWNER, when present in the room, is always the leader.
 *   - Otherwise the participant whose LiveKit identity sorts lowest is the
 *     leader. This is deterministic and free of any extra coordination
 *     primitives.
 *
 * Cadence:
 *   - Debounce 30 s from the last op. Each op resets the timer.
 *   - Hard rate-limit of one save per 5 s (prevents storms when many ops
 *     fall outside the debounce window).
 *   - Skip the save while `pendingOps` is non-empty — we want the
 *     server-side `currentVersion` cursor to be stable before we truncate.
 *
 * Lifecycle:
 *   - On unmount the leader fires a best-effort final save (fire-and-
 *     forget). We also bind a `beforeunload` listener so a fresh tab close
 *     still gets a chance to persist.
 */

import { useEffect, useMemo, useRef } from 'react';
import type { Room } from 'livekit-client';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { buildSnapshot } from '@/lib/workspaces/ops';

export interface UseWorkspaceSnapshotOptions {
  workspaceId: number;
  room: Room | null;
  /** Local user id — needed to derive the leader vs follower role. */
  userId: number;
  /** Owner id of the workspace, if known. The owner is always preferred. */
  ownerId: number | null;
}

const DEBOUNCE_MS = 30_000;
const MIN_INTERVAL_MS = 5_000;

export function useWorkspaceSnapshot({
  workspaceId,
  room,
  userId,
  ownerId,
}: UseWorkspaceSnapshotOptions): { triggerSaveNow: () => void } {
  const localIdentity = useMemo(() => String(userId), [userId]);
  const ownerIdentity = useMemo(
    () => (ownerId != null ? String(ownerId) : null),
    [ownerId]
  );

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaveAtRef = useRef(0);
  const inFlightRef = useRef(false);

  /** Decide whether THIS client is responsible for saving the snapshot. */
  const isLeader = (): boolean => {
    if (!room) return false;
    // Owner override.
    if (ownerIdentity) {
      // If the owner is in the room — only the owner saves.
      const ownerInRoom =
        ownerIdentity === localIdentity ||
        room.remoteParticipants.has(ownerIdentity);
      if (ownerInRoom) {
        return ownerIdentity === localIdentity;
      }
    }
    // Fallback: lowest identity wins.
    const identities: string[] = [localIdentity];
    room.remoteParticipants.forEach((_, identity) => identities.push(identity));
    identities.sort();
    return identities[0] === localIdentity;
  };

  const performSave = async () => {
    if (inFlightRef.current) return;
    if (!isLeader()) return;
    const state = useWorkspaceStore.getState();
    // Wait for pending ops to ack — the server-known version must be stable.
    if (Object.keys(state.pendingOps).length > 0) return;
    const now = Date.now();
    if (now - lastSaveAtRef.current < MIN_INTERVAL_MS) return;
    inFlightRef.current = true;
    try {
      const payload = buildSnapshot(state.elements);
      const version = state.currentVersion;
      const res = await fetch(`/api/workspaces/${workspaceId}/snapshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version, payload }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        // 4xx → log and back off. 5xx → debounce will retry on the next op.
        console.warn(`[useWorkspaceSnapshot] save failed: ${res.status} ${text}`);
        return;
      }
      lastSaveAtRef.current = Date.now();
      useWorkspaceStore.getState().setSnapshotVersion(version);
    } catch (err) {
      console.warn('[useWorkspaceSnapshot] save threw:', err);
    } finally {
      inFlightRef.current = false;
    }
  };

  const armDebounce = () => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      void performSave();
    }, DEBOUNCE_MS);
  };

  // Subscribe to currentVersion changes — every accepted op bumps it.
  useEffect(() => {
    let prev = useWorkspaceStore.getState().currentVersion;
    const unsub = useWorkspaceStore.subscribe((state) => {
      if (state.currentVersion !== prev) {
        prev = state.currentVersion;
        armDebounce();
      }
    });
    return () => {
      unsub();
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  // Best-effort final save on unmount + beforeunload.
  useEffect(() => {
    const finaliser = () => {
      void performSave();
    };
    window.addEventListener('beforeunload', finaliser);
    return () => {
      window.removeEventListener('beforeunload', finaliser);
      finaliser();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, room, ownerId, userId]);

  return {
    triggerSaveNow: () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      void performSave();
    },
  };
}
