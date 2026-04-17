'use client';

/* eslint-disable @next/next/no-img-element -- meeting chat files are served via auth-gated streaming routes; next/image strips cookies and would 403 on the thumbnail request. */

/**
 * Read-only chat timeline for the meeting recording page.
 *
 * Purpose
 * -------
 * On `/meetings/[id]/recordings` the user replays a finished meeting. We want
 * them to see the chat history next to the video — text bubbles, file links,
 * image thumbnails — and, when the parent player exposes a seek callback, to
 * click a message to jump the video to the moment it was sent.
 *
 * Why a dedicated component (not `ChatPanel`)
 * --------------------------------------------
 * `ChatPanel` depends on `useMeetingChat`, which needs a live LiveKit `Room`
 * (for the bidirectional data-channel subscription and `sendText`/`sendFile`).
 * After the meeting ends there is no LiveKit room, so we fetch directly from
 * `GET /api/meetings/:id/messages` — the same endpoint `useMeetingChat` uses
 * for its initial history page — and render a read-only list.
 *
 * Seek-to-timestamp
 * -----------------
 * If the caller passes `onMessageClick` and `meeting.startedAt` is known, each
 * bubble becomes a button that reports `(message.createdAt - meeting.startedAt)
 * / 1000` as an offset in seconds. When `meeting.startedAt` is missing we keep
 * the bubbles as plain divs so the UI doesn't lie about being clickable.
 *
 * Paging
 * ------
 * Recording chats are typically short (dozens of messages) and the page-size
 * cap is 50. To keep the timeline simple we auto-load earlier pages on mount
 * until `nextBefore` is null, so the whole timeline is visible in chronological
 * order with no "load more" button. For meetings with thousands of messages
 * this is still fine — we bail out after MAX_PAGES safety limit.
 */

import { useEffect, useMemo, useState } from 'react';
import type { Meeting, MeetingMessage } from '@/types/meeting';
import { cn } from '@/lib/utils';
import { DownloadIcon, FileIcon } from './icons';

/** Default thumbnail clamp — mirrors `ChatPanel` so images look the same here. */
const THUMB_MAX_W = 240;
const THUMB_MAX_H = 180;
/** Page size must match `useMeetingChat`. The API caps this at 50. */
const PAGE_SIZE = 50;
/** Safety limit on auto-paging. 20 pages × 50 = 1000 messages. */
const MAX_PAGES = 20;

export interface RecordingChatTimelineProps {
  meetingId: number;
  /**
   * Optional. When supplied we use `meeting.startedAt` to compute the
   * `offsetSec` passed to `onMessageClick`. Without it clicks are disabled.
   */
  meeting?: Meeting | null;
  /**
   * Optional. When provided AND `meeting.startedAt` is set, each message
   * bubble becomes a button that calls this with the delta (in seconds)
   * between the message timestamp and the meeting start. Negative deltas
   * (messages posted before the recording started) are clamped to 0.
   */
  onMessageClick?: (offsetSec: number) => void;
  className?: string;
}

