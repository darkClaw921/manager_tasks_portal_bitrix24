'use client';

/**
 * Hook that owns the lifecycle of a single LiveKit `Room` instance for the
 * meeting page.
 *
 * Inputs:
 *   - `token` and `url`: minted by `POST /api/meetings/[id]/token`.
 *   - `isHost`: used only to flag the local participant inside the store.
 *   - `enableMedia`: when true (default), the hook turns on mic + cam right
 *     after connecting. Pass false to render the room in a "preview" mode.
 *
 * Side effects:
 *   - Subscribes the meetingStore to live participant + track events so the
 *     UI can render purely from the store.
 *   - Disconnects + clears the store on unmount or when the inputs change.
 *
 * Output:
 *   - `room`         : the `Room` instance (null until `connect()` returns).
 *   - `isConnected`  : true after RoomEvent.Connected (false after Disconnected).
 *   - `connectionState`: full ConnectionState enum, useful for "Reconnecting…".
 *   - `error`        : last fatal error, if any.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Room,
  RoomEvent,
  ConnectionState,
  Track,
  type Participant,
  type RemoteParticipant,
  type LocalParticipant,
  type LocalTrackPublication,
  type RemoteTrackPublication,
  type DisconnectReason,
} from 'livekit-client';
import { useMeetingStore, type ParticipantInfo } from '@/stores/meetingStore';

export interface UseMeetingRoomOptions {
  token: string | null;
  url: string | null;
  isHost: boolean;
  /** When true, calls setMicrophoneEnabled(true) + setCameraEnabled(true) post-connect. */
  enableMedia?: boolean;
}

export interface UseMeetingRoomResult {
  room: Room | null;
  isConnected: boolean;
  connectionState: ConnectionState;
  error: Error | null;
  /** Manual reconnect — useful for an "Try again" button after a hard error. */
  reconnect: () => void;
}

/** Build a ParticipantInfo snapshot used by VideoTile etc. */
function toParticipantInfo(
  participant: Participant,
  isLocal: boolean,
  isHost: boolean
): ParticipantInfo {
  return {
    sid: participant.sid,
    identity: participant.identity,
    name: participant.name ?? participant.identity,
    isLocal,
    isHost,
    participant,
  };
}

