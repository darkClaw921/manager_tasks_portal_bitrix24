'use client';

/**
 * Top-level meeting room component.
 *
 * Composes the pieces:
 *   - `useMeetingRoom`: owns the LiveKit Room lifecycle.
 *   - `meetingStore`:   live participant + local-track snapshot.
 *   - `VideoTile`:      one per participant in grid layout.
 *   - `ScreenShareView`: replaces the grid when any participant shares screen.
 *   - `MeetingControls`: bottom action bar (mic/cam/share/leave/record).
 *   - `ParticipantsList`: collapsible right sidebar.
 *
 * Layout adapts on screen-share: when a remote (or local) participant has a
 * `Track.Source.ScreenShare` publication subscribed, we render the share in
 * the main pane and demote the rest to a horizontal strip of small tiles.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ConnectionState,
  Track,
  type Participant,
  type RemoteParticipant,
  type VideoTrack,
} from 'livekit-client';
import { useMeetingRoom } from '@/hooks/useMeetingRoom';
import { useMeetingStore } from '@/stores/meetingStore';
import { VideoTile } from './VideoTile';
import { ScreenShareView } from './ScreenShareView';
import { MeetingControls } from './MeetingControls';
import { ParticipantsList } from './ParticipantsList';
import { ChatPanel } from './ChatPanel';
import { MeetingWorkspacesPanel } from './MeetingWorkspacesPanel';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

type SidebarTab = 'participants' | 'chat' | 'workspaces';

/**
 * localStorage key for remembering the last active sidebar tab so users who
 * prefer the chat tab don't have to re-select it every meeting.
 */
const TAB_STORAGE_KEY = 'taskhub.meeting-room.sidebar-tab';

function readStoredTab(): SidebarTab {
  if (typeof window === 'undefined') return 'participants';
  try {
    const v = window.localStorage.getItem(TAB_STORAGE_KEY);
    if (v === 'participants' || v === 'chat' || v === 'workspaces') return v;
  } catch {
    // noop — localStorage may be unavailable in private mode
  }
  return 'participants';
}

function persistTab(tab: SidebarTab) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TAB_STORAGE_KEY, tab);
  } catch {
    // noop
  }
}

export interface MeetingRoomProps {
  meetingId: number;
  /** LiveKit access token minted via `POST /api/meetings/[id]/token`. */
  token: string;
  /** Public LiveKit websocket URL. */
  url: string;
  /** True when the current user is the meeting host. */
  isHost: boolean;
  /** App user id of the local participant — required for the drawing data
   *  channel (used to stamp own strokes and filter our own echoes). */
  userId: number;
  /** Optional override for the leave navigation. */
  onLeft?: () => void;
}

interface ScreenShareSelection {
  participant: Participant;
  track: VideoTrack;
}

/**
 * Find the first participant currently sharing their screen, if any.
 * Local participant is checked too — we want the host to see their own share
 * mirrored in the main pane.
 */
function pickScreenShare(
  local: Participant | undefined,
  remotes: Map<string, RemoteParticipant>
): ScreenShareSelection | null {
  const candidates: Participant[] = [];
  if (local) candidates.push(local);
  remotes.forEach((p) => candidates.push(p));

  for (const p of candidates) {
    const pub = p.getTrackPublication(Track.Source.ScreenShare);
    const t = pub?.track;
    // Narrow: VideoTrack has `attach()` like all tracks but we want a typed cast.
    if (pub && t && pub.kind === Track.Kind.Video) {
      return { participant: p, track: t as VideoTrack };
    }
  }
  return null;
}

