'use client';

/**
 * Right-sidebar tab listing every participant of the workspace.
 *
 * Combines two sources:
 *   - Server-side participant rows via `useWorkspaceParticipants` (role,
 *     joinedAt, display name from the users table).
 *   - Live LiveKit presence via `workspaceStore.presence` (online indicator,
 *     cursor colour).
 *
 * Owner-only controls:
 *   - "Пригласить" — opens the supplied invite modal handler.
 *   - "×" next to non-owner rows — removes the participant.
 */

import { useMemo } from 'react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import {
  useWorkspaceParticipants,
  useRemoveWorkspaceParticipant,
} from '@/hooks/useWorkspace';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';

export interface ParticipantsPanelProps {
  workspaceId: number;
  /** True when the current user is the workspace owner. */
  isOwner: boolean;
  /** App user id of the current user (highlight ourselves + skip remove). */
  currentUserId: number;
  /** Click handler for the "Invite" button. */
  onInvite?: () => void;
}

export function ParticipantsPanel({
  workspaceId,
  isOwner,
  currentUserId,
  onInvite,
}: ParticipantsPanelProps) {
  const { data: participants, isLoading, isError } = useWorkspaceParticipants(workspaceId);
  const remove = useRemoveWorkspaceParticipant(workspaceId);
  const presence = useWorkspaceStore((s) => s.presence);
  const { toast } = useToast();

  const onlineSet = useMemo(() => new Set(Object.keys(presence)), [presence]);

  const handleRemove = async (userId: number) => {
    try {
      await remove.mutateAsync(userId);
      toast('success', 'Участник удалён');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось удалить';
      toast('error', message);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-small font-semibold text-foreground">Участники</span>
        {isOwner && (
          <Button type="button" variant="primary" size="sm" onClick={onInvite}>
            Пригласить
          </Button>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {isLoading && (
          <div className="px-3 py-3 text-small text-text-secondary">Загрузка…</div>
        )}
        {isError && (
          <div className="px-3 py-3 text-small text-danger">
            Не удалось загрузить участников
          </div>
        )}
        {!isLoading && !isError && (participants ?? []).length === 0 && (
          <div className="px-3 py-3 text-small text-text-secondary">
            Пока нет участников
          </div>
        )}
        {!isLoading &&
          !isError &&
          (participants ?? []).map((p) => {
            const isMe = p.userId === currentUserId;
            const online = onlineSet.has(String(p.userId));
            const presenceEntry = presence[String(p.userId)];
            return (
              <div
                key={p.id}
                className="flex items-center gap-2 px-3 py-2 border-b border-border/60 last:border-b-0"
              >
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white"
                  style={{
                    background: presenceEntry?.color ?? '#6b7280',
                  }}
                >
                  {(p.userName ?? '#').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-small text-foreground">
                      {p.userName ?? `User #${p.userId}`}
                      {isMe && (
                        <span className="ml-1 text-text-secondary">(вы)</span>
                      )}
                    </span>
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      title={online ? 'online' : 'offline'}
                      style={{ background: online ? '#10b981' : '#9ca3af' }}
                    />
                  </div>
                  <div className="text-[11px] text-text-secondary capitalize">
                    {p.role}
                  </div>
                </div>
                {isOwner && p.role !== 'owner' && !isMe && (
                  <button
                    type="button"
                    onClick={() => handleRemove(p.userId)}
                    disabled={remove.isPending}
                    className="text-text-secondary hover:text-danger disabled:opacity-50"
                    aria-label="Удалить"
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
