'use client';

/**
 * Meetings list + create page (`/meetings`).
 *
 * Route protection: the top-level `src/middleware.ts` already redirects
 * unauthenticated requests to `/login` for the `/meetings` prefix. We rely
 * on the API layer (canJoinMeeting + requireAuth) to scope the returned
 * list to the caller.
 *
 * Layout mirrors the wallet/payments pages: header with icon title, primary
 * CTA on the right, then either a skeleton, an empty state, or a card grid.
 */

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { InputField } from '@/components/ui/InputField';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useMeetings, useCreateMeeting } from '@/hooks/useMeeting';
import type { Meeting, MeetingStatus } from '@/types/meeting';

function MeetingsIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}

function RecordingDotIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
      <circle cx="12" cy="12" r="6" />
    </svg>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

const STATUS_LABEL: Record<MeetingStatus, string> = {
  scheduled: 'Запланирована',
  live: 'В эфире',
  ended: 'Завершена',
};

function statusBadgeVariant(status: MeetingStatus): 'success' | 'warning' | 'default' {
  if (status === 'live') return 'success';
  if (status === 'scheduled') return 'warning';
  return 'default';
}

interface CreateMeetingDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (meeting: Meeting) => void;
}

/**
 * Modal dialog: title + recordingEnabled checkbox. On submit calls
 * useCreateMeeting and propagates the new meeting upward.
 */
function CreateMeetingDialog({ open, onClose, onCreated }: CreateMeetingDialogProps) {
  const [title, setTitle] = useState('');
  const [recordingEnabled, setRecordingEnabled] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const createMeeting = useCreateMeeting();
  const { toast } = useToast();

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = title.trim();
      if (!trimmed) {
        setValidationError('Введите название встречи');
        return;
      }
      setValidationError(null);

      try {
        const meeting = await createMeeting.mutateAsync({
          title: trimmed,
          recordingEnabled,
        });
        toast('success', 'Встреча создана');
        onCreated(meeting);
        setTitle('');
        setRecordingEnabled(false);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Не удалось создать встречу';
        toast('error', message);
      }
    },
    [title, recordingEnabled, createMeeting, toast, onCreated]
  );

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="fixed inset-x-4 top-20 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-md bg-surface rounded-modal shadow-xl z-50 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-h3 font-semibold text-foreground">Создать встречу</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-text-secondary hover:text-foreground transition-colors rounded-input hover:bg-background"
            aria-label="Закрыть"
          >
            <CloseIcon />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <InputField
            label="Название"
            placeholder="Например, «Планёрка отдела разработки»"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (validationError) setValidationError(null);
            }}
            error={validationError ?? undefined}
            autoFocus
            maxLength={200}
          />

          <label className="flex items-center gap-2 text-small text-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={recordingEnabled}
              onChange={(e) => setRecordingEnabled(e.target.checked)}
              className="rounded border-border bg-surface text-primary focus:ring-primary/20 cursor-pointer"
            />
            <span>Разрешить запись (хост может включать/выключать во время встречи)</span>
          </label>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={createMeeting.isPending}>
              Отмена
            </Button>
            <Button type="submit" variant="primary" disabled={createMeeting.isPending}>
              {createMeeting.isPending ? 'Создание…' : 'Создать'}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}

interface MeetingCardProps {
  meeting: Meeting;
  onJoin: (id: number) => void;
}

function MeetingCard({ meeting, onJoin }: MeetingCardProps) {
  const status = meeting.status as MeetingStatus;
  const canJoin = status !== 'ended';

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-sm hover:shadow transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-body font-semibold text-foreground">{meeting.title}</h3>
          <p className="mt-0.5 text-xs text-text-secondary">
            Создана {formatDate(meeting.createdAt)}
          </p>
          {meeting.startedAt && (
            <p className="text-xs text-text-secondary">
              Начата {formatDate(meeting.startedAt)}
            </p>
          )}
          {meeting.endedAt && (
            <p className="text-xs text-text-secondary">
              Завершена {formatDate(meeting.endedAt)}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge variant={statusBadgeVariant(status)} size="sm">
            {STATUS_LABEL[status]}
          </Badge>
          {meeting.recordingEnabled && (
            <span className="inline-flex items-center gap-1 text-xs text-danger">
              <RecordingDotIcon />
              Запись
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end">
        {status === 'ended' ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onJoin(meeting.id)}
          >
            Открыть записи
          </Button>
        ) : (
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => onJoin(meeting.id)}
            disabled={!canJoin}
          >
            Войти
          </Button>
        )}
      </div>
    </div>
  );
}

export default function MeetingsPage() {
  const router = useRouter();
  const { data, isLoading, isError, error, refetch } = useMeetings();
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleOpenDialog = useCallback(() => setDialogOpen(true), []);
  const handleCloseDialog = useCallback(() => setDialogOpen(false), []);

  const handleJoin = useCallback(
    (id: number) => {
      router.push(`/meetings/${id}`);
    },
    [router]
  );

  const handleOpenRecordings = useCallback(
    (id: number) => {
      router.push(`/meetings/${id}/recordings`);
    },
    [router]
  );

  const handleCreated = useCallback(
    (meeting: Meeting) => {
      setDialogOpen(false);
      router.push(`/meetings/${meeting.id}`);
    },
    [router]
  );

  const meetings = useMemo(() => data ?? [], [data]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-card bg-primary-light flex items-center justify-center text-primary">
            <MeetingsIcon />
          </div>
          <div>
            <h1 className="text-h2 font-bold text-foreground">Встречи</h1>
            <p className="text-small text-text-secondary">
              Видеовстречи с демонстрацией экрана и записью
            </p>
          </div>
        </div>
        <Button variant="primary" size="sm" onClick={handleOpenDialog}>
          Создать встречу
        </Button>
      </div>

      {/* Error state */}
      {isError && (
        <div className="rounded-card border border-danger bg-red-50 p-3 text-body text-danger">
          {error instanceof Error ? error.message : 'Не удалось загрузить встречи'}
          <div className="mt-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => refetch()}>
              Повторить
            </Button>
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && meetings.length === 0 && (
        <EmptyState
          title="Встреч ещё нет"
          description="Создайте первую встречу, чтобы пригласить коллег"
          actionLabel="Создать встречу"
          onAction={handleOpenDialog}
        />
      )}

      {/* Grid of meetings */}
      {!isLoading && meetings.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {meetings.map((meeting) => (
            <MeetingCard
              key={meeting.id}
              meeting={meeting}
              onJoin={(meeting.status as MeetingStatus) === 'ended' ? handleOpenRecordings : handleJoin}
            />
          ))}
        </div>
      )}

      <CreateMeetingDialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        onCreated={handleCreated}
      />
    </div>
  );
}