/** Human-readable byte size. Duplicated from `ChatPanel` to avoid coupling. */
function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const idx = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024))
  );
  const value = bytes / Math.pow(1024, idx);
  return `${value.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

/** `2026-04-17T12:34:00.000Z` → `12:34`. Empty string when parse fails. */
function formatTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** `01:23:45` / `12:34` formatting for seek offsets. */
function formatOffset(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (hh > 0) return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
  return `${pad(mm)}:${pad(ss)}`;
}

/** Compute a thumbnail rect preserving aspect from width/height. */
function thumbDimensions(
  width: number | null,
  height: number | null
): { width: number; height: number } {
  if (!width || !height || width <= 0 || height <= 0) {
    return { width: THUMB_MAX_W, height: THUMB_MAX_H };
  }
  const ratio = width / height;
  let w = width;
  let h = height;
  if (w > THUMB_MAX_W) {
    w = THUMB_MAX_W;
    h = w / ratio;
  }
  if (h > THUMB_MAX_H) {
    h = THUMB_MAX_H;
    w = h * ratio;
  }
  return { width: Math.round(w), height: Math.round(h) };
}

/**
 * Compute offset between a message's `createdAt` and the meeting's start, in
 * seconds. Returns null when either value is missing or unparsable, so the
 * caller can decide whether to render a clickable bubble.
 */
function computeOffsetSec(
  messageCreatedAt: string,
  meetingStartedAt: string | null | undefined
): number | null {
  if (!meetingStartedAt) return null;
  const msg = new Date(messageCreatedAt).getTime();
  const start = new Date(meetingStartedAt).getTime();
  if (!Number.isFinite(msg) || !Number.isFinite(start)) return null;
  return Math.max(0, (msg - start) / 1000);
}

// ==================== Bubble ====================

function Bubble({
  message,
  offsetSec,
  onClick,
}: {
  message: MeetingMessage;
  offsetSec: number | null;
  onClick?: (offsetSec: number) => void;
}) {
  const fileHref = `/api/meetings/${message.meetingId}/messages/files/${message.id}`;
  const time = formatTime(message.createdAt);
  const clickable = onClick != null && offsetSec != null;

  const body = (
    <div className="flex gap-2">
      <div
        className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-small font-semibold text-primary"
        aria-hidden
      >
        {message.user.name.charAt(0).toUpperCase() || '—'}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-small font-semibold">
            {message.user.name}
          </span>
          <time
            className="text-[11px] text-text-secondary"
            dateTime={message.createdAt}
          >
            {time}
          </time>
          {clickable && offsetSec != null && (
            <span
              className="ml-auto rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-primary"
              aria-label={`Перемотать на ${formatOffset(offsetSec)}`}
            >
              {formatOffset(offsetSec)}
            </span>
          )}
        </div>

        {message.kind === 'text' && (
          <p className="mt-0.5 whitespace-pre-wrap break-words text-body">
            {message.content}
          </p>
        )}

        {message.kind === 'image' && (() => {
          const dims = thumbDimensions(message.width, message.height);
          return (
            <div
              className="mt-1 overflow-hidden rounded border border-border bg-background"
              style={{ width: dims.width, maxWidth: '100%' }}
            >
              <img
                src={fileHref}
                alt={message.fileName ?? ''}
                width={dims.width}
                height={dims.height}
                loading="lazy"
                className="block h-auto w-full object-cover"
              />
            </div>
          );
        })()}

        {message.kind === 'file' && (
          <a
            href={fileHref}
            download={message.fileName ?? undefined}
            onClick={(e) => e.stopPropagation()}
            className="mt-1 flex items-center gap-2 rounded border border-border bg-background p-2 text-small hover:bg-surface"
          >
            <FileIcon className="h-5 w-5 flex-shrink-0 text-text-secondary" />
            <div className="min-w-0 flex-1">
              <div className="truncate">{message.fileName ?? 'file'}</div>
              <div className="text-[11px] text-text-secondary">
                {formatBytes(message.fileSize)}
              </div>
            </div>
            <DownloadIcon className="h-4 w-4 flex-shrink-0 text-text-secondary" />
          </a>
        )}
      </div>
    </div>
  );

  if (clickable) {
    return (
      <button
        type="button"
        onClick={() => onClick!(offsetSec!)}
        className="block w-full cursor-pointer rounded-card px-2 py-2 text-left transition-colors hover:bg-background focus:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        title="Перемотать видео к этому сообщению"
      >
        {body}
      </button>
    );
  }

  return <div className="px-2 py-2">{body}</div>;
}

// ==================== Timeline ====================

export function RecordingChatTimeline({
  meetingId,
  meeting,
  onMessageClick,
  className,
}: RecordingChatTimelineProps) {
  const [messages, setMessages] = useState<MeetingMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Load the full chat history on mount / meetingId change. We page backwards
  // via the `before` cursor until the server signals no more pages.
  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      setIsLoading(true);
      setError(null);
      const collected: MeetingMessage[] = [];
      let before: string | null = null;
      let pagesLoaded = 0;

      try {
        for (;;) {
          const url: string = before
            ? `/api/meetings/${meetingId}/messages?limit=${PAGE_SIZE}&before=${encodeURIComponent(before)}`
            : `/api/meetings/${meetingId}/messages?limit=${PAGE_SIZE}`;
          const resp = await fetch(url, { credentials: 'include' });
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
          if (cancelled) return;
          // Server returns newest-first; keep appending, we sort at the end.
          collected.push(...body.items);
          pagesLoaded += 1;
          if (body.nextBefore == null || pagesLoaded >= MAX_PAGES) break;
          before = body.nextBefore;
        }

        if (cancelled) return;
        // Sort ascending by createdAt, then by id as a stable tiebreaker.
        collected.sort((a, b) => {
          if (a.createdAt === b.createdAt) return a.id - b.id;
          return a.createdAt < b.createdAt ? -1 : 1;
        });
        // Dedupe (possible boundary overlap between pages).
        const seen = new Set<number>();
        const deduped: MeetingMessage[] = [];
        for (const m of collected) {
          if (seen.has(m.id)) continue;
          seen.add(m.id);
          deduped.push(m);
        }
        setMessages(deduped);
      } catch (err) {
        if (cancelled) return;
        console.error('[RecordingChatTimeline] load failed:', err);
        setError(err instanceof Error ? err.message : 'Не удалось загрузить чат');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadAll();
    return () => {
      cancelled = true;
    };
  }, [meetingId]);

  const startedAt = meeting?.startedAt ?? null;

  const bubbles = useMemo(
    () =>
      messages.map((m) => {
        const offsetSec = computeOffsetSec(m.createdAt, startedAt);
        return (
          <Bubble
            key={m.id}
            message={m}
            offsetSec={offsetSec}
            onClick={onMessageClick}
          />
        );
      }),
    [messages, startedAt, onMessageClick]
  );

  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col rounded-card bg-surface shadow-card',
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h3 className="text-small font-semibold text-foreground">Чат встречи</h3>
        <span className="text-[11px] text-text-secondary">
          {isLoading
            ? ''
            : messages.length > 0
              ? `${messages.length} сообщ.`
              : ''}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-small text-text-secondary">
            Загрузка сообщений…
          </div>
        ) : error ? (
          <div
            role="alert"
            className="rounded bg-red-100 p-2 text-small text-red-700"
          >
            {error}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-small text-text-secondary">
            Нет сообщений
          </div>
        ) : (
          bubbles
        )}
      </div>
    </div>
  );
}

export default RecordingChatTimeline;
