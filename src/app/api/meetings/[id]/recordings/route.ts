import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { canJoinMeeting } from '@/lib/meetings/access';
import { getMeeting } from '@/lib/meetings/meetings';
import { buildManifest } from '@/lib/meetings/recordings';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/meetings/[id]/recordings
 *
 * Returns the playback manifest for a meeting. Access requires the same
 * `canJoinMeeting` check used everywhere else.
 *
 * If egress is still running / post-mux in progress, the manifest comes
 * back with `status: 'processing'` and possibly empty `finalMkv`/arrays —
 * clients render a spinner without a separate polling endpoint.
 *
 * Response: `{ data: RecordingsManifest }`.
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

    const meeting = getMeeting(meetingId);
    if (!meeting) {
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

    const manifest = buildManifest(meetingId);
    return NextResponse.json({ data: manifest });
  } catch (error) {
    console.error('[meetings/[id]/recordings] GET error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to fetch recordings' },
      { status: 500 }
    );
  }
}
