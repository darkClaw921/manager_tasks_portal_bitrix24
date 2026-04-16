'use client';

/* eslint-disable @next/next/no-img-element -- we serve auth-gated, meeting-private URLs via our streaming route and cannot use next/image (which would strip cookies and re-fetch through its optimizer). */

/**
 * In-meeting chat panel.
 *
 * Renders bubbles (text / file / image) from `useMeetingChat`, a load-earlier
 * button when the server still has history, and hosts the `ChatInput` footer.
 *
 * Scroll behaviour:
 *   - On initial load + every arrival we scroll to bottom *if* the user was
 *     already near the bottom (so we don't rip them away from history they're
 *     reading). A tiny 80 px threshold keeps the heuristic forgiving.
 *
 * Lightbox:
 *   - Clicking an image opens a fixed-position modal with a dark backdrop.
 *   - Dismissed by Esc, click-on-backdrop, or the close button.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import type { Room } from 'livekit-client';
import { useMeetingChat } from '@/hooks/useMeetingChat';
import type { MeetingMessage } from '@/types/meeting';
import { cn } from '@/lib/utils';
import { ChatInput } from './ChatInput';
import { CloseIcon, DownloadIcon, FileIcon } from './icons';

/** Default thumbnail clamp — keeps images from blowing out the sidebar. */
const THUMB_MAX_W = 240;
const THUMB_MAX_H = 180;
/** "Near bottom" threshold for auto-scroll. */
const AUTO_SCROLL_THRESHOLD_PX = 80;

export interface ChatPanelProps {
  meetingId: number;
  room: Room | null;
  userId: number;
  /** Notified when a new (non-local) message arrives — used for unread badge. */
  onNewMessage?: (message: MeetingMessage) => void;
  /**
   * True when the panel is actively visible. Used to skip `onNewMessage` calls
   * for arrivals that the user is already looking at.
   */
  isActive?: boolean;
  className?: string;
}

/** Human-friendly byte size. */
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

