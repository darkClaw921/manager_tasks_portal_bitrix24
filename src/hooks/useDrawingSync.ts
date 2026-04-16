'use client';

/**
 * Drawing synchronisation over the LiveKit data channel.
 *
 * Two-way bridge between the meetingStore (annotations slice) and the wire
 * protocol described by `DrawingPayload` in `src/types/meeting.ts`.
 *
 * Topology:
 *   - Publish path: caller invokes `publishStroke / publishUndo / publishClear`.
 *     We *first* mutate the local store (optimistic) and *then* send bytes,
 *     so the presenter sees their own ink with no perceptible latency. Local
 *     mutation also happens even if `publish()` rejects — the presenter still
 *     sees their drawing, we just log the network error.
 *
 *   - Subscribe path: every incoming message is routed by `type`. Messages
 *     authored by the local user are dropped to avoid duplicating optimistic
 *     state (the SDK echoes our own messages back via the SFU). The local
 *     identity is the LiveKit `participant.identity`, which we issue server
 *     side as `String(userId)` (see `src/lib/meetings/tokens.ts`).
 *
 * Caller responsibilities:
 *   - Generate stroke ids — we expose `nextStrokeId()` for convenience but
 *     the canvas component owns the in-progress polyline.
 *   - Pass the current `userId` so we can stamp outgoing events.
 */

import { useCallback, useEffect, useMemo } from 'react';
import type { Room } from 'livekit-client';
import { useLiveKitData } from './useLiveKitData';
import { useMeetingStore } from '@/stores/meetingStore';
import type {
  DrawingPayload,
  StrokeEvent,
  UndoEvent,
  ClearEvent,
} from '@/types/meeting';

export interface UseDrawingSyncOptions {
  room: Room | null;
  /** App user id of the local participant (matches LiveKit `identity`). */
  userId: number;
}

export interface UseDrawingSyncResult {
  /** Add a stroke locally + broadcast it. */
  publishStroke: (
    stroke: Omit<StrokeEvent, 'type' | 'userId' | 'timestamp'> & {
      userId?: number;
      timestamp?: number;
    }
  ) => Promise<void>;
  /** Remove a single stroke (by id) locally + broadcast undo. */
  publishUndo: (strokeId: string) => Promise<void>;
  /** Wipe all strokes locally + broadcast clear. */
  publishClear: () => Promise<void>;
  /** Generate a fresh stroke id — use this when starting a new polyline. */
  nextStrokeId: () => string;
}

const DRAW_TOPIC = 'draw';

/**
 * Allocate a unique stroke id. We don't need cryptographic randomness — the id
 * just has to be unique within a single meeting and small enough to be cheap
 * to ship over msgpackr. `crypto.randomUUID()` exists in modern browsers and
 * gives us collision resistance for free; we fall back to a timestamp + random
 * for older environments (and SSR which doesn't have window.crypto here).
 */
function generateStrokeId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function useDrawingSync({
  room,
  userId,
}: UseDrawingSyncOptions): UseDrawingSyncResult {
  const data = useLiveKitData<DrawingPayload>(room, DRAW_TOPIC);

  const addStroke = useMeetingStore((s) => s.addStroke);
  const undoStroke = useMeetingStore((s) => s.undoStroke);
  const clearStrokes = useMeetingStore((s) => s.clearStrokes);

  // Local LiveKit identity — used to filter our own echoes out of incoming
  // traffic. Issued by `issueLiveKitToken` as `String(userId)`.
  const localIdentity = useMemo(() => String(userId), [userId]);

  // Wire incoming messages into the store. Filter by participant.identity to
  // keep the optimistic update authoritative for the local user.
  useEffect(() => {
    const unsubscribe = data.subscribe((msg, participant) => {
      // Echo of our own message — already applied optimistically. Skip.
      if (participant?.identity === localIdentity) return;

      switch (msg.type) {
        case 'stroke':
          addStroke(msg);
          break;
        case 'undo':
          undoStroke(msg.strokeId);
          break;
        case 'clear':
          clearStrokes();
          break;
        default: {
          // Exhaustiveness guard — if we ever add a new event type we will
          // get a compile error here.
          const _exhaustive: never = msg;
          void _exhaustive;
        }
      }
    });
    return unsubscribe;
  }, [data, localIdentity, addStroke, undoStroke, clearStrokes]);

  const publishStroke = useCallback<UseDrawingSyncResult['publishStroke']>(
    async (input) => {
      const stroke: StrokeEvent = {
        type: 'stroke',
        id: input.id,
        userId: input.userId ?? userId,
        color: input.color,
        width: input.width,
        points: input.points,
        timestamp: input.timestamp ?? Date.now(),
      };
      // Optimistic local update — runs even if the network publish fails.
      addStroke(stroke);
      try {
        await data.publish(stroke);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[useDrawingSync] failed to publish stroke:', err);
      }
    },
    [data, addStroke, userId]
  );

  const publishUndo = useCallback(
    async (strokeId: string) => {
      const evt: UndoEvent = {
        type: 'undo',
        userId,
        strokeId,
        timestamp: Date.now(),
      };
      undoStroke(strokeId);
      try {
        await data.publish(evt);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[useDrawingSync] failed to publish undo:', err);
      }
    },
    [data, undoStroke, userId]
  );

  const publishClear = useCallback(async () => {
    const evt: ClearEvent = {
      type: 'clear',
      userId,
      timestamp: Date.now(),
    };
    clearStrokes();
    try {
      await data.publish(evt);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[useDrawingSync] failed to publish clear:', err);
    }
  }, [data, clearStrokes, userId]);

  const nextStrokeId = useCallback(() => generateStrokeId(), []);

  return { publishStroke, publishUndo, publishClear, nextStrokeId };
}
