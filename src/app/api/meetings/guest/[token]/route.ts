import { NextRequest, NextResponse } from 'next/server';
import { getMeeting } from '@/lib/meetings/meetings';
import { findActiveGuestToken } from '@/lib/meetings/guest-tokens';

type RouteContext = { params: Promise<{ token: string }> };

/**
 * GET /api/meetings/guest/[token]
 *
 * Public (no auth). Resolves an invite token to its meeting summary so the
 * guest landing page can show the meeting title + status before prompting
 * for a display name. Returns 404 on revoked/unknown tokens and on
 * `status === 'ended'` meetings.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;
    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid token' },
        { status: 400 }
      );
    }

    const record = findActiveGuestToken(token);
    if (!record) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Ссылка недействительна' },
        { status: 404 }
      );
    }

    const meeting = getMeeting(record.meetingId);
    if (!meeting) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Meeting not found' },
        { status: 404 }
      );
    }

    if (meeting.status === 'ended') {
      return NextResponse.json(
        { error: 'Gone', message: 'Встреча уже завершена' },
        { status: 410 }
      );
    }

    return NextResponse.json({
      data: {
        meetingId: meeting.id,
        title: meeting.title,
        status: meeting.status,
      },
    });
  } catch (error) {
    console.error('[meetings/guest/[token]] GET error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to resolve invite' },
      { status: 500 }
    );
  }
}
