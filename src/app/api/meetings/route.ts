import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { createMeeting, listMeetings } from '@/lib/meetings/meetings';

/**
 * GET /api/meetings
 *
 * Returns meetings the current user is a host or participant of, newest
 * first. Response: `{ data: Meeting[] }`.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const data = listMeetings({ userId: auth.user.userId });
    return NextResponse.json({ data });
  } catch (error) {
    console.error('[meetings] GET error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to fetch meetings' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/meetings
 *
 * Create a new meeting with the current user as host.
 * Body: `{ title: string, recordingEnabled?: boolean }`
 *
 * Returns 201 + `{ data: Meeting }`.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Validation', message: 'Body must be valid JSON' },
        { status: 400 }
      );
    }

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Validation', message: 'Body must be an object' },
        { status: 400 }
      );
    }

    const { title, recordingEnabled } = body as {
      title?: unknown;
      recordingEnabled?: unknown;
    };

    if (typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json(
        { error: 'Validation', message: 'title is required and must be a non-empty string' },
        { status: 400 }
      );
    }
    if (title.length > 200) {
      return NextResponse.json(
        { error: 'Validation', message: 'title must not exceed 200 characters' },
        { status: 400 }
      );
    }
    if (recordingEnabled !== undefined && typeof recordingEnabled !== 'boolean') {
      return NextResponse.json(
        { error: 'Validation', message: 'recordingEnabled must be a boolean' },
        { status: 400 }
      );
    }

    const meeting = createMeeting({
      hostId: auth.user.userId,
      title: title.trim(),
      recordingEnabled: recordingEnabled === true,
    });

    return NextResponse.json({ data: meeting }, { status: 201 });
  } catch (error) {
    console.error('[meetings] POST error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create meeting';
    return NextResponse.json(
      { error: 'Internal', message },
      { status: 500 }
    );
  }
}
