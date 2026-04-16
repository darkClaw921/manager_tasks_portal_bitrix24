import { NextRequest, NextResponse } from 'next/server';
import { getMeeting } from '@/lib/meetings/meetings';
import {
  findActiveGuestToken,
  buildGuestIdentity,
} from '@/lib/meetings/guest-tokens';
import { issueGuestLiveKitToken } from '@/lib/meetings/tokens';

type RouteContext = { params: Promise<{ token: string }> };

const MAX_DISPLAY_NAME = 60;

/**
 * POST /api/meetings/guest/[token]/token
 *
 * Public (no auth). Mints a LiveKit access token for an unauthenticated
 * guest. The `displayName` provided in the body is shown to the room as
 * the guest's name. Identity is generated server-side as `guest:<uuid>`
 * so collisions between two guests with the same name are still tracked.
 *
 * Body: `{ displayName: string }`
 * Returns `{ data: { token, url, roomName, identity, displayName } }`.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;
    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid token' },
        { status: 400 }
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

    const { displayName } = (body ?? {}) as { displayName?: unknown };
    if (typeof displayName !== 'string') {
      return NextResponse.json(
        { error: 'Validation', message: 'displayName is required' },
        { status: 400 }
      );
    }
    const trimmed = displayName.trim();
    if (trimmed.length === 0) {
      return NextResponse.json(
        { error: 'Validation', message: 'Введите имя' },
        { status: 400 }
      );
    }
    if (trimmed.length > MAX_DISPLAY_NAME) {
      return NextResponse.json(
        { error: 'Validation', message: `displayName must be ≤ ${MAX_DISPLAY_NAME} chars` },
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

    const identity = buildGuestIdentity();
    const livekitToken = await issueGuestLiveKitToken({
      identity,
      userName: trimmed,
      roomName: meeting.roomName,
    });

    const publicUrl =
      process.env.NEXT_PUBLIC_LIVEKIT_URL ||
      process.env.LIVEKIT_URL ||
      '';

    return NextResponse.json({
      data: {
        token: livekitToken,
        url: publicUrl,
        roomName: meeting.roomName,
        identity,
        displayName: trimmed,
        meetingId: meeting.id,
        title: meeting.title,
      },
    });
  } catch (error) {
    console.error('[meetings/guest/[token]/token] POST error:', error);
    const message = error instanceof Error ? error.message : 'Failed to issue guest token';
    return NextResponse.json(
      { error: 'Internal', message },
      { status: 500 }
    );
  }
}
