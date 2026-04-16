'use client';

/**
 * Generic wrapper around LiveKit's data channel scoped to a single `topic`.
 *
 * Why: every feature that uses the data channel (drawing strokes, future
 * reactions, presence pings, …) needs the exact same plumbing: serialize an
 * arbitrary payload to bytes, call `localParticipant.publishData`, listen for
 * `RoomEvent.DataReceived`, filter by topic, and decode bytes back into an
 * object. Bundling that into one hook keeps each feature hook small and
 * eliminates duplicated subscribe/unsubscribe bookkeeping.
 *
 * Wire format: msgpackr (binary). msgpackr is roughly 2x faster + 30-50%
 * smaller than `JSON.stringify` for the kind of payload we send (objects with
 * small numeric arrays for stroke point coordinates).
 *
 * livekit-client v2 signature:
 *   `RoomEvent.DataReceived` fires with
 *   `(payload: Uint8Array, participant?: RemoteParticipant,
 *     kind?: DataPacket_Kind, topic?: string)`
 */

import { useCallback, useEffect, useRef } from 'react';
import {
  RoomEvent,
  type Room,
  type RemoteParticipant,
  type DataPacket_Kind,
} from 'livekit-client';
import { Packr, Unpackr } from 'msgpackr';

/** Options forwarded to `room.localParticipant.publishData`. */
export interface PublishOptions {
  /** When true (default), use SCTP-reliable channel. False = lossy. */
  reliable?: boolean;
  /**
   * Restrict delivery to a specific subset of participants by their LiveKit
   * identity. When omitted, the message is broadcast to everyone.
   */
  destinationIdentities?: string[];
}

/** Handler invoked for every received message on the configured topic. */
export type DataHandler<T> = (
  data: T,
  participant: RemoteParticipant | undefined,
  kind: DataPacket_Kind | undefined
) => void;

export interface UseLiveKitDataResult<T> {
  /**
   * Send a payload on this hook's `topic`. Resolves once the SDK has handed
   * the bytes off; rejects if `room` is null/disconnected.
   *
   * If you want to ignore your own echoes, use the optimistic-update pattern
   * in your subscribe handler (compare `participant?.identity` to local).
   */
  publish: (data: T, opts?: PublishOptions) => Promise<void>;
  /**
   * Register a handler. Returns an `unsubscribe` thunk. Multiple handlers
   * are supported — each receives every matching message in registration
   * order. Handlers are also auto-removed on unmount.
   */
  subscribe: (handler: DataHandler<T>) => () => void;
}

/**
 * Reuse a single Packr/Unpackr pair for the whole module. Both are stateless
 * w.r.t. the data they encode — instantiating per-render would be wasteful.
 */
const PACKR = new Packr({
  // structuredClone keeps Map/Set/Date semantics intact in case payloads grow.
  structuredClone: true,
});
const UNPACKR = new Unpackr({
  structuredClone: true,
});

/**
 * Subscribe to a typed slice of the LiveKit data channel.
 *
 * @example
 * const data = useLiveKitData<DrawingPayload>(room, 'draw');
 * useEffect(() => data.subscribe((msg, p) => { ... }), [data]);
 * await data.publish({ type: 'stroke', ... });
 */
export function useLiveKitData<T = unknown>(
  room: Room | null,
  topic: string
): UseLiveKitDataResult<T> {
  // Set of registered handlers. Using a ref + Set so adding/removing one
  // handler doesn't trigger any re-render and we can iterate during a
  // DataReceived event without having to snapshot.
  const handlersRef = useRef<Set<DataHandler<T>>>(new Set());

  // Wire up the room-level DataReceived listener exactly once per
  // (room, topic) pair. Filters non-matching topics out before unpacking
  // — important so we don't spend CPU decoding messages destined for
  // unrelated features.
  useEffect(() => {
    if (!room) return;

    const onDataReceived = (
      payload: Uint8Array,
      participant?: RemoteParticipant,
      kind?: DataPacket_Kind,
      receivedTopic?: string
    ) => {
      if (receivedTopic !== topic) return;
      if (handlersRef.current.size === 0) return;

      let decoded: T;
      try {
        decoded = UNPACKR.unpack(payload) as T;
      } catch (err) {
        // Bad/corrupt payload — log and skip rather than crash the room.
        // eslint-disable-next-line no-console
        console.warn(
          `[useLiveKitData] failed to unpack message on topic "${topic}":`,
          err
        );
        return;
      }

      // Snapshot before iterating — handlers may call subscribe()/unsubscribe()
      // synchronously from inside their own callback.
      const snapshot = Array.from(handlersRef.current);
      for (const handler of snapshot) {
        try {
          handler(decoded, participant, kind);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(
            `[useLiveKitData] handler threw while processing "${topic}":`,
            err
          );
        }
      }
    };

    room.on(RoomEvent.DataReceived, onDataReceived);
    return () => {
      room.off(RoomEvent.DataReceived, onDataReceived);
    };
  }, [room, topic]);

  // Drain handlers when the hook unmounts so a re-mount starts clean.
  useEffect(() => {
    const handlers = handlersRef.current;
    return () => {
      handlers.clear();
    };
  }, []);

  const publish = useCallback(
    async (data: T, opts?: PublishOptions) => {
      if (!room) {
        throw new Error('useLiveKitData.publish: room is not connected yet');
      }
      const bytes = PACKR.pack(data);
      // publishData expects Uint8Array. Packr returns a Buffer in Node and a
      // Uint8Array in the browser; both satisfy the runtime type but TS
      // narrows safer with an explicit assignment.
      const u8 =
        bytes instanceof Uint8Array
          ? bytes
          : new Uint8Array(bytes as ArrayBufferLike);
      await room.localParticipant.publishData(u8, {
        reliable: opts?.reliable ?? true,
        topic,
        destinationIdentities: opts?.destinationIdentities,
      });
    },
    [room, topic]
  );

  const subscribe = useCallback((handler: DataHandler<T>) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  return { publish, subscribe };
}
