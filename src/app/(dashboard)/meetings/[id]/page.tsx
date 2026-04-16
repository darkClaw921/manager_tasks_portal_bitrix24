'use client';

/**
 * Meeting room page (`/meetings/[id]`).
 *
 * Auth: the top-level middleware redirects unauthenticated users to /login
 * for any `/meetings/*` path. Join permission is enforced by
 * `POST /api/meetings/[id]/token` — the token call returns 403 for users
 * the backend's `canJoinMeeting` check rejects, and we surface the backend
 * message verbatim.
 *
 * `isHost` is resolved via `useMeetingDetail(id)`: the meeting detail
 * carries `hostId`, which we compare with `/api/auth/me`. The MeetingRoom
 * component uses `isHost` to gate the "start/stop recording" control.
 */

import { useEffect, useMemo, useRef, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import {
  useMeetingDetail,
  useMeetingToken,
  useRemoveMeetingParticipant,
  useMeetingInviteLinks,
  useCreateInviteLink,
  useRevokeInviteLink,
} from '@/hooks/useMeeting';
import { useToast } from '@/components/ui/Toast';
import { MeetingRoom } from '@/components/meetings/MeetingRoom';
import { InviteParticipantsModal } from '@/components/meetings/InviteParticipantsModal';
import { GuestInviteLinksModal } from '@/components/meetings/GuestInviteLinksModal';

interface CurrentUser {
  userId: number;
  firstName: string;
  lastName: string;
  isAdmin: boolean;
}

async function fetchCurrentUser(): Promise<CurrentUser | null> {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) return null;
    const json = await res.json();
    const u = json?.user;
    if (!u) return null;
    return {
      userId: u.userId ?? u.id,
      firstName: u.firstName ?? '',
      lastName: u.lastName ?? '',
      isAdmin: Boolean(u.isAdmin),
    };
  } catch {
    return null;
  }
}

function parseMeetingId(raw: string): number | null {
  const n = parseInt(raw, 10);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

export default function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const meetingId = parseMeetingId(id);

  const [user, setUser] = useState<CurrentUser | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    fetchCurrentUser().then((u) => {
      if (!cancelled) setUser(u);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const { data: detail, isLoading: detailLoading, isError: detailError, error: detailErr } =
    useMeetingDetail(meetingId);

  const tokenMutation = useMeetingToken(meetingId ?? 0);
  // Trigger the token issue exactly once per page visit once the user is known.
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    if (!meetingId || !user) return;
    startedRef.current = true;
    tokenMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId, user]);

  const isHost = useMemo(() => {
    if (!user || !detail) return false;
    return detail.hostId === user.userId;
  }, [user, detail]);

  const handleLeave = () => {
    router.push('/meetings');
  };

  // Invalid id → 404-ish screen.
  if (meetingId == null) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="rounded-card bg-surface px-6 py-4 text-body text-text-secondary">
          Встреча не найдена.
        </div>
      </div>
    );
  }

  // Still loading the current user or meeting detail.
  if (user === undefined || detailLoading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="rounded-card bg-surface px-6 py-4 text-body">
          Загрузка встречи…
        </div>
      </div>
    );
  }

  if (detailError) {
    const msg = detailErr instanceof Error ? detailErr.message : 'Не удалось загрузить встречу';
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6">
        <h2 className="text-h2 font-semibold">Не удалось открыть встречу</h2>
        <p className="text-body text-text-secondary">{msg}</p>
        <Button type="button" variant="secondary" onClick={handleLeave}>
          К списку встреч
        </Button>
      </div>
    );
  }

  if (tokenMutation.isError) {
    const msg =
      tokenMutation.error instanceof Error
        ? tokenMutation.error.message
        : 'Не удалось получить токен доступа';
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6">
        <h2 className="text-h2 font-semibold">Подключение невозможно</h2>
        <p className="text-body text-text-secondary">{msg}</p>
        <div className="flex gap-2">
          <Button type="button" variant="primary" onClick={() => tokenMutation.mutate()}>
            Повторить
          </Button>
          <Button type="button" variant="secondary" onClick={handleLeave}>
            К списку встреч
          </Button>
        </div>
      </div>
    );
  }

  // `user` is `null` when /api/auth/me returned a non-OK response. Bail to
  // the leave handler so the user lands on a known-good screen.
  if (user === null) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6">
        <h2 className="text-h2 font-semibold">Требуется вход</h2>
        <p className="text-body text-text-secondary">
          Не удалось определить текущего пользователя.
        </p>
        <Button type="button" variant="secondary" onClick={handleLeave}>
          К списку встреч
        </Button>
      </div>
    );
  }

  const tokenData = tokenMutation.data;
  if (!tokenData || tokenMutation.isPending) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="rounded-card bg-surface px-6 py-4 text-body">
          Подключение к LiveKit…
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-120px)] w-full flex-col gap-2">
      {isHost && (
        <InviteParticipantsHeader
          meetingId={meetingId}
          existingUserIds={(detail?.participants ?? []).map((p) => p.userId)}
          participants={detail?.participants ?? []}
          hostId={detail?.hostId ?? null}
        />
      )}
      <div className="min-h-0 flex-1">
        <MeetingRoom
          meetingId={meetingId}
          token={tokenData.token}
          url={tokenData.url}
          isHost={isHost}
          userId={user.userId}
          onLeft={handleLeave}
        />
      </div>
    </div>
  );
}

interface InviteParticipantsHeaderProps {
  meetingId: number;
  existingUserIds: number[];
  participants: Array<{ userId: number; userName: string | null }>;
  hostId: number | null;
}

function InviteParticipantsHeader({
  meetingId,
  existingUserIds,
  participants,
  hostId,
}: InviteParticipantsHeaderProps) {
  const [open, setOpen] = useState(false);
  const [guestOpen, setGuestOpen] = useState(false);
  const remove = useRemoveMeetingParticipant(meetingId);
  const { toast } = useToast();

  const handleRemove = async (userId: number) => {
    try {
      await remove.mutateAsync(userId);
      toast('success', 'Участник удалён');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось удалить';
      toast('error', message);
    }
  };

  const nonHost = participants.filter((p) => p.userId !== hostId);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-card bg-surface p-3 shadow-card">
        <Button type="button" variant="primary" size="sm" onClick={() => setOpen(true)}>
          Пригласить
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => setGuestOpen(true)}>
          Ссылка для гостей
        </Button>
        <span className="text-small text-text-secondary">
          Приглашённые ({nonHost.length}):
        </span>
        {nonHost.length === 0 && (
          <span className="text-small text-text-secondary">пока никого</span>
        )}
        {nonHost.map((p) => (
          <span
            key={p.userId}
            className="inline-flex items-center gap-1 rounded-input bg-background px-2 py-1 text-small"
          >
            {p.userName ?? `#${p.userId}`}
            <button
              type="button"
              onClick={() => handleRemove(p.userId)}
              disabled={remove.isPending}
              className="text-text-secondary hover:text-danger disabled:opacity-50"
              aria-label="Удалить"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <InviteParticipantsModal
        meetingId={meetingId}
        open={open}
        onClose={() => setOpen(false)}
        existingUserIds={existingUserIds}
      />
      <GuestInviteLinksModal
        meetingId={meetingId}
        open={guestOpen}
        onClose={() => setGuestOpen(false)}
      />
    </>
  );
}
