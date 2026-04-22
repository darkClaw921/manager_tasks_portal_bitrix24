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
import { FullscreenEnterIcon, FullscreenExitIcon } from './icons';

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

  // Fullscreen toggle. Safari uses webkit-prefixed API on the element;
  // document-level fullscreenchange still fires there, so one listener covers both.
  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current as
      | (HTMLDivElement & {
          webkitRequestFullscreen?: () => Promise<void>;
        })
      | null;
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void>;
    };
    const active = doc.fullscreenElement ?? doc.webkitFullscreenElement;
    try {
      if (!active) {
        if (!el) return;
        if (el.requestFullscreen) await el.requestFullscreen();
        else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
      } else {
        if (doc.exitFullscreen) await doc.exitFullscreen();
        else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
      }
    } catch (err) {
      console.warn('[ScreenShareView] fullscreen toggle failed:', err);
    }
  }, []);

  useEffect(() => {
    const onChange = () => {
      const doc = document as Document & { webkitFullscreenElement?: Element | null };
      const active = doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
      setIsFullscreen(active === containerRef.current);
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  const presenterName = participant.name ?? participant.identity;

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative flex h-full w-full items-center justify-center overflow-hidden rounded-card bg-black text-white',
        className
      )}
      data-meeting-surface="screen-share"
    >
      {/*
        Using `object-contain` keeps the source aspect ratio and letterboxes
        with black bars if the viewport differs. The overlay container below
        covers the same rect so normalized ([0..1]) stroke coordinates land
        on the actual pixels of the shared surface.
      */}
      <video
        ref={setVideoRef}
        autoPlay
        playsInline
        muted
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

      {/* Fullscreen toggle. */}
      <button
        type="button"
        onClick={toggleFullscreen}
        aria-label={isFullscreen ? 'Выйти из полноэкранного режима' : 'Во весь экран'}
        className="absolute right-3 top-3 rounded bg-black/60 p-2 text-white hover:bg-black/80 focus:outline-none focus:ring-2 focus:ring-white/40"
      >
        {isFullscreen ? (
          <FullscreenExitIcon className="h-4 w-4" />
        ) : (
          <FullscreenEnterIcon className="h-4 w-4" />
        )}
      </button>

      {/* Drawing toolbar — shown to anyone in the room (any participant can
          annotate the shared screen). Hidden if no room/userId was provided. */}
      {drawingAvailable && (
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
