'use client';

/**
 * Realtime op-channel for a single workspace.
 *
 * Wires three pieces together:
 *   1. workspaceStore — single source of truth for the canvas elements.
 *   2. LiveKit data channel (topic `workspace.ops`, reliable + msgpackr).
 *   3. REST persistence (POST /api/workspaces/:id/ops, batched).
 *
 * Publish path (`commitOp`):
 *   a. Optimistic apply via `applyOpLocal` — caller sees the change instantly.
 *   b. Add to `pendingOps` so we know to skip the LiveKit echo.
 *   c. Throttle `transform` ops to 30 Hz (drag/resize chatter).
 *   d. Publish to LiveKit (peers see it ~50 ms later).
 *   e. Queue for the next REST batch (50 ms debounce, max 10 ops).
 *
 * Subscribe path:
 *   a. Decode incoming op (msgpackr handled inside `useLiveKitData`).
 *   b. Drop if `participant.identity === local` AND we have it in
 *      `pendingOps` — that's our own echo.
 *   c. Apply to the store via the pure reducer.
 *
 * Persistence acks:
 *   - Each ack carries `serverId` (monotonic). We bump `currentVersion` and
 *     remove the entry from `pendingOps`.
 *
 * Failure handling:
 *   - Network errors retry with exponential backoff (250 ms → 4 s, then drop).
 *   - 4xx validation errors are logged + dropped (the op is corrupt).
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Room } from 'livekit-client';
import { useLiveKitData } from './useLiveKitData';
import {
  useWorkspaceStore,
} from '@/stores/workspaceStore';
import {
  WORKSPACE_OPS_TOPIC,
  type WorkspaceOp,
  type OpAdd,
  type OpUpdate,
  type OpTransform,
  type OpDelete,
  type OpZ,
} from '@/types/workspace';

/**
 * Distributive Omit so the discriminated union keeps `el`/`ids`/etc fields
 * on the `commitOp` input shape.
 */
export type WorkspaceOpInput =
  | (Omit<OpAdd, 'opId' | 'v'> & { opId?: string; v?: number })
  | (Omit<OpUpdate, 'opId' | 'v'> & { opId?: string; v?: number })
  | (Omit<OpTransform, 'opId' | 'v'> & { opId?: string; v?: number })
  | (Omit<OpDelete, 'opId' | 'v'> & { opId?: string; v?: number })
  | (Omit<OpZ, 'opId' | 'v'> & { opId?: string; v?: number });

const BATCH_DEBOUNCE_MS = 50;
const BATCH_MAX = 10;
/** Throttle window for `transform` ops (drag/resize). 30 Hz ≈ every 33 ms. */
const TRANSFORM_THROTTLE_MS = 33;
/** Backoff schedule for failed POSTs (ms). */
const RETRY_BACKOFF = [250, 500, 1000, 2000, 4000];

export interface UseWorkspaceOpsOptions {
  workspaceId: number;
  room: Room | null;
  /** App user id — matches LiveKit `identity` so we can filter our own echoes. */
  userId: number;
  /**
   * Fired once when the persistence POST returns 403 — indicates the caller
   * lost edit access (kicked from the workspace) while the LiveKit kick has
   * not yet propagated. Caller should redirect away.
   */
  onAccessLost?: () => void;
}

export interface UseWorkspaceOpsResult {
  /**
   * Commit a new op. Generates `opId` + `v` for you, applies optimistically,
   * publishes to LiveKit, and queues the REST batch. Resolves immediately —
   * the server ack happens asynchronously via the internal queue.
   */
  commitOp: (op: WorkspaceOpInput) => string;
  /** Force-flush the REST batch buffer right now. Useful before unmount. */
  flushPending: () => Promise<void>;
}

interface BatchEntry {
  clientOpId: string;
  baseVersion: number;
  op: WorkspaceOp;
  /** Number of attempts already made. */
  attempts: number;
}

