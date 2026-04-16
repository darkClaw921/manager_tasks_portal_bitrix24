import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { isHost } from '@/lib/meetings/access';
import { getMeeting } from '@/lib/meetings/meetings';
import {
  createGuestToken,
  listActiveGuestTokens,
  revokeGuestToken,
} from '@/lib/meetings/guest-tokens';

type RouteContext = { params: Promise<{ id: string }> };

function buildGuestUrl(request: NextRequest, token: string): string {
  const origin = request.headers.get('x-forwarded-origin')
    ?? request.headers.get('origin')
    ?? request.nextUrl.origin;
  return `${origin.replace(/\/+$/, '')}/join/${token}`;
}

/**
 * GET /api/meetings/[id]/invite-links
 *
 * Host-only. Returns `{ data: { token, url, createdAt }[] }` for every
 * active (non-revoked) guest invite token on the meeting.
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

    const host = await isHost(auth.user.userId, meetingId);
    if (!host && !auth.user.isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Only the meeting host can manage invite links' },
        { status: 403 }
      );
    }

    const tokens = listActiveGuestTokens(meetingId).map((t) => ({
      token: t.token,
      url: buildGuestUrl(request, t.token),
      createdAt: t.createdAt,
    }));

    return NextResponse.json({ data: tokens });
  } catch (error) {
    console.error('[meetings/[id]/invite-links] GET error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to list invite links' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/meetings/[id]/invite-links
 *
 * Host-only. Creates a fresh guest invite token. Returns 201
 * `{ data: { token, url, createdAt } }`.
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
        { error: 'Forbidden', message: 'Only the meeting host can create invite links' },
        { status: 403 }
      );
    }

    const created = createGuestToken(meetingId, auth.user.userId);

    return NextResponse.json(
      {
        data: {
          token: created.token,
          url: buildGuestUrl(request, created.token),
          createdAt: created.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[meetings/[id]/invite-links] POST error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to create invite link' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/meetings/[id]/invite-links?token=...
 *
 * Host-only. Revokes the given guest invite token. Idempotent.
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

    const token = request.nextUrl.searchParams.get('token');
    if (!token) {
      return NextResponse.json(
        { error: 'Validation', message: 'token query parameter is required' },
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
        { error: 'Forbidden', message: 'Only the meeting host can revoke invite links' },
        { status: 403 }
      );
    }

    const revoked = revokeGuestToken(token);
    return NextResponse.json({ data: { revoked } });
  } catch (error) {
    console.error('[meetings/[id]/invite-links] DELETE error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to revoke invite link' },
      { status: 500 }
    );
  }
}
