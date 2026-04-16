import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { canJoinMeeting, isHost } from '@/lib/meetings/access';
import { getMeetingDetail, endMeeting } from '@/lib/meetings/meetings';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/meetings/[id]
 *
 * Returns the meeting detail (including participants list) for any user
 * allowed to join it (`canJoinMeeting`). 403 otherwise. 404 if missing.
 * Response: `{ data: MeetingDetail }`.
 */
export async function GET(request: NextRequest, context: RouteContext) {
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

    const detail = getMeetingDetail(meetingId);
    if (!detail) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Meeting not found' },
        { status: 404 }
      );
    }

    const allowed = await canJoinMeeting(auth.user.userId, meetingId);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'You do not have access to this meeting' },
        { status: 403 }
      );
    }

    return NextResponse.json({ data: detail });
  } catch (error) {
    console.error('[meetings/[id]] GET error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to fetch meeting' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/meetings/[id]
 *
 * Ends the meeting. Only the host (or an app-admin) may end it.
 * Triggers `endMeeting` which flips status to `ended` and asks the
 * meeting-worker to stop any active egress.
 * Response: `{ data: Meeting }`.
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
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

    const host = await isHost(auth.user.userId, meetingId);
    if (!host && !auth.user.isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Only the meeting host can end the meeting' },
        { status: 403 }
      );
    }

    const updated = await endMeeting(meetingId);
    if (!updated) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Meeting not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error('[meetings/[id]] DELETE error:', error);
    const message = error instanceof Error ? error.message : 'Failed to end meeting';
    return NextResponse.json(
      { error: 'Internal', message },
      { status: 500 }
    );
  }
}