function generateOpId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function useWorkspaceOps({
  workspaceId,
  room,
  userId,
  onAccessLost,
}: UseWorkspaceOpsOptions): UseWorkspaceOpsResult {
  const onAccessLostRef = useRef(onAccessLost);
  onAccessLostRef.current = onAccessLost;
  const accessLostFiredRef = useRef(false);
  const data = useLiveKitData<WorkspaceOp>(room, WORKSPACE_OPS_TOPIC);
  const localIdentity = useMemo(() => String(userId), [userId]);

  const applyOpLocal = useWorkspaceStore((s) => s.applyOpLocal);
  const markOpAcked = useWorkspaceStore((s) => s.markOpAcked);
  // We read versions from the store imperatively (not as subscriptions) to
  // avoid re-creating commitOp on every change.
  const storeRef = useRef(useWorkspaceStore.getState());
  useEffect(() => {
    return useWorkspaceStore.subscribe((state) => {
      storeRef.current = state;
    });
  }, []);

  // ==================== Outbound batch ====================

  const batchRef = useRef<BatchEntry[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const cancelledRef = useRef(false);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current !== null) return;
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null;
      void runFlush();
    }, BATCH_DEBOUNCE_MS);
  }, []);

  const runFlush = useCallback(async () => {
    if (inFlightRef.current) return inFlightRef.current;
    if (batchRef.current.length === 0) return;

    const batch = batchRef.current.splice(0, BATCH_MAX);
    if (batchRef.current.length > 0) {
      // Still entries remaining — re-arm the timer for the leftover slice.
      scheduleFlush();
    }

    const work = (async () => {
      const body = JSON.stringify({
        ops: batch.map((b) => ({
          clientOpId: b.clientOpId,
          baseVersion: b.baseVersion,
          op: b.op,
        })),
      });

      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/ops`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          if (res.status === 403) {
            console.warn(`[useWorkspaceOps] access lost (403): ${text}`);
            if (!accessLostFiredRef.current) {
              accessLostFiredRef.current = true;
              try {
                onAccessLostRef.current?.();
              } catch (cbErr) {
                console.warn('[useWorkspaceOps] onAccessLost threw:', cbErr);
              }
            }
            return;
          }
          if (res.status >= 400 && res.status < 500) {
            // Validation — drop. The op is corrupt.
            console.warn(
              `[useWorkspaceOps] dropping batch (${res.status} ${res.statusText}): ${text}`
            );
            return;
          }
          throw new Error(`POST /ops failed: ${res.status} ${text}`);
        }

        const json = (await res.json()) as {
          data: {
            acks: Array<{
              clientOpId: string;
              serverId: number;
              createdAt: string;
              deduped: boolean;
            }>;
          };
        };
        const acks = json.data?.acks ?? [];
        for (const ack of acks) {
          markOpAcked(ack.clientOpId, ack.serverId);
        }
      } catch (err) {
        // Network/server error — retry the batch with backoff.
        if (cancelledRef.current) return;
        console.warn('[useWorkspaceOps] flush failed, retrying:', err);
        for (const entry of batch) {
          entry.attempts += 1;
          if (entry.attempts >= RETRY_BACKOFF.length) {
            console.error(
              `[useWorkspaceOps] giving up on op ${entry.clientOpId} after ${entry.attempts} attempts`
            );
            // Best-effort: still mark acked so the pending map clears.
            markOpAcked(entry.clientOpId);
            continue;
          }
          // Re-queue at the head so order is preserved.
          batchRef.current.unshift(entry);
        }
        const delay =
          RETRY_BACKOFF[Math.min(RETRY_BACKOFF.length - 1, batch[0]?.attempts ?? 0)];
        if (!cancelledRef.current && batchRef.current.length > 0) {
          setTimeout(() => {
            if (!cancelledRef.current) void runFlush();
          }, delay);
        }
      }
    })();

    inFlightRef.current = work;
    try {
      await work;
    } finally {
      inFlightRef.current = null;
    }
  }, [workspaceId, markOpAcked, scheduleFlush]);

  // Cleanup on unmount: cancel the timer and best-effort drain the queue.
  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
      if (flushTimerRef.current !== null) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
    };
  }, []);

  // ==================== Inbound subscription ====================

  useEffect(() => {
    const unsubscribe = data.subscribe((op, participant) => {
      if (!op || typeof op !== 'object' || typeof (op as WorkspaceOp).type !== 'string') {
        return;
      }
      // Filter our own echoes — we already applied optimistically.
      if (participant?.identity === localIdentity) {
        const pending = storeRef.current.pendingOps;
        if (pending && (op as WorkspaceOp).opId in pending) {
          return;
        }
      }
      applyOpLocal(op as WorkspaceOp);
    });
    return unsubscribe;
  }, [data, localIdentity, applyOpLocal]);

  // ==================== Throttle for transform ====================
  // Track last publish-time per element id to coalesce drag chatter.
  const lastTransformAtRef = useRef<Map<string, number>>(new Map());

  const commitOp = useCallback(
    (input: WorkspaceOpInput): string => {
      const opId = input.opId ?? generateOpId();
      const v = input.v ?? storeRef.current.currentVersion;
      const op: WorkspaceOp = { ...(input as WorkspaceOp), opId, v };

      // Throttle intermediate transform ops. The final commit should be sent
      // as `update` (or another transform after the throttle window) so the
      // peers see the resting state.
      if (op.type === 'transform') {
        const now = Date.now();
        const last = lastTransformAtRef.current.get(op.id) ?? 0;
        if (now - last < TRANSFORM_THROTTLE_MS) {
          // Apply locally only — do NOT publish/persist.
          applyOpLocal(op, { now });
          return opId;
        }
        lastTransformAtRef.current.set(op.id, now);
      }

      // Optimistic apply + remember as pending so we filter the LiveKit echo.
      applyOpLocal(op, { pending: true });

      // Publish to peers — fire-and-forget, optimistic state already applied.
      if (room) {
        void data.publish(op, { reliable: true }).catch((err) => {
          console.warn('[useWorkspaceOps] publish failed:', err);
        });
      }

      // Queue for REST batch.
      batchRef.current.push({
        clientOpId: opId,
        baseVersion: storeRef.current.snapshotVersion,
        op,
        attempts: 0,
      });
      if (batchRef.current.length >= BATCH_MAX) {
        if (flushTimerRef.current !== null) {
          clearTimeout(flushTimerRef.current);
          flushTimerRef.current = null;
        }
        void runFlush();
      } else {
        scheduleFlush();
      }
      return opId;
    },
    [applyOpLocal, data, room, runFlush, scheduleFlush]
  );

  const flushPending = useCallback(async () => {
    if (flushTimerRef.current !== null) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    while (batchRef.current.length > 0) {
      await runFlush();
    }
  }, [runFlush]);

  return { commitOp, flushPending };
}
