'use client';

/**
 * Workspace room page (`/workspaces/[id]`).
 *
 * Mirrors the meeting page: resolves the current user, mints the LiveKit
 * token, then mounts `<WorkspaceRoom />`. The invite-modal lives here so
 * the sidebar's "Invite" button can open it without having to plumb the
 * modal state down from the page wrapper into the sidebar through the room.
 */

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import {
  useWorkspace,
  useWorkspaceToken,
} from '@/hooks/useWorkspace';
import { WorkspaceRoom } from '@/components/workspaces/WorkspaceRoom';
import { InviteParticipantsModal } from '@/components/workspaces/InviteParticipantsModal';

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

function parseWorkspaceId(raw: string): number | null {
  const n = parseInt(raw, 10);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

export default function WorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const wsId = parseWorkspaceId(id);

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

  const { data: detail, isLoading, isError, error } = useWorkspace(wsId);

  const tokenMutation = useWorkspaceToken(wsId ?? 0);
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    if (!wsId || !user) return;
    startedRef.current = true;
    tokenMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId, user]);

  const isOwner = useMemo(() => {
    if (!user || !detail) return false;
    return detail.ownerId === user.userId || user.isAdmin;
  }, [user, detail]);

  const queryClient = useQueryClient();
  const onAttachedMeetingChange = useCallback(() => {
    if (typeof wsId !== 'number') return;
    queryClient.invalidateQueries({ queryKey: ['workspaces', wsId] });
    queryClient.invalidateQueries({ queryKey: ['workspaces'] });
  }, [queryClient, wsId]);

  const userName = useMemo(() => {
    if (!user) return '';
    return `${user.firstName} ${user.lastName}`.trim() || `User #${user.userId}`;
  }, [user]);

  const [inviteOpen, setInviteOpen] = useState(false);

  const handleLeave = () => {
    router.push('/workspaces');
  };

  if (wsId == null) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="rounded-card bg-surface px-6 py-4 text-body text-text-secondary">
          Доска не найдена.
        </div>
      </div>
    );
  }

  if (user === undefined || isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="rounded-card bg-surface px-6 py-4 text-body">
          Загрузка доски…
        </div>
      </div>
    );
  }

  if (isError) {
    const msg = error instanceof Error ? error.message : 'Не удалось загрузить доску';
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6">
        <h2 className="text-h2 font-semibold">Не удалось открыть доску</h2>
        <p className="text-body text-text-secondary">{msg}</p>
        <Button type="button" variant="secondary" onClick={handleLeave}>
          К списку досок
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
            К списку досок
          </Button>
        </div>
      </div>
    );
  }

  if (user === null) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6">
        <h2 className="text-h2 font-semibold">Требуется вход</h2>
        <p className="text-body text-text-secondary">
          Не удалось определить текущего пользователя.
        </p>
        <Button type="button" variant="secondary" onClick={handleLeave}>
          К списку досок
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
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-card bg-surface p-3 shadow-card">
        <div className="min-w-0">
          <h1 className="truncate text-h3 font-semibold text-foreground">
            {detail?.title ?? 'Доска'}
          </h1>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={handleLeave}>
          К списку
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <WorkspaceRoom
          workspaceId={wsId}
          userId={user.userId}
          userName={userName}
          isOwner={isOwner}
          ownerId={detail?.ownerId ?? null}
          attachedMeetingId={detail?.meetingId ?? null}
          onAttachedMeetingChange={onAttachedMeetingChange}
          token={tokenData.token}
          url={tokenData.url}
          onInvite={() => setInviteOpen(true)}
        />
      </div>
      <InviteParticipantsModal
        workspaceId={wsId}
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        existingUserIds={(detail?.participants ?? []).map((p) => p.userId)}
      />
    </div>
  );
}
