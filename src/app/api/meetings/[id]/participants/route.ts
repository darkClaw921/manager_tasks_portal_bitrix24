import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { isHost } from '@/lib/meetings/access';
import { addParticipant, getMeeting } from '@/lib/meetings/meetings';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/meetings/[id]/participants
 *
 * Invite one or more users to the meeting. Only the host or an app-admin
 * may invite. Idempotent per user — re-inviting is a no-op.
 * Body: `{ userIds: number[] }`
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
    if (!host && !auth.user.isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Only the meeting host can invite users' },
        { status: 403 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Validation', message: 'Body must be valid JSON' },
        { status: 400 }
      );
    }

    const { userIds } = (body ?? {}) as { userIds?: unknown };
    if (
      !Array.isArray(userIds) ||
      userIds.length === 0 ||
      !userIds.every((n) => Number.isInteger(n) && (n as number) > 0)
    ) {
      return NextResponse.json(
        { error: 'Validation', message: 'userIds must be a non-empty array of positive integers' },
        { status: 400 }
      );
    }

    const added = (userIds as number[]).map((uid) =>
      addParticipant(meetingId, uid, 'participant')
    );

    return NextResponse.json({ data: added }, { status: 201 });
  } catch (error) {
    console.error('[meetings/[id]/participants] POST error:', error);
    const message = error instanceof Error ? error.message : 'Failed to invite users';
    return NextResponse.json({ error: 'Internal', message }, { status: 500 });
  }
}