export function MeetingRoom({
  meetingId,
  token,
  url,
  isHost,
  userId,
  onLeft,
}: MeetingRoomProps) {
  const { room, isConnected, connectionState, error, reconnect } = useMeetingRoom({
    token,
    url,
    isHost,
  });
  const reset = useMeetingStore((s) => s.reset);
  const participantsMap = useMeetingStore((s) => s.participants);

  // The store mirror updates on Track* events, so reading from the live Room
  // here gives us the same notification cadence as everything else. We use a
  // short-lived state bump tied to the store map to recompute the selection.
  const [bump, setBump] = useState(0);
  useEffect(() => {
    setBump((b) => b + 1);
  }, [participantsMap]);

  // Sidebar tab + unread chat badge. The badge counts messages that arrived
  // while the sidebar was on the "participants" tab; switching to "chat"
  // clears it. Initial tab is restored from localStorage on first render.
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('participants');
  const [unreadChat, setUnreadChat] = useState<number>(0);
  useEffect(() => {
    setSidebarTab(readStoredTab());
  }, []);
  const onSelectTab = useCallback((tab: SidebarTab) => {
    setSidebarTab(tab);
    persistTab(tab);
    if (tab === 'chat') setUnreadChat(0);
  }, []);
  const onNewChatMessage = useCallback(() => {
    setUnreadChat((c) => c + 1);
  }, []);

  const screenShare = useMemo<ScreenShareSelection | null>(() => {
    if (!room) return null;
    return pickScreenShare(room.localParticipant, room.remoteParticipants);
    // bump is intentionally part of deps so we recompute on track changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, bump]);

  // When the page unmounts (route change), clear the store so a future visit
  // starts from a known state.
  useEffect(() => {
    return () => {
      reset();
    };
  }, [reset]);

  if (error) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6">
        <h2 className="text-h2 font-semibold">Не удалось подключиться</h2>
        <p className="text-body text-text-secondary">{error.message}</p>
        <div className="flex gap-2">
          <Button type="button" variant="primary" onClick={reconnect}>
            Повторить попытку
          </Button>
          {onLeft && (
            <Button type="button" variant="secondary" onClick={onLeft}>
              Назад
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (!isConnected) {
    const label =
      connectionState === ConnectionState.Reconnecting
        ? 'Восстановление соединения…'
        : 'Подключение к встрече…';
    return (
      <div className="flex h-full w-full items-center justify-center p-6">
        <div className="rounded-card bg-surface px-6 py-4 text-body shadow-card">
          {label}
        </div>
      </div>
    );
  }

  const participants = Array.from(participantsMap.values());

  return (
    <div className="grid h-full w-full grid-cols-1 grid-rows-[1fr_auto] gap-3 p-3 lg:grid-cols-[1fr_320px]">
      {/* Main stage */}
      <div className="flex min-h-0 flex-col gap-3">
        {screenShare ? (
          <>
            <div className="min-h-0 flex-1">
              <ScreenShareView
                track={screenShare.track}
                participant={screenShare.participant}
                room={room}
                userId={userId}
              />
            </div>
            {/* Strip of all participants when in screen-share mode. */}
            <div className="grid grid-flow-col auto-cols-[180px] gap-2 overflow-x-auto">
              {participants.map((info) => (
                <VideoTile
                  key={info.sid}
                  participant={info.participant}
                  highlighted={info.isLocal}
                />
              ))}
            </div>
          </>
        ) : (
          <div
            className={cn(
              'grid min-h-0 flex-1 gap-3',
              participants.length <= 1 && 'grid-cols-1',
              participants.length === 2 && 'grid-cols-2',
              participants.length > 2 && participants.length <= 4 && 'grid-cols-2',
              participants.length > 4 && 'grid-cols-3'
            )}
          >
            {participants.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-card bg-surface text-text-secondary">
                Ожидание подключения участников…
              </div>
            ) : (
              participants.map((info) => (
                <VideoTile
                  key={info.sid}
                  participant={info.participant}
                  highlighted={info.isLocal}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* Right sidebar — Участники / Чат tabs */}
      <aside className="hidden min-h-0 flex-col lg:flex">
        <div
          role="tablist"
          aria-label="Панель встречи"
          className="mb-2 flex gap-1 rounded-card bg-surface p-1 shadow-card"
        >
          <button
            type="button"
            role="tab"
            aria-selected={sidebarTab === 'participants'}
            onClick={() => onSelectTab('participants')}
            className={cn(
              'flex-1 rounded px-3 py-1.5 text-small font-medium transition',
              sidebarTab === 'participants'
                ? 'bg-primary text-text-inverse'
                : 'text-text-secondary hover:bg-background'
            )}
          >
            Участники
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={sidebarTab === 'chat'}
            onClick={() => onSelectTab('chat')}
            className={cn(
              'relative flex-1 rounded px-3 py-1.5 text-small font-medium transition',
              sidebarTab === 'chat'
                ? 'bg-primary text-text-inverse'
                : 'text-text-secondary hover:bg-background'
            )}
          >
            Чат
            {unreadChat > 0 && sidebarTab !== 'chat' && (
              <span
                aria-label={`${unreadChat} непрочитанных`}
                className="ml-1.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-semibold leading-[18px] text-white"
              >
                {unreadChat > 99 ? '99+' : unreadChat}
              </span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={sidebarTab === 'workspaces'}
            onClick={() => onSelectTab('workspaces')}
            className={cn(
              'flex-1 rounded px-3 py-1.5 text-small font-medium transition',
              sidebarTab === 'workspaces'
                ? 'bg-primary text-text-inverse'
                : 'text-text-secondary hover:bg-background'
            )}
          >
            Доски
          </button>
        </div>
        <div className="min-h-0 flex-1">
          {/* Both panels are mounted at all times: the chat panel must keep
              its LiveKit subscription so unread messages can arrive while the
              participants tab is visible. We toggle only the CSS display. */}
          <div
            role="tabpanel"
            aria-hidden={sidebarTab !== 'participants'}
            className={cn(
              'h-full',
              sidebarTab === 'participants' ? 'block' : 'hidden'
            )}
          >
            <ParticipantsList />
          </div>
          <div
            role="tabpanel"
            aria-hidden={sidebarTab !== 'chat'}
            className={cn('h-full', sidebarTab === 'chat' ? 'block' : 'hidden')}
          >
            <ChatPanel
              meetingId={meetingId}
              room={room}
              userId={userId}
              isActive={sidebarTab === 'chat'}
              onNewMessage={onNewChatMessage}
            />
          </div>
          <div
            role="tabpanel"
            aria-hidden={sidebarTab !== 'workspaces'}
            className={cn('h-full', sidebarTab === 'workspaces' ? 'block' : 'hidden')}
          >
            <MeetingWorkspacesPanel
              meetingId={meetingId}
              isActive={sidebarTab === 'workspaces'}
            />
          </div>
        </div>
      </aside>

      {/* Controls — span full width of the grid */}
      <div className="lg:col-span-2">
        <MeetingControls
          room={room}
          isHost={isHost}
          meetingId={meetingId}
          onLeft={onLeft}
        />
      </div>
    </div>
  );
}
