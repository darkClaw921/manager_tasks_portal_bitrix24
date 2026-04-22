'use client';

/**
 * Fullscreen viewer for a screen-share track.
 *
 * Responsibilities:
 *  - Attach the incoming screen-share VideoTrack to a <video> element using
 *    `track.attach(videoEl)`. Detach on unmount / track swap.
 *  - Reserve a sibling container (the "overlay slot") that the drawing layer
 *    will mount into during Phase 7. We expose its ref via the
 *    `overlayContainerRef` callback so the parent can wire the DrawingOverlay
 *    component without another query.
 *  - Keep `object-fit: contain` on the video and have the overlay container
 *    cover the exact same rect so normalized stroke coordinates ([0..1] of
 *    the source video) map 1:1 onto the receiver's canvas regardless of
 *    viewport size.
 *
 *  Note: the actual DrawingOverlay is NOT rendered here — Phase 7 will
 *  accept the `overlayContainerRef` and mount into that slot.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type VideoTrack,
  type Participant,
  type Room,
} from 'livekit-client';
import { cn } from '@/lib/utils';
import { DrawingOverlay } from './DrawingOverlay';
import { DrawingToolbar } from './DrawingToolbar';
import { FullscreenEnterIcon, FullscreenExitIcon, PencilIcon } from './icons';

const requestFs = (el: HTMLElement) => {
  const e = el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
  return e.requestFullscreen?.() ?? e.webkitRequestFullscreen?.();
};

const exitFs = () => {
  const d = document as Document & { webkitExitFullscreen?: () => Promise<void> };
  return d.exitFullscreen?.() ?? d.webkitExitFullscreen?.();
};

const getFsElement = () => {
  const d = document as Document & { webkitFullscreenElement?: Element | null };
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null;
};

export interface ScreenShareViewProps {
  /** The screen-share video track. Required — caller only mounts this when a track exists. */
  track: VideoTrack;
  /** The participant sharing their screen, for the presenter label. */
  participant: Participant;
  /**
   * Callback giving the parent access to the overlay slot element. Kept for
   * backward compatibility — Phase 7 mounts DrawingOverlay internally so most
   * callers can drop this prop.
   */
  overlayContainerRef?: (el: HTMLDivElement | null) => void;
  /**
   * LiveKit room — required to enable the drawing data channel. When omitted,
   * the overlay falls back to read-only rendering of received strokes (which
   * is also what we want for non-meeting previews / replays).
   */
  room?: Room | null;
  /**
   * App user id of the local participant. Required to publish strokes.
   * Without it the overlay still renders received strokes but does not
   * accept pointer input.
   */
  userId?: number;
  className?: string;
}

