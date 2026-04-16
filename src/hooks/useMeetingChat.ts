'use client';

/**
 * Hook that owns the state of a single meeting's chat.
 *
 * Data flow:
 *   1. On mount we fetch the most recent page from
 *      `GET /api/meetings/[id]/messages` (newest-first) and store it in
 *      chronological order so the UI can simply append new arrivals.
 *   2. We subscribe to the LiveKit data channel under topic `"chat"` via
 *      `useLiveKitData<ChatPayload>`. Every incoming payload is a
 *      `MeetingMessage`; we dedupe on `id` before appending.
 *   3. `sendText` POSTs to the messages endpoint, optimistically appends the
 *      returned row (the POST response is hydrated by the service layer),
 *      then broadcasts it over the data channel. Broadcasting our own row is
 *      what lets other participants see it in real time — the SFU echoes
 *      messages back to the sender but our dedupe handles that.
 *   4. `sendFile` does the same against the `/upload` endpoint with progress
 *      reporting via `XMLHttpRequest` (fetch has no upload-progress API).
 *   5. `loadEarlier` advances a `before` cursor to page into history.
 *
 * We deliberately avoid React Query here: the chat state is a naturally
 * push-driven stream where the source of truth is a mix of REST (historic
 * pages) and WS (live broadcasts). A plain `useState<Map>` gives us
 * deterministic ordering and cheap dedupe without cache-invalidation dances.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Room } from 'livekit-client';
import { useLiveKitData } from './useLiveKitData';
import type { ChatPayload, MeetingMessage } from '@/types/meeting';

const CHAT_TOPIC = 'chat';
/** Initial + subsequent page size when paging through history. */
const PAGE_SIZE = 50;

export interface UseMeetingChatOptions {
  meetingId: number;
  /** Same LiveKit room instance the rest of MeetingRoom uses. */
  room: Room | null;
  /** App user id of the local participant (used to filter self-echoes). */
  userId: number;
}

export interface UploadProgress {
  /** Uploaded bytes so far. */
  loaded: number;
  /** Total bytes if known, else null. */
  total: number | null;
  /** 0..1 fraction; null when total is unknown. */
  fraction: number | null;
}

export interface UseMeetingChatResult {
  /** Messages in chronological order (oldest first). */
  messages: MeetingMessage[];
  /** True during the initial fetch. */
  isLoadingInitial: boolean;
  /** True while `loadEarlier` is in flight. */
  isLoadingMore: boolean;
  /** False once the server returned a non-full page. */
  hasMore: boolean;
  /** Last fatal error from any operation (cleared by the next success). */
  error: string | null;
  /** Fetch an older page. No-op when `!hasMore` or a load is already running. */
  loadEarlier: () => Promise<void>;
  /** Send a text message. Returns the created row. Throws on validation/API errors. */
  sendText: (content: string) => Promise<MeetingMessage>;
  /** Upload a file. Returns the created row. Calls `onProgress` as bytes are sent. */
  sendFile: (
    file: File,
    onProgress?: (progress: UploadProgress) => void
  ) => Promise<MeetingMessage>;
}

/** Merge incoming messages into an existing chronological list without duplicates. */
function mergeUnique(
  existing: MeetingMessage[],
  incoming: MeetingMessage[]
): MeetingMessage[] {
  if (incoming.length === 0) return existing;
  const byId = new Map<number, MeetingMessage>();
  for (const m of existing) byId.set(m.id, m);
  for (const m of incoming) byId.set(m.id, m);
  const merged = Array.from(byId.values());
  merged.sort((a, b) => {
    // Primary: createdAt (ISO string lex-sorts chronologically for UTC `Z`).
    if (a.createdAt === b.createdAt) return a.id - b.id;
    return a.createdAt < b.createdAt ? -1 : 1;
  });
  return merged;
}

