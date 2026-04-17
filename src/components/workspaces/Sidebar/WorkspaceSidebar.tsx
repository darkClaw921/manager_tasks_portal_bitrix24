'use client';

/**
 * Right-hand sidebar for the workspace room.
 *
 * Tab strip switches between Participants and AI Chat. The selected tab is
 * remembered in localStorage (per the meeting-room precedent) so power users
 * don't have to re-select it every visit.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ParticipantsPanel } from './ParticipantsPanel';
import { AIChatPanel } from './AIChatPanel';
import { AttachedMeetingPanel } from './AttachedMeetingPanel';
import { VersionHistoryPanel } from './VersionHistoryPanel';
import { CommentsPanel } from './CommentsPanel';
import { cn } from '@/lib/utils';
import type { WorkspaceOp } from '@/types/workspace';

type SidebarTab = 'participants' | 'chat' | 'comments' | 'history';

const TAB_STORAGE_KEY = 'taskhub.workspace-room.sidebar-tab';

function readStoredTab(): SidebarTab {
  if (typeof window === 'undefined') return 'participants';
  try {
    const v = window.localStorage.getItem(TAB_STORAGE_KEY);
    if (v === 'participants' || v === 'chat' || v === 'comments' || v === 'history') return v;
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
  /**
   * Element id that the comments tab will focus on. When null/undefined,
   * the comments tab shows a placeholder asking the user to select an element.
   */
  selectedElementId?: string | null;
  /**
   * Slot rendered above the tab content (e.g. PresenterControls). Optional —
   * kept slim so feature flags don't bloat the sidebar.
   */
  extras?: ReactNode;
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
  selectedElementId,
  extras,
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
      {extras && <div className="border-b border-border p-2">{extras}</div>}
      <div className="flex border-b border-border text-xs">
        {(['participants', 'chat', 'comments', 'history'] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => switchTab(id)}
            className={cn(
              'flex-1 px-2 py-2 text-center transition-colors',
              tab === id
                ? 'border-b-2 border-primary text-primary font-semibold'
                : 'text-text-secondary hover:text-foreground'
            )}
          >
            {id === 'participants'
              ? 'Участники'
              : id === 'chat'
                ? 'AI Чат'
                : id === 'comments'
                  ? 'Комментарии'
                  : 'История'}
          </button>
        ))}
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
        {tab === 'comments' && (
          <CommentsPanel
            workspaceId={workspaceId}
            elementId={selectedElementId ?? null}
            currentUserId={currentUserId}
          />
        )}
        {tab === 'history' && (
          <VersionHistoryPanel workspaceId={workspaceId} isOwner={isOwner} />
        )}
      </div>
    </div>
  );
}
