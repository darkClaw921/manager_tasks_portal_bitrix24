/**
 * GET /api/meetings/[id]/workspaces
 *
 * Lists workspaces attached to a meeting via `workspaces.meetingId`.
 * Auth: requireAuth + canJoinMeeting (only meeting participants can see
 * what boards have been attached to it — admins always pass).
 *
 * POST /api/meetings/[id]/workspaces
 *
 * Convenience endpoint that creates a brand-new workspace already
 * attached to the meeting, in a single round-trip. Useful for the
 * "Создать новую доску" button inside MeetingRoom — saves the client
 * from doing POST /api/workspaces + POST /attach-meeting in sequence.
 *
 * Body: `{ title: string (1..200) }`. The caller becomes the workspace
 * owner; meetingId is set from the URL.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { canJoinMeeting } from '@/lib/meetings/access';
import { getMeeting } from '@/lib/meetings/meetings';
import {
  createWorkspace,
  listWorkspacesForMeeting,
} from '@/lib/workspaces/workspaces';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

const MAX_TITLE = 200;

function parseId(raw: string): number | null {
  const n = parseInt(raw, 10);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { id } = await context.params;
    const meetingId = parseId(id);
    if (meetingId == null) {
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

    const items = listWorkspacesForMeeting(meetingId);
    return NextResponse.json({ data: items });
  } catch (error) {
    console.error('[meetings/[id]/workspaces] GET error:', error);
    const message = error instanceof Error ? error.message : 'Failed to list workspaces';
    return NextResponse.json({ error: 'Internal', message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { id } = await context.params;
    const meetingId = parseId(id);
    if (meetingId == null) {
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
        { error: 'Forbidden', message: 'You cannot attach a workspace to this meeting' },
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
    const title =
      typeof body === 'object' && body !== null && 'title' in body
        ? (body as { title: unknown }).title
        : null;
    if (typeof title !== 'string') {
      return NextResponse.json(
        { error: 'Validation', message: 'title must be a string' },
        { status: 400 }
      );
    }
    const trimmed = title.trim();
    if (!trimmed) {
      return NextResponse.json(
        { error: 'Validation', message: 'title must not be empty' },
        { status: 400 }
      );
    }
    if (trimmed.length > MAX_TITLE) {
      return NextResponse.json(
        {
          error: 'Validation',
          message: `title exceeds ${MAX_TITLE} characters`,
        },
        { status: 400 }
      );
    }

    const ws = createWorkspace({
      ownerId: auth.user.userId,
      title: trimmed,
      meetingId,
    });
    return NextResponse.json({ data: ws }, { status: 201 });
  } catch (error) {
    console.error('[meetings/[id]/workspaces] POST error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create workspace';
    return NextResponse.json({ error: 'Internal', message }, { status: 500 });
  }
}