export function useMeetingChat({
  meetingId,
  room,
  userId,
}: UseMeetingChatOptions): UseMeetingChatResult {
  const [messages, setMessages] = useState<MeetingMessage[]>([]);
  const [isLoadingInitial, setLoadingInitial] = useState<boolean>(true);
  const [isLoadingMore, setLoadingMore] = useState<boolean>(false);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  /** Cursor for the next page load. Null = no more history available. */
  const nextBeforeRef = useRef<string | null>(null);
  /** Set of known message ids to short-circuit dedupe in the hot path. */
  const seenIdsRef = useRef<Set<number>>(new Set());
  /** Latest meetingId — lets async fetches detect stale scopes. */
  const scopeRef = useRef<number>(meetingId);

  const data = useLiveKitData<ChatPayload>(room, CHAT_TOPIC);
  const localIdentity = useMemo(() => String(userId), [userId]);

  // Keep scopeRef in sync on meetingId change + reset state.
  useEffect(() => {
    scopeRef.current = meetingId;
    setMessages([]);
    seenIdsRef.current.clear();
    nextBeforeRef.current = null;
    setHasMore(false);
    setError(null);
    setLoadingInitial(true);
  }, [meetingId]);

  // Initial page load.
  useEffect(() => {
    const scope = meetingId;
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(
          `/api/meetings/${scope}/messages?limit=${PAGE_SIZE}`,
          { credentials: 'include' }
        );
        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          throw new Error(
            `GET messages failed: ${resp.status} ${resp.statusText} ${text}`
          );
        }
        const body = (await resp.json()) as {
          items: MeetingMessage[];
          nextBefore: string | null;
        };
        if (cancelled || scopeRef.current !== scope) return;
        const chronological = [...body.items].reverse();
        setMessages(chronological);
        seenIdsRef.current = new Set(chronological.map((m) => m.id));
        nextBeforeRef.current = body.nextBefore;
        setHasMore(body.nextBefore !== null);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        console.error('[useMeetingChat] initial load failed:', err);
        setError(err instanceof Error ? err.message : 'Failed to load messages');
      } finally {
        if (!cancelled && scopeRef.current === scope) {
          setLoadingInitial(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [meetingId]);

  // Subscribe to LiveKit "chat" broadcasts.
  useEffect(() => {
    const unsubscribe = data.subscribe((payload, participant) => {
      // Drop malformed payloads.
      if (
        !payload ||
        typeof payload !== 'object' ||
        typeof (payload as MeetingMessage).id !== 'number' ||
        typeof (payload as MeetingMessage).meetingId !== 'number'
      ) {
        return;
      }
      if (payload.meetingId !== scopeRef.current) return;

      // Ignore echoes of our own broadcast — we already inserted the row
      // optimistically when the POST returned.
      if (participant?.identity === localIdentity) {
        if (seenIdsRef.current.has(payload.id)) return;
      }
      if (seenIdsRef.current.has(payload.id)) return;
      seenIdsRef.current.add(payload.id);
      setMessages((prev) => mergeUnique(prev, [payload]));
    });
    return unsubscribe;
  }, [data, localIdentity]);

  const loadEarlier = useCallback(async () => {
    if (isLoadingMore) return;
    const cursor = nextBeforeRef.current;
    if (cursor === null) return;

    const scope = scopeRef.current;
    setLoadingMore(true);
    try {
      const url = `/api/meetings/${scope}/messages?limit=${PAGE_SIZE}&before=${encodeURIComponent(
        cursor
      )}`;
      const resp = await fetch(url, { credentials: 'include' });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(
          `GET messages (earlier) failed: ${resp.status} ${resp.statusText} ${text}`
        );
      }
      const body = (await resp.json()) as {
        items: MeetingMessage[];
        nextBefore: string | null;
      };
      if (scopeRef.current !== scope) return;

      const chronological = [...body.items].reverse();
      const toAdd: MeetingMessage[] = [];
      for (const m of chronological) {
        if (!seenIdsRef.current.has(m.id)) {
          seenIdsRef.current.add(m.id);
          toAdd.push(m);
        }
      }
      setMessages((prev) => mergeUnique(prev, toAdd));
      nextBeforeRef.current = body.nextBefore;
      setHasMore(body.nextBefore !== null);
      setError(null);
    } catch (err) {
      console.error('[useMeetingChat] loadEarlier failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to load earlier');
    } finally {
      setLoadingMore(false);
    }
  }, [isLoadingMore]);

  /**
   * Insert the returned MeetingMessage into state and broadcast it. Callers
   * use this after POST returns so the sender immediately sees the bubble.
   */
  const applyAndBroadcast = useCallback(
    async (msg: MeetingMessage) => {
      if (seenIdsRef.current.has(msg.id)) return;
      seenIdsRef.current.add(msg.id);
      setMessages((prev) => mergeUnique(prev, [msg]));
      try {
        await data.publish(msg);
      } catch (err) {
        // Non-fatal — the sender already has the message locally, and the
        // server saw it; only live fan-out to other participants failed.
        console.warn('[useMeetingChat] broadcast failed:', err);
      }
    },
    [data]
  );

  const sendText = useCallback<UseMeetingChatResult['sendText']>(
    async (content) => {
      const trimmed = content.trim();
      if (!trimmed) {
        throw new Error('Message is empty');
      }
      const resp = await fetch(`/api/meetings/${scopeRef.current}/messages`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: trimmed }),
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(
          `POST message failed: ${resp.status} ${resp.statusText} ${text}`
        );
      }
      const body = (await resp.json()) as { data: MeetingMessage };
      await applyAndBroadcast(body.data);
      return body.data;
    },
    [applyAndBroadcast]
  );

  const sendFile = useCallback<UseMeetingChatResult['sendFile']>(
    async (file, onProgress) => {
      const scope = scopeRef.current;
      const form = new FormData();
      form.append('file', file, file.name);

      // Use XHR for upload progress. `fetch` in browsers doesn't expose
      // upload.onprogress today.
      const data = await new Promise<MeetingMessage>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `/api/meetings/${scope}/messages/upload`, true);
        xhr.withCredentials = true;
        xhr.responseType = 'json';
        xhr.upload.onprogress = (evt) => {
          if (!onProgress) return;
          if (evt.lengthComputable) {
            onProgress({
              loaded: evt.loaded,
              total: evt.total,
              fraction: evt.total > 0 ? evt.loaded / evt.total : null,
            });
          } else {
            onProgress({ loaded: evt.loaded, total: null, fraction: null });
          }
        };
        xhr.onerror = () => reject(new Error('Network error uploading file'));
        xhr.onabort = () => reject(new Error('Upload aborted'));
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const body = xhr.response as { data?: MeetingMessage } | null;
            if (body?.data) {
              resolve(body.data);
            } else {
              reject(new Error('Malformed upload response'));
            }
          } else {
            const msg =
              (xhr.response as { message?: string } | null)?.message ??
              `${xhr.status} ${xhr.statusText}`;
            reject(new Error(`Upload failed: ${msg}`));
          }
        };
        xhr.send(form);
      });

      await applyAndBroadcast(data);
      return data;
    },
    [applyAndBroadcast]
  );

  return {
    messages,
    isLoadingInitial,
    isLoadingMore,
    hasMore,
    error,
    loadEarlier,
    sendText,
    sendFile,
  };
}