/** Compute a thumbnail rect preserving aspect from width/height. */
function thumbDimensions(
  width: number | null,
  height: number | null
): { width: number; height: number } {
  if (!width || !height || width <= 0 || height <= 0) {
    return { width: THUMB_MAX_W, height: THUMB_MAX_H };
  }
  const ratio = width / height;
  // Clamp by whichever axis overflows first.
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

// ==================== Lightbox ====================

interface LightboxImage {
  src: string;
  name: string;
}

function Lightbox({
  image,
  onClose,
}: {
  image: LightboxImage;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={image.name}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <button
        type="button"
        aria-label="Закрыть"
        className="absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <CloseIcon className="h-5 w-5" />
      </button>
      {/* Stop click-through so clicking the image doesn't close. */}
      <img
        src={image.src}
        alt={image.name}
        className="max-h-full max-w-full rounded object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

// ==================== Bubble ====================

function Bubble({
  message,
  onOpenImage,
}: {
  message: MeetingMessage;
  onOpenImage: (img: LightboxImage) => void;
}) {
  const fileHref = `/api/meetings/${message.meetingId}/messages/files/${message.id}`;
  const time = formatTime(message.createdAt);

  return (
    <div className="flex gap-2">
      {/* Avatar */}
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
        </div>

        {message.kind === 'text' && (
          <p className="mt-0.5 whitespace-pre-wrap break-words text-body">
            {message.content}
          </p>
        )}

        {message.kind === 'image' && (() => {
          const dims = thumbDimensions(message.width, message.height);
          return (
            <button
              type="button"
              className="mt-1 block overflow-hidden rounded border border-border bg-background hover:opacity-95"
              style={{ width: dims.width, maxWidth: '100%' }}
              onClick={() =>
                onOpenImage({
                  src: fileHref,
                  name: message.fileName ?? 'image',
                })
              }
              aria-label={`Открыть ${message.fileName ?? 'изображение'}`}
            >
              <img
                src={fileHref}
                alt={message.fileName ?? ''}
                width={dims.width}
                height={dims.height}
                loading="lazy"
                className="block h-auto w-full object-cover"
              />
            </button>
          );
        })()}

        {message.kind === 'file' && (
          <a
            href={fileHref}
            download={message.fileName ?? undefined}
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
}

// ==================== Panel ====================

export function ChatPanel({
  meetingId,
  room,
  userId,
  onNewMessage,
  isActive = true,
  className,
}: ChatPanelProps) {
  const chat = useMeetingChat({ meetingId, room, userId });
  const [lightbox, setLightbox] = useState<LightboxImage | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const atBottomRef = useRef<boolean>(true);
  const lastSeenIdRef = useRef<number>(0);

  // Track whether the user is pinned near the bottom.
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    atBottomRef.current = distance < AUTO_SCROLL_THRESHOLD_PX;
  }, []);

  // On new message: auto-scroll if we were already at bottom; fire onNewMessage
  // for any message authored by someone else while the panel is inactive.
  useEffect(() => {
    const msgs = chat.messages;
    if (msgs.length === 0) return;

    const latest = msgs[msgs.length - 1];
    const lastSeen = lastSeenIdRef.current;

    // Notify about every brand-new arrival authored by someone else, while
    // the panel is not the active tab. We iterate forward so `onNewMessage`
    // gets called once per arrival.
    if (onNewMessage) {
      for (const m of msgs) {
        if (m.id <= lastSeen) continue;
        if (m.userId === userId) continue;
        if (!isActive) onNewMessage(m);
      }
    }
    lastSeenIdRef.current = latest.id;

    if (atBottomRef.current) {
      // Defer scroll to after paint so images have a chance to layout.
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
      });
    }
  }, [chat.messages, onNewMessage, userId, isActive]);

  // When the panel becomes active, reset "lastSeen" so we don't re-fire
  // unread badges for messages that are now visible.
  useEffect(() => {
    if (!isActive) return;
    const latest = chat.messages[chat.messages.length - 1];
    if (latest) lastSeenIdRef.current = latest.id;
  }, [isActive, chat.messages]);

  // Load-earlier button handler with scroll preservation.
  const onLoadEarlier = useCallback(async () => {
    const el = scrollRef.current;
    const prevScrollHeight = el?.scrollHeight ?? 0;
    const prevScrollTop = el?.scrollTop ?? 0;
    await chat.loadEarlier();
    // Preserve reading position — after prepending we want the user to stay
    // on the same message, not get thrown to the top.
    requestAnimationFrame(() => {
      const el2 = scrollRef.current;
      if (!el2) return;
      const delta = el2.scrollHeight - prevScrollHeight;
      el2.scrollTop = prevScrollTop + delta;
    });
  }, [chat]);

  const onKey = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    // Space/Enter handled natively by buttons inside.
    if (e.key === 'Escape' && lightbox) setLightbox(null);
  }, [lightbox]);

  const bubbles = useMemo(
    () =>
      chat.messages.map((m) => (
        <Bubble key={m.id} message={m} onOpenImage={setLightbox} />
      )),
    [chat.messages]
  );

  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col rounded-card bg-surface shadow-card',
        className
      )}
      onKeyDown={onKey}
    >
      {/* Scrollable history */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3"
      >
        {chat.hasMore && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={onLoadEarlier}
              disabled={chat.isLoadingMore}
              className="rounded border border-border bg-background px-3 py-1 text-small text-text-secondary hover:bg-surface disabled:opacity-60"
            >
              {chat.isLoadingMore ? 'Загрузка…' : 'Показать раньше'}
            </button>
          </div>
        )}

        {chat.isLoadingInitial ? (
          <div className="flex h-full items-center justify-center text-small text-text-secondary">
            Загрузка сообщений…
          </div>
        ) : chat.messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-small text-text-secondary">
            Сообщений пока нет. Напишите первым.
          </div>
        ) : (
          bubbles
        )}

        {chat.error && (
          <div
            role="alert"
            className="rounded bg-red-100 p-2 text-small text-red-700"
          >
            {chat.error}
          </div>
        )}
      </div>

      {/* Input footer */}
      <div className="border-t border-border">
        <ChatInput
          onSendText={chat.sendText}
          onSendFile={chat.sendFile}
          disabled={!room}
        />
      </div>

      {lightbox && (
        <Lightbox image={lightbox} onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}

export { formatBytes };
