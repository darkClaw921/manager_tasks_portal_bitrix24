'use client';

/**
 * Meeting recordings page (`/meetings/[id]/recordings`).
 *
 * Auth: middleware redirects unauthenticated users to /login. The
 * `GET /api/meetings/[id]/recordings` endpoint (hit by `useMeetingRecordings`)
 * enforces `canJoinMeeting` and returns 403 to non-participants — we render
 * that message verbatim. `RecordingsList` itself polls the manifest while
 * the post-mux worker is still processing.
 */

import { use } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { RecordingsList } from '@/components/meetings/RecordingsList';

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

export default function MeetingRecordingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const meetingId = parseMeetingId(id);

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
        <Link href={`/meetings/${meetingId}`}>
          <Button type="button" variant="ghost" size="sm">
            Открыть встречу
          </Button>
        </Link>
      </div>
      <RecordingsList meetingId={meetingId} />
    </div>
  );
}
