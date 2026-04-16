'use client';

/**
 * Modal dialog for inviting users to a meeting. Host-only UI: render it
 * behind an `isHost` guard. Lists all other users fetched from
 * `/api/meetings/invitable-users`, pre-filters out users already present
 * in `existingUserIds`, and posts selected ids to `POST /api/meetings/[id]/participants`.
 */

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { InputField } from '@/components/ui/InputField';
import { useToast } from '@/components/ui/Toast';
import {
  useInvitableUsers,
  useInviteMeetingParticipants,
} from '@/hooks/useMeeting';

interface InviteParticipantsModalProps {
  meetingId: number;
  open: boolean;
  onClose: () => void;
  existingUserIds: number[];
}

function CloseIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}

export function InviteParticipantsModal({
  meetingId,
  open,
  onClose,
  existingUserIds,
}: InviteParticipantsModalProps) {
  const { data: users, isLoading, isError } = useInvitableUsers(open);
  const invite = useInviteMeetingParticipants(meetingId);
  const { toast } = useToast();

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const existing = useMemo(() => new Set(existingUserIds), [existingUserIds]);

  const filtered = useMemo(() => {
    const all = users ?? [];
    const q = query.trim().toLowerCase();
    return all
      .filter((u) => !existing.has(u.id))
      .filter((u) => {
        if (!q) return true;
        const name = `${u.firstName} ${u.lastName}`.toLowerCase();
        return name.includes(q);
      });
  }, [users, existing, query]);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (selected.size === 0) return;
    try {
      await invite.mutateAsync(Array.from(selected));
      toast('success', 'Приглашения отправлены');
      setSelected(new Set());
      setQuery('');
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось пригласить';
      toast('error', message);
    }
  };

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="fixed inset-x-4 top-20 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-md bg-surface rounded-modal shadow-xl z-50 flex flex-col overflow-hidden max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-h3 font-semibold text-foreground">Пригласить участников</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-text-secondary hover:text-foreground transition-colors rounded-input hover:bg-background"
            aria-label="Закрыть"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="px-5 py-4 border-b border-border">
          <InputField
            placeholder="Поиск по имени…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {isLoading && (
            <div className="px-3 py-4 text-body text-text-secondary">Загрузка…</div>
          )}
          {isError && (
            <div className="px-3 py-4 text-body text-danger">
              Не удалось загрузить список пользователей
            </div>
          )}
          {!isLoading && !isError && filtered.length === 0 && (
            <div className="px-3 py-4 text-body text-text-secondary">
              Нет доступных пользователей
            </div>
          )}
          {!isLoading && !isError && filtered.map((u) => {
            const checked = selected.has(u.id);
            return (
              <label
                key={u.id}
                className="flex items-center gap-3 px-3 py-2 rounded-input hover:bg-background cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(u.id)}
                  className="rounded border-border bg-surface text-primary focus:ring-primary/20"
                />
                <span className="text-body text-foreground">
                  {u.firstName} {u.lastName}
                </span>
              </label>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <Button type="button" variant="ghost" onClick={onClose} disabled={invite.isPending}>
            Отмена
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={selected.size === 0 || invite.isPending}
            onClick={handleSubmit}
          >
            {invite.isPending ? 'Отправка…' : `Пригласить (${selected.size})`}
          </Button>
        </div>
      </div>
    </>
  );
}
