'use client';

/**
 * Right-hand sidebar for the workspace room.
 *
 * Tab strip switches between Participants and AI Chat. The selected tab is
 * remembered in localStorage (per the meeting-room precedent) so power users
 * don't have to re-select it every visit.
 */

import { useCallback, useEffect, useState } from 'react';
import { ParticipantsPanel } from './ParticipantsPanel';
import { AIChatPanel } from './AIChatPanel';
import { AttachedMeetingPanel } from './AttachedMeetingPanel';
import { cn } from '@/lib/utils';
import type { WorkspaceOp } from '@/types/workspace';

type SidebarTab = 'participants' | 'chat';

const TAB_STORAGE_KEY = 'taskhub.workspace-room.sidebar-tab';

function readStoredTab(): SidebarTab {
  if (typeof window === 'undefined') return 'participants';
  try {
    const v = window.localStorage.getItem(TAB_STORAGE_KEY);
    if (v === 'participants' || v === 'chat') return v;
  } catch {
    // private mode
  }
  return 'participants';
}

function persistTab(tab: SidebarTab) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TAB_STORAGE_KEY, tab);
  } catch {
    // ignore
  }
}

export interface WorkspaceSidebarProps {
  workspaceId: number;
  isOwner: boolean;
  currentUserId: number;
  /** Current `workspaces.meetingId` (null when not attached). Drives the
   *  AttachedMeetingPanel section above the tabs. */
  attachedMeetingId?: number | null;
  /** Called when the user successfully attaches/detaches the workspace
   *  from a meeting; the parent should refresh the workspace meta. */
  onAttachedMeetingChange?: (newMeetingId: number | null) => void;
  /** Called when the user clicks "Пригласить" inside the participants tab. */
  onInvite?: () => void;
  /**
   * Forwarded to `AIChatPanel`. Called when the user clicks "Применить"
   * on a structured commands suggestion. Wired by `WorkspaceRoom` to
   * the live `commitOp` from `useWorkspaceOps`.
   */
  onApplyCommands?: (commands: WorkspaceOp[]) => void;
  className?: string;
}

export function WorkspaceSidebar({
  workspaceId,
  isOwner,
  currentUserId,
  attachedMeetingId = null,
  onAttachedMeetingChange,
  onInvite,
  onApplyCommands,
  className,
}: WorkspaceSidebarProps) {
  const [tab, setTab] = useState<SidebarTab>('participants');
  // Restore on mount.
  useEffect(() => {
    setTab(readStoredTab());
  }, []);

  const switchTab = useCallback((next: SidebarTab) => {
    setTab(next);
    persistTab(next);
  }, []);

  return (
    <div
      className={cn(
        'flex h-full min-h-0 w-[320px] flex-col rounded-card bg-surface shadow-card border border-border overflow-hidden',
        className
      )}
    >
      {/* Attached meeting (visible to participants when attached, to owner always) */}
      {(attachedMeetingId != null || isOwner) && (
        <div className="border-b border-border p-2">
          <AttachedMeetingPanel
            workspaceId={workspaceId}
            meetingId={attachedMeetingId}
            isOwner={isOwner}
            onChanged={onAttachedMeetingChange}
          />
        </div>
      )}
      <div className="flex border-b border-border">
        <button
          type="button"
          onClick={() => switchTab('participants')}
          className={cn(
            'flex-1 px-3 py-2 text-small text-center transition-colors',
            tab === 'participants'
              ? 'border-b-2 border-primary text-primary font-semibold'
              : 'text-text-secondary hover:text-foreground'
          )}
        >
          Участники
        </button>
        <button
          type="button"
          onClick={() => switchTab('chat')}
          className={cn(
            'flex-1 px-3 py-2 text-small text-center transition-colors',
            tab === 'chat'
              ? 'border-b-2 border-primary text-primary font-semibold'
              : 'text-text-secondary hover:text-foreground'
          )}
        >
          AI Чат
        </button>
      </div>
      <div className="flex-1 min-h-0">
        {tab === 'participants' && (
          <ParticipantsPanel
            workspaceId={workspaceId}
            isOwner={isOwner}
            currentUserId={currentUserId}
            onInvite={onInvite}
          />
        )}
        {tab === 'chat' && (
          <AIChatPanel workspaceId={workspaceId} onApplyCommands={onApplyCommands} />
        )}
      </div>
    </div>
  );
}
