'use client';

/**
 * Meeting recordings page (`/meetings/[id]/recordings`).
 *
 * Auth: middleware redirects unauthenticated users to /login. The
 * `GET /api/meetings/[id]/recordings` endpoint (hit by `useMeetingRecordings`)
 * enforces `canJoinMeeting` and returns 403 to non-participants — we render
 * that message verbatim. `RecordingsList` itself polls the manifest while
 * the post-mux worker is still processing.
 *
 * The page header also carries a "Создать задачу" CTA: it seeds
 * `createTaskPrefill` in `useUIStore` with title/description that reference
 * this meeting, then opens the `CreateTaskModal` (already mounted at the
 * dashboard-layout level). The modal clears the prefill on close.
 */

import { use } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { RecordingsList } from '@/components/meetings/RecordingsList';
import { useUIStore } from '@/stores/ui-store';

function parseMeetingId(raw: string): number | null {
  const n = parseInt(raw, 10);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function BackIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

export default function MeetingRecordingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const meetingId = parseMeetingId(id);
  const setCreateTaskPrefill = useUIStore((s) => s.setCreateTaskPrefill);
  const openModal = useUIStore((s) => s.openModal);

  if (meetingId == null) {
    return (
      <div className="space-y-4">
        <div className="rounded-card bg-surface p-4 text-body text-text-secondary">
          Встреча не найдена.
        </div>
        <Link href="/meetings">
          <Button type="button" variant="secondary" size="sm">
            К списку встреч
          </Button>
        </Link>
      </div>
    );
  }

  const handleCreateTask = () => {
    // Seed the prefill just before opening. CreateTaskModal reads it once
    // via a useEffect + latch, then clears it on close (see ncm.4 changes
    // in src/components/tasks/CreateTaskModal.tsx).
    setCreateTaskPrefill({
      title: `Задача из встречи №${meetingId}`,
      description: `Источник: /meetings/${meetingId}/recordings`,
    });
    openModal('createTask');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/meetings"
          className="inline-flex items-center gap-1.5 text-small text-text-secondary hover:text-foreground transition-colors"
        >
          <BackIcon />
          К списку встреч
        </Link>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleCreateTask}
          >
            <PlusIcon />
            <span className="hidden sm:inline">Создать задачу</span>
          </Button>
          <Link href={`/meetings/${meetingId}`}>
            <Button type="button" variant="ghost" size="sm">
              Открыть встречу
            </Button>
          </Link>
        </div>
      </div>
      <RecordingsList meetingId={meetingId} />
    </div>
  );
}
