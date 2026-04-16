'use client';

/**
 * A single remote/local participant tile.
 *
 * Behaviour:
 *   - Binds the participant's camera VideoTrack to a `<video>` element via
 *     `track.attach(videoRef.current)` and detaches on unmount / track swap.
 *   - Binds the microphone AudioTrack to a hidden `<audio>` element so voice
 *     is played out even when the tile isn't the active speaker. For the
 *     local participant we skip audio attachment — the browser already
 *     hears your own mic via its speakers, which would cause feedback.
 *   - Renders the participant's name and a mute badge when muted.
 *   - Reads `participant.audioLevel` via `rAF` to drive an animated border
 *     that pulses with speech volume without re-rendering on every tick.
 */

import { useEffect, useRef } from 'react';
import {
  ParticipantEvent,
  Track,
  type Participant,
  type TrackPublication,
  type LocalTrackPublication,
  type RemoteTrack,
  type LocalTrack,
} from 'livekit-client';
import { cn } from '@/lib/utils';
import { MicIcon, MicOffIcon, VideoOffIcon } from './icons';

export interface VideoTileProps {
  participant: Participant;
  /** Optional label override (defaults to `participant.name` or `identity`). */
  label?: string;
  /** Visual emphasis — e.g. the local tile in a grid. */
  highlighted?: boolean;
  className?: string;
}

/**
 * Resolve the camera publication. Works for both local and remote participants
 * because `getTrackPublication` exists on the shared `Participant` base class.
 */
function getCameraPublication(
  participant: Participant
): TrackPublication | undefined {
  return participant.getTrackPublication(Track.Source.Camera);
}

function getMicrophonePublication(
  participant: Participant
): TrackPublication | undefined {
  return participant.getTrackPublication(Track.Source.Microphone);
}

export function VideoTile({
  participant,
  label,
  highlighted,
  className,
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const borderRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);

  // Attach/detach video + audio whenever the corresponding publication changes.
  useEffect(() => {
    const videoEl = videoRef.current;
    const audioEl = audioRef.current;
    if (!videoEl) return;

    const attachVideo = () => {
      const pub = getCameraPublication(participant);
      const track = pub?.track as RemoteTrack | LocalTrack | undefined;
      if (track && !pub?.isMuted) {
        track.attach(videoEl);
      }
    };
    const attachAudio = () => {
      if (!audioEl || participant.isLocal) return;
      const pub = getMicrophonePublication(participant);
      const track = pub?.track as RemoteTrack | undefined;
      if (track && !pub?.isMuted) {
        track.attach(audioEl);
      }
    };

    const detachVideo = () => {
      const pub = getCameraPublication(participant);
      pub?.track?.detach(videoEl);
    };
    const detachAudio = () => {
      if (!audioEl) return;
      const pub = getMicrophonePublication(participant);
      pub?.track?.detach(audioEl);
    };

    attachVideo();
    attachAudio();

    const handleSubscribed = (_track: unknown, pub: TrackPublication) => {
      if (pub.source === Track.Source.Camera) attachVideo();
      if (pub.source === Track.Source.Microphone) attachAudio();
    };
    const handleUnsubscribed = (_track: unknown, pub: TrackPublication) => {
      if (pub.source === Track.Source.Camera) detachVideo();
      if (pub.source === Track.Source.Microphone) detachAudio();
    };
    const handleMuted = (pub: TrackPublication) => {
      if (pub.source === Track.Source.Camera) detachVideo();
      if (pub.source === Track.Source.Microphone) detachAudio();
    };
    const handleUnmuted = (pub: TrackPublication) => {
      if (pub.source === Track.Source.Camera) attachVideo();
      if (pub.source === Track.Source.Microphone) attachAudio();
    };
    // LocalTrack events pass only the publication.
    const handleLocalPublished = (pub: LocalTrackPublication) => {
      if (pub.source === Track.Source.Camera) attachVideo();
      if (pub.source === Track.Source.Microphone) attachAudio();
    };
    const handleLocalUnpublished = (pub: LocalTrackPublication) => {
      if (pub.source === Track.Source.Camera) detachVideo();
      if (pub.source === Track.Source.Microphone) detachAudio();
    };

    participant.on(ParticipantEvent.TrackSubscribed, handleSubscribed);
    participant.on(ParticipantEvent.TrackUnsubscribed, handleUnsubscribed);
    participant.on(ParticipantEvent.TrackMuted, handleMuted);
    participant.on(ParticipantEvent.TrackUnmuted, handleUnmuted);
    participant.on(ParticipantEvent.LocalTrackPublished, handleLocalPublished);
    participant.on(ParticipantEvent.LocalTrackUnpublished, handleLocalUnpublished);

    return () => {
      participant.off(ParticipantEvent.TrackSubscribed, handleSubscribed);
      participant.off(ParticipantEvent.TrackUnsubscribed, handleUnsubscribed);
      participant.off(ParticipantEvent.TrackMuted, handleMuted);
      participant.off(ParticipantEvent.TrackUnmuted, handleUnmuted);
      participant.off(ParticipantEvent.LocalTrackPublished, handleLocalPublished);
      participant.off(ParticipantEvent.LocalTrackUnpublished, handleLocalUnpublished);
      detachVideo();
      detachAudio();
    };
  }, [participant]);

  // Drive the audio-level border ring via rAF so the parent doesn't re-render.
  useEffect(() => {
    const el = borderRef.current;
    if (!el) return;

    const tick = () => {
      const level = participant.audioLevel ?? 0;
      // audioLevel is roughly 0..1 — scale to a perceptible ring opacity.
      const opacity = Math.min(1, Math.max(0, level * 3));
      el.style.opacity = String(opacity);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [participant]);

  const displayName = label ?? participant.name ?? participant.identity;
  const micPub = getMicrophonePublication(participant);
  const camPub = getCameraPublication(participant);
  const isMicMuted = !micPub || micPub.isMuted;
  const isCamOff = !camPub || camPub.isMuted;

  return (
    <div
      className={cn(
        'relative aspect-video overflow-hidden rounded-card bg-black text-white',
        highlighted && 'ring-2 ring-primary',
        className
      )}
    >
      {/* Animated audio-level ring. Pointer-events none so it never eats clicks. */}
      <div
        ref={borderRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-card ring-2 ring-green-400 opacity-0 transition-opacity"
      />

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={participant.isLocal}
        className={cn(
          'h-full w-full object-cover',
          isCamOff && 'invisible'
        )}
      />

      {/* Placeholder when camera is off. */}
      {isCamOff && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface/10">
          <div className="flex flex-col items-center gap-2 text-white/80">
            <VideoOffIcon className="h-8 w-8" />
            <span className="text-small">{displayName}</span>
          </div>
        </div>
      )}

      {/* Audio sink for the remote track. Hidden — we just need playback. */}
      <audio ref={audioRef} autoPlay playsInline hidden />

      {/* Name + mute badge. */}
      <div className="absolute inset-x-2 bottom-2 flex items-center justify-between gap-2">
        <span className="truncate rounded bg-black/50 px-2 py-0.5 text-small">
          {displayName}
        </span>
        <span
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded-full',
            isMicMuted ? 'bg-red-500/80' : 'bg-black/50'
          )}
          aria-label={isMicMuted ? 'Микрофон выключен' : 'Микрофон включён'}
        >
          {isMicMuted ? (
            <MicOffIcon className="h-3.5 w-3.5" />
          ) : (
            <MicIcon className="h-3.5 w-3.5" />
          )}
        </span>
      </div>
    </div>
  );
}
