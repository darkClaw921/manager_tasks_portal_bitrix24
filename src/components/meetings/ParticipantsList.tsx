'use client';

/**
 * Sidebar list of participants for the meeting room.
 *
 * Reads `ParticipantInfo` snapshots from `meetingStore`. Each row shows the
 * display name, mic/cam state, a "host" badge, and "(вы)" suffix on the local
 * row. Re-renders only when the underlying Map changes (the store replaces
 * the Map object on every `setParticipant` / `removeParticipant` call).
 */

import { Track } from 'livekit-client';
import { cn } from '@/lib/utils';
import {
  type ParticipantInfo,
  useMeetingStore,
} from '@/stores/meetingStore';
import {
  MicIcon,
  MicOffIcon,
  VideoIcon,
  VideoOffIcon,
  HostBadgeIcon,
} from './icons';

export interface ParticipantsListProps {
  /**
   * Optional override — when omitted, the list pulls participants from the
   * store. Passing a Map is supported for testing / Storybook scenarios.
   */
  participants?: Map<string, ParticipantInfo>;
  className?: string;
}

function MediaState({ info }: { info: ParticipantInfo }) {
  const { participant } = info;
  const micPub = participant.getTrackPublication(Track.Source.Microphone);
  const camPub = participant.getTrackPublication(Track.Source.Camera);
  const micOn = !!micPub && !micPub.isMuted;
  const camOn = !!camPub && !camPub.isMuted;

  return (
    <div className="flex items-center gap-1 text-text-secondary">
      <span
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded',
          micOn ? 'bg-background' : 'bg-red-100 text-red-600'
        )}
        aria-label={micOn ? 'Микрофон включён' : 'Микрофон выключен'}
      >
        {micOn ? (
          <MicIcon className="h-3.5 w-3.5" />
        ) : (
          <MicOffIcon className="h-3.5 w-3.5" />
        )}
      </span>
      <span
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded',
          camOn ? 'bg-background' : 'bg-red-100 text-red-600'
        )}
        aria-label={camOn ? 'Камера включена' : 'Камера выключена'}
      >
        {camOn ? (
          <VideoIcon className="h-3.5 w-3.5" />
        ) : (
          <VideoOffIcon className="h-3.5 w-3.5" />
        )}
      </span>
    </div>
  );
}

export function ParticipantsList({
  participants: participantsProp,
  className,
}: ParticipantsListProps) {
  const storeParticipants = useMeetingStore((s) => s.participants);
  const participants = participantsProp ?? storeParticipants;
  const rows = Array.from(participants.values());

  return (
    <div
      className={cn(
        'flex h-full flex-col rounded-card bg-surface p-3 shadow-card',
        className
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-h3 font-semibold">Участники</h3>
        <span className="text-small text-text-secondary">{rows.length}</span>
      </div>

      {rows.length === 0 ? (
        <div className="py-4 text-center text-small text-text-secondary">
          Пока никого
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((info) => (
            <li
              key={info.sid}
              className="flex items-center justify-between gap-2 rounded p-2 hover:bg-background"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-small font-semibold text-primary">
                  {info.name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1 truncate">
                    <span className="truncate text-body">{info.name}</span>
                    {info.isHost && (
                      <HostBadgeIcon
                        className="h-3.5 w-3.5 text-amber-500"
                        aria-label="Хост встречи"
                      />
                    )}
                  </div>
                  {info.isLocal && (
                    <span className="text-small text-text-secondary">
                      (вы)
                    </span>
                  )}
                </div>
              </div>
              <MediaState info={info} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
