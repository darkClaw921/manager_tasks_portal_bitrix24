'use client';

/**
 * Bottom control bar for the meeting room.
 *
 * Renders mic / camera / screen-share toggles, a leave button, and (for the
 * host only) a record start/stop button. State is read directly off the
 * `Room.localParticipant` because LiveKit owns the source of truth — we
 * mirror the `isMicrophoneEnabled` / `isCameraEnabled` / `isScreenShareEnabled`
 * flags into local React state via the `LocalTrackPublished/Unpublished`
 * events propagated by `useMeetingRoom` into the meetingStore.
 *
 * Recording is host-only and routed through the `useStartRecording` /
 * `useStopRecording` mutations (POST `/api/meetings/[id]/recordings/start|stop`).
 * The record button reflects the optimistic `recordingState` in the store
 * and disables itself while the mutation is in-flight.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Track, type Room } from 'livekit-client';
import { Button } from '@/components/ui';
import { useMeetingStore } from '@/stores/meetingStore';
import {
  useStartRecording,
  useStopRecording,
  useEndMeeting,
} from '@/hooks/useMeeting';
import {
  MicIcon,
  MicOffIcon,
  VideoIcon,
  VideoOffIcon,
  ScreenShareIcon,
  ScreenShareOffIcon,
  PhoneOffIcon,
  RecordCircleIcon,
  StopSquareIcon,
  SettingsIcon,
} from './icons';
import { DeviceSettingsModal } from './DeviceSettingsModal';

export interface MeetingControlsProps {
  /** Active LiveKit Room. May be null while still connecting. */
  room: Room | null;
  /** True when the current user is the host (controls record + end-for-all). */
  isHost: boolean;
  /** Meeting id used for record start/stop and end-meeting mutations. */
  meetingId: number;
  /** Optional override for the leave navigation. Defaults to router.back(). */
  onLeft?: () => void;
}

