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

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMeetingRecordings } from '@/hooks/useMeeting';
import type {
  RecordingsManifest,
  ManifestAudioTrack,
} from '@/lib/meetings/recordings';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { DownloadIcon } from './icons';

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
}: {
  meetingId: number;
  manifest: RecordingsManifest;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [activeTrackIdx, setActiveTrackIdx] = useState<number | null>(null);
  const [audioTracksApiAvailable, setAudioTracksApiAvailable] = useState(false);

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
        ref={videoRef}
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
        <PlayerPrimary meetingId={meetingId} manifest={manifest} />
      )}
    </div>
  );
}
