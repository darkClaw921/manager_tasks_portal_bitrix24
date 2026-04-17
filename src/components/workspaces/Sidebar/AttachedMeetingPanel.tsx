'use client';

/**
 * "Attached meeting" info block for the workspace sidebar.
 *
 * Shows one of three states:
 *
 *   1. Workspace has a meetingId → render the meeting title (resolved
 *      via `useMeetingDetail`) with a "Открыть встречу" link. Owner
 *      gets a "Открепить" button (DELETE attach-meeting).
 *
 *   2. Workspace has no meetingId AND user is owner → "Привязать к
 *      встрече" select that lists the user's own meetings via
 *      `useMeetings`. Submitting POSTs attach-meeting.
 *
 *   3. Workspace has no meetingId AND user is NOT owner → render
 *      nothing (uninteresting noise).
 *
 * The component does its own optimistic state — on success it surfaces
 * a callback so the parent (`WorkspaceRoom`) can refresh the cached
 * workspace meta. We intentionally do not invalidate via TanStack
 * Query here to keep the file dependency-light; the WorkspaceRoom
 * page wrapper holds the cache.
 */

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMeetings, useMeetingDetail } from '@/hooks/useMeeting';
import { Button } from '@/components/ui/Button';

export interface AttachedMeetingPanelProps {
  workspaceId: number;
  /** Current `workspaces.meetingId` value (null when not attached). */
  meetingId: number | null;
  /** True when the viewer is the workspace owner (or admin). */
  isOwner: boolean;
  /**
   * Called after a successful attach/detach so the parent can refresh
   * its cached workspace meta. Receives the new `meetingId` value.
   */
  onChanged?: (newMeetingId: number | null) => void;
}

export function AttachedMeetingPanel({
  workspaceId,
  meetingId,
  isOwner,
  onChanged,
}: AttachedMeetingPanelProps) {
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (meetingId != null) {
    return (
      <AttachedView
        workspaceId={workspaceId}
        meetingId={meetingId}
        isOwner={isOwner}
        isMutating={isMutating}
        error={error}
        setIsMutating={setIsMutating}
        setError={setError}
        onChanged={onChanged}
      />
    );
  }

  if (!isOwner) return null;

  return (
    <DetachedView
      workspaceId={workspaceId}
      isMutating={isMutating}
      error={error}
      setIsMutating={setIsMutating}
      setError={setError}
      onChanged={onChanged}
    />
  );
}

// ==================== Sub-views ====================

interface SubViewCommon {
  workspaceId: number;
  isMutating: boolean;
  error: string | null;
  setIsMutating: (v: boolean) => void;
  setError: (v: string | null) => void;
  onChanged?: (newMeetingId: number | null) => void;
}

function AttachedView({
  workspaceId,
  meetingId,
  isOwner,
  isMutating,
  error,
  setIsMutating,
  setError,
  onChanged,
}: SubViewCommon & { meetingId: number; isOwner: boolean }) {
  const { data: meeting } = useMeetingDetail(meetingId);

  const onDetach = useCallback(async () => {
    if (!confirm('Открепить эту доску от встречи?')) return;
    setIsMutating(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/attach-meeting`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Ошибка ${res.status}`);
      }
      onChanged?.(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось открепить');
    } finally {
      setIsMutating(false);
    }
  }, [workspaceId, setIsMutating, setError, onChanged]);

  return (
    <div className="rounded-card border border-border bg-background p-2">
      <div className="text-xs uppercase tracking-wide text-text-secondary mb-1">
        Привязано к встрече
      </div>
      <Link
        href={`/meetings/${meetingId}`}
        className="block text-small font-medium text-primary hover:underline truncate"
      >
        {meeting?.title ?? `Встреча #${meetingId}`}
      </Link>
      {isOwner && (
        <div className="mt-2 flex gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onDetach}
            disabled={isMutating}
          >
            {isMutating ? '…' : 'Открепить'}
          </Button>
        </div>
      )}
      {error && (
        <div className="mt-1 text-xs text-danger">{error}</div>
      )}
    </div>
  );
}

function DetachedView({
  workspaceId,
  isMutating,
  error,
  setIsMutating,
  setError,
  onChanged,
}: SubViewCommon) {
  const [showPicker, setShowPicker] = useState(false);
  const [selected, setSelected] = useState<number | ''>('');
  const { data: meetings = [], isLoading } = useMeetings();

  // Sort by createdAt desc — most recent first.
  const sortedMeetings = useMemo(
    () => [...meetings].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [meetings]
  );

  const onAttach = useCallback(async () => {
    if (typeof selected !== 'number' || isMutating) return;
    setIsMutating(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/attach-meeting`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId: selected }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Ошибка ${res.status}`);
      }
      onChanged?.(selected);
      setShowPicker(false);
      setSelected('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось привязать');
    } finally {
      setIsMutating(false);
    }
  }, [workspaceId, selected, isMutating, setIsMutating, setError, onChanged]);

  return (
    <div className="rounded-card border border-border bg-background p-2">
      <div className="text-xs uppercase tracking-wide text-text-secondary mb-1">
        Встреча
      </div>
      {!showPicker ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setShowPicker(true)}
          className="w-full"
        >
          Привязать к встрече
        </Button>
      ) : (
        <div className="space-y-2">
          <select
            value={selected === '' ? '' : String(selected)}
            onChange={(e) =>
              setSelected(e.target.value === '' ? '' : Number(e.target.value))
            }
            disabled={isMutating || isLoading}
            className="w-full rounded-input border border-border bg-surface px-2 py-1.5 text-small focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
          >
            <option value="">— выберите встречу —</option>
            {sortedMeetings.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title || `Встреча #${m.id}`}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setShowPicker(false);
                setSelected('');
              }}
              disabled={isMutating}
            >
              Отмена
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={onAttach}
              disabled={isMutating || selected === ''}
            >
              {isMutating ? '…' : 'Привязать'}
            </Button>
          </div>
        </div>
      )}
      {error && <div className="mt-1 text-xs text-danger">{error}</div>}
    </div>
  );
}
