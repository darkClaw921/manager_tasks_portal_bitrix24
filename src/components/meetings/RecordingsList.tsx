'use client';

/**
 * Recordings panel for a meeting.
 *
 * Loads `RecordingsManifest` via `useMeetingRecordings(meetingId)`. Renders:
 *   - A primary <video> element that streams the final MKV (or, while
 *     post-mux is still running, the mixed MP4 preview).
 *   - An audio-track selector. In Chromium browsers we drive
 *     `videoEl.audioTracks[]` directly so the user can switch which speaker
 *     they hear inside the same MKV. Other browsers (Safari, Firefox) don't
 *     ship the HTMLMediaElement.audioTracks API for our use, so we fall back
 *     to rendering N <audio> elements pointed at the per-user OGG egress.
 *   - A download button for the final MKV.
 *
 * The manifest is polled on a 3s interval while `status === 'processing'`;
 * see `useMeetingRecordings`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { useMeetingDetail, useMeetingRecordings } from '@/hooks/useMeeting';
import type {
  RecordingsManifest,
  ManifestAudioTrack,
} from '@/lib/meetings/recordings';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { DownloadIcon } from './icons';
import { RecordingChatTimeline } from './RecordingChatTimeline';

export interface RecordingsListProps {
  meetingId: number;
  className?: string;
}

/**
 * Subset of the WHATWG `AudioTrackList` we use. Defining it locally so we
 * don't depend on the (incomplete in some lib.dom versions) global type.
 */
interface VideoAudioTrack {
  id: string;
  label: string;
  language: string;
  enabled: boolean;
}
interface VideoAudioTrackList {
  length: number;
  [index: number]: VideoAudioTrack;
}
interface VideoElementWithAudioTracks extends HTMLVideoElement {
  audioTracks?: VideoAudioTrackList;
}

/** True if this browser exposes per-stream audioTracks on <video>. */
function hasAudioTracksApi(el: HTMLVideoElement | null): el is VideoElementWithAudioTracks {
  return !!el && 'audioTracks' in el && (el as VideoElementWithAudioTracks).audioTracks != null;
}

function buildStreamUrl(meetingId: number, recordingId: number): string {
  return `/api/meetings/${meetingId}/recordings/${recordingId}`;
}

function PlayerPrimary({
  meetingId,
  manifest,
  videoRef: externalVideoRef,
}: {
  meetingId: number;
  manifest: RecordingsManifest;
  /**
   * Optional external ref — when supplied we forward our inner `<video>`
   * element to it so the parent can drive playback (e.g., seek the current
   * time in response to a chat-message click). We still keep our own ref
   * for the `audioTracks` side-effects.
   */
  videoRef?: MutableRefObject<HTMLVideoElement | null>;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [activeTrackIdx, setActiveTrackIdx] = useState<number | null>(null);
  const [audioTracksApiAvailable, setAudioTracksApiAvailable] = useState(false);

  /**
   * Callback ref that fans the `<video>` element out to both our internal
   * ref (used by audio-track effects below) and the optional external ref
   * forwarded from `RecordingsList`.
   */
  const setVideoEl = useCallback(
    (el: HTMLVideoElement | null) => {
      videoRef.current = el;
      if (externalVideoRef) externalVideoRef.current = el;
    },
    [externalVideoRef]
  );

  // Choose the primary playback file: prefer the mixed MP4 (H.264/AAC,
  // faststart remux) so the <video> element works natively in Safari / iOS /
  // Chrome / Firefox. The final MKV is reserved for the "Скачать" button
  // because no major browser plays Matroska natively.
  const primary = manifest.roomComposite ?? manifest.finalMkv;
  const primarySrc = primary
    ? buildStreamUrl(meetingId, primary.recordingId)
    : null;
  const mkvDownloadSrc = manifest.finalMkv
    ? buildStreamUrl(meetingId, manifest.finalMkv.recordingId)
    : null;

  // Detect audioTracks API after metadata loads.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !primarySrc) return;
    const onLoaded = () => {
      if (hasAudioTracksApi(el) && el.audioTracks && el.audioTracks.length > 0) {
        setAudioTracksApiAvailable(true);
        setActiveTrackIdx(0);
      } else {
        setAudioTracksApiAvailable(false);
      }
    };
    el.addEventListener('loadedmetadata', onLoaded);
    return () => el.removeEventListener('loadedmetadata', onLoaded);
  }, [primarySrc]);

  // Apply the selected audio track when the user changes it.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !audioTracksApiAvailable || activeTrackIdx == null) return;
    if (!hasAudioTracksApi(el) || !el.audioTracks) return;
    for (let i = 0; i < el.audioTracks.length; i += 1) {
      el.audioTracks[i].enabled = i === activeTrackIdx;
    }
  }, [activeTrackIdx, audioTracksApiAvailable]);

  if (!primarySrc) {
    return (
      <div className="rounded-card bg-surface p-4 text-text-secondary">
        Запись ещё недоступна.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <video
        ref={setVideoEl}
        src={primarySrc}
        controls
        playsInline
        className="w-full rounded-card bg-black"
      />

      {audioTracksApiAvailable ? (
        <AudioTrackSelector
          tracks={manifest.perUserAudio}
          activeIndex={activeTrackIdx}
          onChange={setActiveTrackIdx}
        />
      ) : manifest.perUserAudio.length > 0 ? (
        <PerUserAudioFallback
          meetingId={meetingId}
          tracks={manifest.perUserAudio}
        />
      ) : null}

      <div className="flex flex-wrap gap-4">
        {primarySrc && (
          <a
            href={primarySrc}
            download
            className="inline-flex items-center gap-2 text-body text-primary hover:underline"
          >
            <DownloadIcon className="h-4 w-4" />
            Скачать MP4
          </a>
        )}
        {mkvDownloadSrc && (
          <a
            href={mkvDownloadSrc}
            download
            className="inline-flex items-center gap-2 text-body text-primary hover:underline"
          >
            <DownloadIcon className="h-4 w-4" />
            Скачать MKV (мультидорожка)
          </a>
        )}
      </div>
    </div>
  );
}

