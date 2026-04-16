'use client';

/**
 * Guest join page (`/meetings/guest/[token]`).
 *
 * Public landing. Fetches meeting summary via
 * `GET /api/meetings/guest/[token]`. When the user submits a display name
 * we mint a LiveKit token via `POST /api/meetings/guest/[token]/token` and
 * render `<MeetingRoom>` — same component used by authenticated users.
 *
 * No account, no session. `userId` passed to MeetingRoom is 0 (used only
 * for drawing echo-dedupe; guests still receive drawings but cannot be
 * mistaken for another participant because LiveKit identities are unique).
 */

import { useCallback, useEffect, useState, use } from 'react';
import { Button } from '@/components/ui/Button';
import { InputField } from '@/components/ui/InputField';
import { MeetingRoom } from '@/components/meetings/MeetingRoom';

interface MeetingSummary {
  meetingId: number;
  title: string;
  status: 'scheduled' | 'live' | 'ended';
}

interface GuestJoinResult {
  token: string;
  url: string;
  roomName: string;
  identity: string;
  displayName: string;
  meetingId: number;
  title: string;
}

export default function GuestMeetingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);

  const [summary, setSummary] = useState<MeetingSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [displayName, setDisplayName] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joined, setJoined] = useState<GuestJoinResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/meetings/guest/${encodeURIComponent(token)}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const message =
            (body as { message?: string }).message ??
            'Не удалось загрузить встречу';
          if (!cancelled) setSummaryError(message);
          return;
        }
        const json = await res.json();
        if (!cancelled) setSummary(json.data as MeetingSummary);
      } catch (err) {
        if (!cancelled) {
          setSummaryError(err instanceof Error ? err.message : 'Сетевая ошибка');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleJoin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = displayName.trim();
      if (!trimmed) {
        setJoinError('Введите имя');
        return;
      }
      setJoinError(null);
      setJoining(true);
      try {
        const res = await fetch(`/api/meetings/guest/${encodeURIComponent(token)}/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ displayName: trimmed }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const message =
            (body as { message?: string }).message ??
            'Не удалось подключиться';
          setJoinError(message);
          return;
        }
        const json = await res.json();
        setJoined(json.data as GuestJoinResult);
      } catch (err) {
        setJoinError(err instanceof Error ? err.message : 'Сетевая ошибка');
      } finally {
        setJoining(false);
      }
    },
    [displayName, token]
  );

  if (joined) {
    return (
      <div className="h-screen w-screen bg-background">
        <MeetingRoom
          meetingId={joined.meetingId}
          token={joined.token}
          url={joined.url}
          isHost={false}
          userId={0}
          onLeft={() => setJoined(null)}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="rounded-card bg-surface px-6 py-4 text-body shadow-card">
          Загрузка встречи…
        </div>
      </div>
    );
  }

  if (summaryError || !summary) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="flex flex-col items-center gap-3 rounded-card bg-surface px-6 py-6 text-body shadow-card">
          <h1 className="text-h2 font-semibold">Нет доступа</h1>
          <p className="text-text-secondary">
            {summaryError ?? 'Ссылка недействительна'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <form
        onSubmit={handleJoin}
        className="flex w-full max-w-md flex-col gap-4 rounded-card bg-surface p-6 shadow-card"
      >
        <div className="flex flex-col gap-1">
          <span className="text-small uppercase tracking-wide text-text-secondary">
            Встреча
          </span>
          <h1 className="text-h2 font-semibold text-foreground">{summary.title}</h1>
        </div>

        <InputField
          label="Ваше имя"
          placeholder="Например, Иван Петров"
          value={displayName}
          onChange={(e) => {
            setDisplayName(e.target.value);
            if (joinError) setJoinError(null);
          }}
          error={joinError ?? undefined}
          maxLength={60}
          autoFocus
        />

        <Button type="submit" variant="primary" disabled={joining}>
          {joining ? 'Подключение…' : 'Войти как гость'}
        </Button>
      </form>
    </div>
  );
}