export function MeetingControls({
  room,
  isHost,
  meetingId,
  onLeft,
}: MeetingControlsProps) {
  const router = useRouter();
  const localTracks = useMeetingStore((s) => s.localTracks);
  const recordingState = useMeetingStore((s) => s.recordingState);
  const setRecordingState = useMeetingStore((s) => s.setRecordingState);

  const startRecording = useStartRecording(meetingId);
  const stopRecording = useStopRecording(meetingId);
  const endMeeting = useEndMeeting(meetingId);

  // Mirror the local enabled flags. We initialise from the publication state
  // and update on every store change because that's the place that LocalTrack
  // events are funneled into.
  const [micOn, setMicOn] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [screenOn, setScreenOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (!room) {
      setMicOn(false);
      setCamOn(false);
      setScreenOn(false);
      return;
    }
    setMicOn(!!localTracks.mic && !localTracks.mic.isMuted);
    setCamOn(!!localTracks.cam && !localTracks.cam.isMuted);
    setScreenOn(!!localTracks.screen);
  }, [room, localTracks.mic, localTracks.cam, localTracks.screen]);

  const toggleMic = useCallback(async () => {
    if (!room || busy) return;
    setBusy(true);
    try {
      const next = !room.localParticipant.isMicrophoneEnabled;
      await room.localParticipant.setMicrophoneEnabled(next);
      setMicOn(next);
    } catch (err) {
      console.error('[MeetingControls] toggleMic failed:', err);
    } finally {
      setBusy(false);
    }
  }, [room, busy]);

  const toggleCam = useCallback(async () => {
    if (!room || busy) return;
    setBusy(true);
    try {
      const next = !room.localParticipant.isCameraEnabled;
      await room.localParticipant.setCameraEnabled(next);
      setCamOn(next);
    } catch (err) {
      console.error('[MeetingControls] toggleCam failed:', err);
    } finally {
      setBusy(false);
    }
  }, [room, busy]);

  const toggleScreen = useCallback(async () => {
    if (!room || busy) return;
    setBusy(true);
    try {
      const next = !room.localParticipant.isScreenShareEnabled;
      await room.localParticipant.setScreenShareEnabled(next, {
        audio: true,
      });
      setScreenOn(next);
    } catch (err) {
      // The user likely cancelled the picker — no need to escalate.
      console.warn('[MeetingControls] toggleScreen failed:', err);
    } finally {
      setBusy(false);
    }
  }, [room, busy]);

  const leave = useCallback(async () => {
    try {
      if (room) await room.disconnect();
    } catch (err) {
      console.warn('[MeetingControls] disconnect threw:', err);
    }
    if (onLeft) onLeft();
    else router.back();
  }, [room, router, onLeft]);

  const endForAll = useCallback(async () => {
    try {
      await endMeeting.mutateAsync();
    } catch (err) {
      console.error('[MeetingControls] end meeting failed:', err);
    }
    await leave();
  }, [endMeeting, leave]);

  const toggleRecording = useCallback(async () => {
    if (!isHost) return;
    if (recordingState === 'recording') {
      setRecordingState('stopping');
      try {
        await stopRecording.mutateAsync();
        setRecordingState('idle');
      } catch (err) {
        console.error('[MeetingControls] stopRecording failed:', err);
        // Roll back to "recording" on error so the host can retry.
        setRecordingState('recording');
      }
      return;
    }
    if (recordingState === 'idle') {
      setRecordingState('recording');
      try {
        await startRecording.mutateAsync();
      } catch (err) {
        console.error('[MeetingControls] startRecording failed:', err);
        setRecordingState('idle');
      }
    }
  }, [isHost, recordingState, setRecordingState, startRecording, stopRecording]);

  const recordingBusy =
    recordingState === 'stopping' ||
    startRecording.isPending ||
    stopRecording.isPending;

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 rounded-card bg-surface px-4 py-3 shadow-card">
      <Button
        type="button"
        variant={micOn ? 'secondary' : 'danger'}
        size="md"
        onClick={toggleMic}
        disabled={!room || busy}
        aria-label={micOn ? 'Выключить микрофон' : 'Включить микрофон'}
      >
        {micOn ? <MicIcon className="h-4 w-4" /> : <MicOffIcon className="h-4 w-4" />}
      </Button>

      <Button
        type="button"
        variant={camOn ? 'secondary' : 'danger'}
        size="md"
        onClick={toggleCam}
        disabled={!room || busy}
        aria-label={camOn ? 'Выключить камеру' : 'Включить камеру'}
      >
        {camOn ? <VideoIcon className="h-4 w-4" /> : <VideoOffIcon className="h-4 w-4" />}
      </Button>

      <Button
        type="button"
        variant={screenOn ? 'primary' : 'secondary'}
        size="md"
        onClick={toggleScreen}
        disabled={!room || busy}
        aria-label={screenOn ? 'Остановить демонстрацию' : 'Поделиться экраном'}
      >
        {screenOn ? (
          <ScreenShareOffIcon className="h-4 w-4" />
        ) : (
          <ScreenShareIcon className="h-4 w-4" />
        )}
      </Button>

      <Button
        type="button"
        variant="secondary"
        size="md"
        onClick={() => setSettingsOpen(true)}
        disabled={!room}
        aria-label="Настройки устройств"
      >
        <SettingsIcon className="h-4 w-4" />
      </Button>

      {isHost && (
        <Button
          type="button"
          variant={recordingState === 'recording' ? 'danger' : 'secondary'}
          size="md"
          onClick={toggleRecording}
          disabled={!room || recordingBusy}
          loading={recordingBusy}
          aria-label={
            recordingState === 'recording' ? 'Остановить запись' : 'Начать запись'
          }
        >
          {recordingState === 'recording' ? (
            <StopSquareIcon className="h-4 w-4" />
          ) : (
            <RecordCircleIcon className="h-4 w-4 text-red-500" />
          )}
          <span className="hidden sm:inline">
            {recordingState === 'recording' ? 'Стоп' : 'Запись'}
          </span>
        </Button>
      )}

      <Button
        type="button"
        variant="danger"
        size="md"
        onClick={leave}
        aria-label="Покинуть встречу"
      >
        <PhoneOffIcon className="h-4 w-4" />
        <span className="hidden sm:inline">Выйти</span>
      </Button>

      {isHost && (
        <Button
          type="button"
          variant="ghost"
          size="md"
          onClick={endForAll}
          disabled={endMeeting.isPending}
          loading={endMeeting.isPending}
        >
          Завершить для всех
        </Button>
      )}

      <DeviceSettingsModal
        room={room}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}

// Re-export Track enum reference so callers don't need a separate import for
// the ScreenShare source check. Keeping the dependency surface tight.
export { Track as MeetingControlsTrackEnum };
