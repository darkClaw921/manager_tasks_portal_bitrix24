import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { isHost } from '@/lib/meetings/access';
import { removeParticipant, getMeeting } from '@/lib/meetings/meetings';

type RouteContext = { params: Promise<{ id: string; userId: string }> };

/**
 * DELETE /api/meetings/[id]/participants/[userId]
 *
 * Remove a user from the meeting's participant list. Only the host or an
 * app-admin may remove participants. The host cannot be removed.
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { id, userId } = await context.params;
    const meetingId = parseInt(id, 10);
    const targetUserId = parseInt(userId, 10);
    if (!Number.isInteger(meetingId) || meetingId <= 0) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid meeting id' },
        { status: 400 }
      );
    }
    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid user id' },
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
    if (!host && !auth.user.isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Only the meeting host can remove participants' },
        { status: 403 }
      );
    }

    try {
      removeParticipant(meetingId, targetUserId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove participant';
      return NextResponse.json(
        { error: 'Validation', message },
        { status: 400 }
      );
    }

    return NextResponse.json({ data: { removed: true } });
  } catch (error) {
    console.error('[meetings/[id]/participants/[userId]] DELETE error:', error);
    const message = error instanceof Error ? error.message : 'Failed to remove participant';
    return NextResponse.json({ error: 'Internal', message }, { status: 500 });
  }
}
