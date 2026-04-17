import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import {
  createWorkspace,
  listWorkspacesForUser,
} from '@/lib/workspaces/workspaces';

/**
 * GET /api/workspaces
 *
 * Returns workspaces the current user owns or is listed in as a participant,
 * newest first. Response: `{ data: Workspace[] }`.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const data = listWorkspacesForUser(auth.user.userId);
    return NextResponse.json({ data });
  } catch (error) {
    console.error('[workspaces] GET error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to fetch workspaces' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/workspaces
 *
 * Create a new workspace. The caller becomes the owner. Optionally pin the
 * board to a meeting via `meetingId`.
 *
 * Body: `{ title: string, meetingId?: number }`
 * Response: 201 + `{ data: Workspace }`.
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

    const { title, meetingId } = body as {
      title?: unknown;
      meetingId?: unknown;
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
    if (
      meetingId !== undefined &&
      meetingId !== null &&
      (!Number.isInteger(meetingId) || (meetingId as number) <= 0)
    ) {
      return NextResponse.json(
        { error: 'Validation', message: 'meetingId must be a positive integer when provided' },
        { status: 400 }
      );
    }

    const workspace = createWorkspace({
      ownerId: auth.user.userId,
      title: title.trim(),
      meetingId: (meetingId as number | null | undefined) ?? null,
    });

    return NextResponse.json({ data: workspace }, { status: 201 });
  } catch (error) {
    console.error('[workspaces] POST error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create workspace';
    return NextResponse.json({ error: 'Internal', message }, { status: 500 });
  }
}