function AudioTrackSelector({
  tracks,
  activeIndex,
  onChange,
}: {
  tracks: ManifestAudioTrack[];
  activeIndex: number | null;
  onChange: (idx: number) => void;
}) {
  if (tracks.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-small text-text-secondary">Аудиодорожка:</span>
      <select
        value={activeIndex ?? 0}
        onChange={(e) => onChange(Number.parseInt(e.target.value, 10))}
        className="rounded border border-border bg-surface px-2 py-1 text-body"
      >
        {tracks.map((t, idx) => (
          <option key={t.recordingId} value={idx}>
            {t.userName ?? `Спикер ${idx + 1}`}
          </option>
        ))}
      </select>
    </div>
  );
}

function PerUserAudioFallback({
  meetingId,
  tracks,
}: {
  meetingId: number;
  tracks: ManifestAudioTrack[];
}) {
  return (
    <div className="rounded-card border border-border bg-background p-3">
      <div className="mb-2 text-small text-text-secondary">
        Браузер не поддерживает выбор аудиодорожек на видеоэлементе. Доступны
        отдельные дорожки по участникам:
      </div>
      <ul className="flex flex-col gap-2">
        {tracks.map((t, idx) => (
          <li key={t.recordingId} className="flex flex-col gap-1">
            <span className="text-body">
              {t.userName ?? `Спикер ${idx + 1}`}
            </span>
            <audio
              controls
              preload="none"
              src={buildStreamUrl(meetingId, t.recordingId)}
              className="w-full"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RecordingsList({ meetingId, className }: RecordingsListProps) {
  const { data: manifest, isLoading, isError, error } = useMeetingRecordings(meetingId);
  // Meeting detail powers the "seek to message time" feature inside the chat
  // timeline — we need `meeting.startedAt` to compute offsets. The detail
  // endpoint enforces the same `canJoinMeeting` check as the recordings one,
  // so it's safe to always request here.
  const { data: meetingDetail } = useMeetingDetail(meetingId);

  // Shared ref — the video element lives inside `PlayerPrimary`, but clicks on
  // chat bubbles in `RecordingChatTimeline` need to update `currentTime` on the
  // same element. `PlayerPrimary` forwards the element to this ref via a
  // callback-ref indirection; if the video hasn't mounted yet (processing /
  // empty state) the ref stays null and seek clicks silently no-op.
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const handleSeekTo = useCallback((offsetSec: number) => {
    const el = videoRef.current;
    if (!el) return;
    // Guard: once `duration` is known (i.e., after loadedmetadata) clamp so
    // we never seek past the end — Safari otherwise snaps to 0 silently.
    if (Number.isFinite(el.duration) && el.duration > 0) {
      el.currentTime = Math.min(offsetSec, Math.max(0, el.duration - 0.1));
    } else {
      el.currentTime = Math.max(0, offsetSec);
    }
    // Nice-to-have: start playing if paused so the user lands on audio.
    if (el.paused) {
      el.play().catch(() => {
        /* Autoplay policies may reject; ignore. */
      });
    }
  }, []);

  const status = manifest?.status;
  const heading = useMemo(() => {
    if (isLoading) return 'Загрузка…';
    if (isError) return 'Ошибка загрузки записей';
    if (status === 'empty') return 'Записей нет';
    if (status === 'processing') return 'Обработка записи…';
    return 'Записи встречи';
  }, [isLoading, isError, status]);

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-center justify-between">
        <h2 className="text-h2 font-semibold">{heading}</h2>
      </div>

      {isError && (
        <div className="rounded-card border border-danger bg-red-50 p-3 text-body text-danger">
          {error instanceof Error ? error.message : 'Не удалось загрузить записи'}
          <div className="mt-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => window.location.reload()}
            >
              Перезагрузить
            </Button>
          </div>
        </div>
      )}

      {manifest && status === 'empty' && (
        <div className="rounded-card bg-surface p-4 text-text-secondary">
          Для этой встречи запись не велась.
        </div>
      )}

      {manifest && status === 'processing' && (
        <div className="rounded-card bg-surface p-4 text-text-secondary">
          Видео и аудио ещё обрабатываются. Эта страница автоматически обновится.
        </div>
      )}

      {manifest && status === 'ready' && (
        /* Responsive two-column layout: on desktop (lg+) video takes the
         * flexible column and the chat timeline a fixed ~320px rail; on
         * mobile they stack vertically. The timeline column is capped to
         * `max-h-[520px]` on mobile so the page doesn't grow unbounded. */
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0">
            <PlayerPrimary
              meetingId={meetingId}
              manifest={manifest}
              videoRef={videoRef}
            />
          </div>
          <div className="h-[520px] lg:h-auto lg:min-h-[360px]">
            <RecordingChatTimeline
              meetingId={meetingId}
              meeting={meetingDetail ?? null}
              onMessageClick={handleSeekTo}
              className="h-full"
            />
          </div>
        </div>
      )}
    </div>
  );
}