export function ScreenShareView({
  track,
  participant,
  overlayContainerRef,
  room,
  userId,
  className,
}: ScreenShareViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // We need to trigger a re-render once the <video> element mounts so the
  // DrawingOverlay receives a non-null `videoElement` prop and can size
  // itself. A ref alone wouldn't notify us of the assignment.
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  // Drawing input is opt-in via the toolbar — defaults to off so right-click
  // on the shared screen still works for the receiver.
  const [drawingEnabled, setDrawingEnabled] = useState(false);
  // Toolbar panel is hidden by default; toggled via the pencil button.
  const [showToolbar, setShowToolbar] = useState(false);

  const toggleToolbar = useCallback(() => {
    setShowToolbar((v) => {
      if (v) setDrawingEnabled(false); // disable drawing when hiding toolbar
      return !v;
    });
  }, []);

  // Combined ref so we keep the existing internal `videoRef` for track.attach
  // while also driving state updates for the overlay.
  const setVideoRef = (el: HTMLVideoElement | null) => {
    videoRef.current = el;
    setVideoEl(el);
  };

  // Whether drawing UI is available at all. We need both a room (data channel
  // capable) and a userId (to stamp strokes / filter own echoes).
  const drawingAvailable = Boolean(room) && typeof userId === 'number';

  // Attach/detach the screen-share track to our <video>.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !track) return;

    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);

  // Forward the overlay container ref to the parent so Phase 7's DrawingOverlay
  // can mount into it. We use a callback ref rather than exposing `overlayRef`
  // directly because the parent may pass a function that forwards into its
  // own state (e.g. a Zustand action).
  useEffect(() => {
    if (!overlayContainerRef) return;
    overlayContainerRef(overlayRef.current);
    return () => {
      overlayContainerRef(null);
    };
  }, [overlayContainerRef]);

  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    const active = getFsElement();
    try {
      if (!active) {
        if (!el) return;
        await requestFs(el);
      } else {
        await exitFs();
      }
    } catch (err) {
      console.warn('[ScreenShareView] fullscreen toggle failed:', err);
    }
  }, []);

  useEffect(() => {
    const onChange = () => {
      setIsFullscreen(getFsElement() === containerRef.current);
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  // Double-click on the video goes fullscreen.
  const handleVideoDoubleClick = useCallback(() => {
    void toggleFullscreen();
  }, [toggleFullscreen]);

  // Keyboard: F key toggles fullscreen while the container is focused.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') {
        if (document.activeElement === containerRef.current || getFsElement() === containerRef.current) {
          e.preventDefault();
          void toggleFullscreen();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [toggleFullscreen]);

  const presenterName = participant.name ?? participant.identity;

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      className={cn(
        'group relative flex h-full w-full items-center justify-center overflow-hidden rounded-card bg-black text-white outline-none',
        isFullscreen && 'rounded-none',
        className
      )}
      data-meeting-surface="screen-share"
    >
      <video
        ref={setVideoRef}
        autoPlay
        playsInline
        muted
        onDoubleClick={handleVideoDoubleClick}
        title="Двойной клик — полный экран"
        className="h-full w-full object-contain"
      />

      {/*
        Overlay slot. Positioned absolutely to fill the same rect as the
        <video>. Pointer-events: none by default so the underlying video is
        not blocked when no drawing is active; DrawingOverlay flips this back
        on while drawing is active.
      */}
      <div
        ref={overlayRef}
        data-meeting-surface="screen-share-overlay"
        className="pointer-events-none absolute inset-0"
      >
        {/* Drawing canvas — renders all received strokes; accepts pointer
            input only while `drawingEnabled` is true and we have a room. */}
        <DrawingOverlay
          videoElement={videoEl}
          room={room ?? null}
          userId={typeof userId === 'number' ? userId : 0}
          enabled={drawingAvailable && drawingEnabled}
        />
      </div>

      {/* Presenter badge. */}
      <div className="absolute left-3 top-3 rounded bg-black/60 px-2 py-1 text-small">
        Демонстрация: {presenterName}
      </div>

      {/* Top-right action buttons — visible on hover. */}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        {drawingAvailable && (
          <button
            type="button"
            onClick={toggleToolbar}
            title={showToolbar ? 'Скрыть панель рисования' : 'Рисование на экране'}
            aria-label={showToolbar ? 'Скрыть панель рисования' : 'Рисование на экране'}
            className={cn(
              'rounded p-2 text-white transition-colors focus:outline-none focus:ring-2 focus:ring-white/40',
              showToolbar ? 'bg-white/30 hover:bg-white/40' : 'bg-black/70 hover:bg-black/90'
            )}
          >
            <PencilIcon className="h-5 w-5" />
          </button>
        )}
        <button
          type="button"
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Выйти из полноэкранного режима (F)' : 'Развернуть на весь экран (F / двойной клик)'}
          aria-label={isFullscreen ? 'Выйти из полноэкранного режима' : 'Во весь экран'}
          className="rounded bg-black/70 p-2 text-white hover:bg-black/90 focus:outline-none focus:ring-2 focus:ring-white/40"
        >
          {isFullscreen ? (
            <FullscreenExitIcon className="h-5 w-5" />
          ) : (
            <FullscreenEnterIcon className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* Drawing toolbar — hidden by default, shown when pencil button pressed. */}
      {drawingAvailable && showToolbar && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2">
          <DrawingToolbar
            room={room ?? null}
            userId={userId as number}
            enabled={drawingEnabled}
            onToggleEnabled={() => setDrawingEnabled((v) => !v)}
          />
        </div>
      )}
    </div>
  );
}
