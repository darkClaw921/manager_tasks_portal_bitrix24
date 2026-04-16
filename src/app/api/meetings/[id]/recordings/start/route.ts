import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { isHost } from '@/lib/meetings/access';
import { getMeeting } from '@/lib/meetings/meetings';
import { startRecording, EgressClientError } from '@/lib/meetings/egress-client';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/meetings/[id]/recordings/start
 *
 * Proxy to the meeting-worker that starts egress for the given meeting.
 *
 * Access: host only. App admins are NOT allowed to start recordings on a
 * meeting they do not own — recording is an explicit host-driven action.
 * 401 unauthenticated, 403 non-host, 404 missing meeting, 502 worker error.
 *
 * Response: `{ data: StartRecordingResponse }` on success.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { id } = await context.params;
    const meetingId = parseInt(id, 10);
    if (!Number.isInteger(meetingId) || meetingId <= 0) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid meeting id' },
        { status: 400 }
      );
    }

    const meeting = getMeeting(meetingId);
    if (!meeting) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Meeting not found' },
        { status: 404 }
      );
    }

    const host = await isHost(auth.user.userId, meetingId);
    if (!host) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Only the meeting host can start recording' },
        { status: 403 }
      );
    }

    try {
      const result = await startRecording(meetingId, meeting.roomName);
      return NextResponse.json({ data: result });
    } catch (err) {
      if (err instanceof EgressClientError) {
        console.error('[meetings/[id]/recordings/start] worker error:', err.message);
        return NextResponse.json(
          { error: 'BadGateway', message: err.message },
          { status: 502 }
        );
      }
      throw err;
    }
  } catch (error) {
    console.error('[meetings/[id]/recordings/start] error:', error);
    const message = error instanceof Error ? error.message : 'Failed to start recording';
    return NextResponse.json(
      { error: 'Internal', message },
      { status: 500 }
    );
  }
}