export function useMeetingRoom({
  token,
  url,
  isHost,
  enableMedia = true,
}: UseMeetingRoomOptions): UseMeetingRoomResult {
  const [room, setRoom] = useState<Room | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    ConnectionState.Disconnected
  );
  const [error, setError] = useState<Error | null>(null);
  // Bump to force the connect effect to re-run (manual reconnect).
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const isHostRef = useRef(isHost);
  isHostRef.current = isHost;

  const setParticipant = useMeetingStore((s) => s.setParticipant);
  const removeParticipant = useMeetingStore((s) => s.removeParticipant);
  const clearParticipants = useMeetingStore((s) => s.clearParticipants);
  const setLocalTrack = useMeetingStore((s) => s.setLocalTrack);

  const reconnect = useCallback(() => {
    setReconnectNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!token || !url) {
      return;
    }

    let cancelled = false;
    const r = new Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    // ==================== Event handlers ====================

    const onConnectionStateChanged = (state: ConnectionState) => {
      setConnectionState(state);
      setIsConnected(state === ConnectionState.Connected);
    };

    const onConnected = () => {
      setIsConnected(true);
      setError(null);
      // Seed the store with the local participant + any remote already in the room.
      setParticipant(toParticipantInfo(r.localParticipant, true, isHostRef.current));
      r.remoteParticipants.forEach((p) => {
        // We don't know which remote is host without server metadata; default false.
        setParticipant(toParticipantInfo(p, false, false));
      });
    };

    const onDisconnected = (_reason?: DisconnectReason) => {
      setIsConnected(false);
      clearParticipants();
      setLocalTrack('mic', null);
      setLocalTrack('cam', null);
      setLocalTrack('screen', null);
    };

    const onParticipantConnected = (participant: RemoteParticipant) => {
      setParticipant(toParticipantInfo(participant, false, false));
    };

    const onParticipantDisconnected = (participant: RemoteParticipant) => {
      removeParticipant(participant.sid);
    };

    // Refresh the snapshot when track state changes — VideoTile listens via
    // refs but we also want store consumers to see fresh `isMuted` flags.
    const refreshParticipantOnly = (
      _pub: unknown,
      participant: Participant
    ) => {
      const isLocal = participant.identity === r.localParticipant.identity;
      setParticipant(toParticipantInfo(participant, isLocal, isLocal ? isHostRef.current : false));
    };
    // (track, publication, participant) form — TrackSubscribed / TrackUnsubscribed.
    const refreshParticipantFromTrack = (
      _track: unknown,
      _pub: unknown,
      participant: Participant
    ) => refreshParticipantOnly(_pub, participant);

    const onLocalTrackPublished = (pub: LocalTrackPublication, _p: LocalParticipant) => {
      switch (pub.source) {
        case Track.Source.Microphone:
          setLocalTrack('mic', pub);
          break;
        case Track.Source.Camera:
          setLocalTrack('cam', pub);
          break;
        case Track.Source.ScreenShare:
          setLocalTrack('screen', pub);
          break;
        default:
          break;
      }
      setParticipant(toParticipantInfo(r.localParticipant, true, isHostRef.current));
    };

    const onLocalTrackUnpublished = (pub: LocalTrackPublication) => {
      switch (pub.source) {
        case Track.Source.Microphone:
          setLocalTrack('mic', null);
          break;
        case Track.Source.Camera:
          setLocalTrack('cam', null);
          break;
        case Track.Source.ScreenShare:
          setLocalTrack('screen', null);
          break;
        default:
          break;
      }
      setParticipant(toParticipantInfo(r.localParticipant, true, isHostRef.current));
    };

    const onTrackPublished = (
      _pub: RemoteTrackPublication,
      participant: RemoteParticipant
    ) => {
      setParticipant(toParticipantInfo(participant, false, false));
    };

    r.on(RoomEvent.ConnectionStateChanged, onConnectionStateChanged)
      .on(RoomEvent.Connected, onConnected)
      .on(RoomEvent.Disconnected, onDisconnected)
      .on(RoomEvent.ParticipantConnected, onParticipantConnected)
      .on(RoomEvent.ParticipantDisconnected, onParticipantDisconnected)
      .on(RoomEvent.TrackPublished, onTrackPublished)
      .on(RoomEvent.TrackSubscribed, refreshParticipantFromTrack)
      .on(RoomEvent.TrackUnsubscribed, refreshParticipantFromTrack)
      .on(RoomEvent.TrackMuted, refreshParticipantOnly)
      .on(RoomEvent.TrackUnmuted, refreshParticipantOnly)
      .on(RoomEvent.LocalTrackPublished, onLocalTrackPublished)
      .on(RoomEvent.LocalTrackUnpublished, onLocalTrackUnpublished);

    setRoom(r);
    setError(null);

    (async () => {
      try {
        await r.connect(url, token, {
          autoSubscribe: true,
          maxRetries: 3,
        });
        if (cancelled) return;
        if (enableMedia) {
          try {
            await r.localParticipant.setMicrophoneEnabled(true);
          } catch (err) {
            if ((err as { name?: string })?.name !== 'NotAllowedError') {
              console.warn('[useMeetingRoom] mic enable failed:', err);
            }
          }
          try {
            await r.localParticipant.setCameraEnabled(true);
          } catch (err) {
            if ((err as { name?: string })?.name !== 'NotAllowedError') {
              console.warn('[useMeetingRoom] cam enable failed:', err);
            }
          }
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsConnected(false);
      }
    })();

    return () => {
      cancelled = true;
      r.off(RoomEvent.ConnectionStateChanged, onConnectionStateChanged);
      r.off(RoomEvent.Connected, onConnected);
      r.off(RoomEvent.Disconnected, onDisconnected);
      r.off(RoomEvent.ParticipantConnected, onParticipantConnected);
      r.off(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
      r.off(RoomEvent.TrackPublished, onTrackPublished);
      r.off(RoomEvent.TrackSubscribed, refreshParticipantFromTrack);
      r.off(RoomEvent.TrackUnsubscribed, refreshParticipantFromTrack);
      r.off(RoomEvent.TrackMuted, refreshParticipantOnly);
      r.off(RoomEvent.TrackUnmuted, refreshParticipantOnly);
      r.off(RoomEvent.LocalTrackPublished, onLocalTrackPublished);
      r.off(RoomEvent.LocalTrackUnpublished, onLocalTrackUnpublished);
      // Best-effort disconnect — `disconnect()` returns a promise but we
      // don't await it on unmount to keep cleanup synchronous.
      void r.disconnect();
      clearParticipants();
      setLocalTrack('mic', null);
      setLocalTrack('cam', null);
      setLocalTrack('screen', null);
      setRoom(null);
      setIsConnected(false);
      setConnectionState(ConnectionState.Disconnected);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, url, enableMedia, reconnectNonce]);

  return { room, isConnected, connectionState, error, reconnect };
}
