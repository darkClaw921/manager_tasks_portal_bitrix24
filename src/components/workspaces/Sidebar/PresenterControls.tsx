'use client';

/**
 * Sidebar control card for workspace presenter mode.
 *
 * Shows:
 *   - When NO presenter is active: a "Стать презентером" button (always
 *     enabled). For owners we hint that they're sharing their viewport.
 *   - When SOMEONE ELSE is presenting: a "Следовать за <name>" / "Перестать
 *     следовать" toggle.
 *   - When WE are presenting: a "Прекратить презентацию" button.
 */

import { useMemo } from 'react';
import { useWorkspaceParticipants } from '@/hooks/useWorkspace';
import type { UseWorkspacePresenterResult } from '@/hooks/useWorkspacePresenter';

export interface PresenterControlsProps {
  workspaceId: number;
  presenter: UseWorkspacePresenterResult;
  /** Local user id. */
  currentUserId: number;
  /**
   * Whether the local user is the workspace owner. The plan calls out
   * "owner can enable" — we surface a subtle hint for non-owners but still
   * allow anyone to present (the plan is loose on enforcement). The
   * presenter UI is purely opt-in on both sides, so no harm.
   */
  isOwner?: boolean;
}

export function PresenterControls({
  workspaceId,
  presenter,
  currentUserId,
  isOwner = false,
}: PresenterControlsProps) {
  const { data: participants } = useWorkspaceParticipants(workspaceId);

  const userById = useMemo(() => {
    const out = new Map<number, string>();
    for (const p of participants ?? []) {
      out.set(p.userId, p.userName ?? `user#${p.userId}`);
    }
    return out;
  }, [participants]);

  const presenterName = (id: number) => userById.get(id) ?? `user#${id}`;

  return (
    <div className="rounded-card bg-surface border border-border p-3 flex flex-col gap-2">
      <div className="text-small font-semibold">Режим презентера</div>

      {presenter.isPresenting ? (
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-text-secondary">
            Вы транслируете свой viewport.
          </div>
          <button
            type="button"
            onClick={presenter.stopPresenting}
            className="text-xs px-2 py-1 rounded-input bg-danger/10 text-danger hover:bg-danger/20"
          >
            Прекратить
          </button>
        </div>
      ) : presenter.isFollowing && presenter.followingUserId ? (
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-text-secondary">
            Следуем за <span className="font-medium text-foreground">{presenterName(presenter.followingUserId)}</span>
          </div>
          <button
            type="button"
            onClick={presenter.stopFollowing}
            className="text-xs px-2 py-1 rounded-input bg-background text-foreground border border-border hover:bg-surface"
          >
            Выйти
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {presenter.lastSeenPresenterId &&
            presenter.lastSeenPresenterId !== currentUserId && (
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-text-secondary">
                  <span className="font-medium text-foreground">{presenterName(presenter.lastSeenPresenterId)}</span> презентует
                </div>
                <button
                  type="button"
                  onClick={presenter.startFollowing}
                  className="text-xs px-2 py-1 rounded-input bg-primary/10 text-primary hover:bg-primary/20"
                >
                  Следовать
                </button>
              </div>
            )}
          <button
            type="button"
            onClick={presenter.startPresenting}
            className="text-xs px-3 py-1.5 rounded-input bg-primary text-text-inverse hover:opacity-90 self-start"
            title={isOwner ? 'Стать презентером — все увидят ваш viewport' : 'Стать презентером — другие участники могут начать следовать'}
          >
            Стать презентером
          </button>
        </div>
      )}
    </div>
  );
}
