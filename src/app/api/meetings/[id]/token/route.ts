import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { canJoinMeeting } from '@/lib/meetings/access';
import {
  getMeeting,
  addParticipant,
  markParticipantJoined,
} from '@/lib/meetings/meetings';
import { issueLiveKitToken } from '@/lib/meetings/tokens';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/meetings/[id]/token
 *
 * Mint a LiveKit access token for the current user to join the meeting.
 * Side effects:
 *   - Upserts a `meeting_participants` row (idempotent).
 *   - Advances meeting status to `live` on first join.
 *
 * Returns `{ data: { token: string, url: string } }` where `url` is the
 * public LiveKit WebSocket URL the browser should connect to.
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

    if (meeting.status === 'ended') {
      return NextResponse.json(
        { error: 'Conflict', message: 'Meeting has already ended' },
        { status: 409 }
      );
    }

    const allowed = await canJoinMeeting(auth.user.userId, meetingId);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'You do not have access to this meeting' },
        { status: 403 }
      );
    }

    // Resolve display name. Falls back to email if firstName/lastName empty.
    const userRow = db
      .select({
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      })
      .from(users)
      .where(eq(users.id, auth.user.userId))
      .get();
    const userName = userRow
      ? `${userRow.firstName} ${userRow.lastName}`.trim() || userRow.email
      : auth.user.email;

    const hostFlag = meeting.hostId === auth.user.userId;

    // Idempotent participant upsert. For the host, this ensures the row
    // exists even if createMeeting was bypassed in some fixture scenario.
    addParticipant(meetingId, auth.user.userId, hostFlag ? 'host' : 'participant');
    // Register actual join / flip meeting → live.
    markParticipantJoined(meetingId, auth.user.userId, {
      role: hostFlag ? 'host' : 'participant',
    });

    const token = await issueLiveKitToken({
      userId: auth.user.userId,
      userName,
      roomName: meeting.roomName,
      isHost: hostFlag,
    });

    const publicUrl =
      process.env.NEXT_PUBLIC_LIVEKIT_URL ||
      process.env.LIVEKIT_URL ||
      '';

    return NextResponse.json({
      data: {
        token,
        url: publicUrl,
        roomName: meeting.roomName,
      },
    });
  } catch (error) {
    console.error('[meetings/[id]/token] POST error:', error);
    const message = error instanceof Error ? error.message : 'Failed to issue token';
    return NextResponse.json(
      { error: 'Internal', message },
      { status: 500 }
    );
  }
}
