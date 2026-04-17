/**
 * Workspace ↔ Meeting attachment.
 *
 * `workspaces.meetingId` is a nullable FK (`SET NULL` on meeting delete).
 * This route is the only blessed way to mutate it from the client:
 *
 *   POST   /api/workspaces/[id]/attach-meeting   { meetingId: number }  → attach
 *   DELETE /api/workspaces/[id]/attach-meeting                            → detach
 *
 * Auth model:
 *   - The caller must be able to EDIT the workspace (`canEditWorkspace`).
 *   - On attach, the caller must also be a participant of the target
 *     meeting (`canJoinMeeting`) — otherwise members of meeting A
 *     could attach random workspaces to meeting B and surface them in
 *     the meeting sidebar.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { canEditWorkspace } from '@/lib/workspaces/access';
import { getWorkspace, updateWorkspace } from '@/lib/workspaces/workspaces';
import { canJoinMeeting } from '@/lib/meetings/access';
import { getMeeting } from '@/lib/meetings/meetings';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const n = parseInt(raw, 10);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { id } = await context.params;
    const wsId = parseId(id);
    if (wsId == null) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid workspace id' },
        { status: 400 }
      );
    }

    const ws = getWorkspace(wsId);
    if (!ws) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Workspace not found' },
        { status: 404 }
      );
    }

    const allowedWs = await canEditWorkspace(auth.user.userId, wsId);
    if (!allowedWs) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'You cannot edit this workspace' },
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
    const meetingIdRaw =
      typeof body === 'object' && body !== null && 'meetingId' in body
        ? (body as { meetingId: unknown }).meetingId
        : null;
    const meetingId =
      typeof meetingIdRaw === 'number' && Number.isInteger(meetingIdRaw) && meetingIdRaw > 0
        ? meetingIdRaw
        : null;
    if (meetingId == null) {
      return NextResponse.json(
        { error: 'Validation', message: 'meetingId must be a positive integer' },
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

    const allowedMeeting = await canJoinMeeting(auth.user.userId, meetingId);
    if (!allowedMeeting) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'You cannot attach to this meeting' },
        { status: 403 }
      );
    }

    const updated = updateWorkspace(wsId, { meetingId });
    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error('[workspaces/attach-meeting] POST error:', error);
    const message = error instanceof Error ? error.message : 'Failed to attach meeting';
    return NextResponse.json({ error: 'Internal', message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { id } = await context.params;
    const wsId = parseId(id);
    if (wsId == null) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid workspace id' },
        { status: 400 }
      );
    }

    const ws = getWorkspace(wsId);
    if (!ws) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Workspace not found' },
        { status: 404 }
      );
    }

    const allowed = await canEditWorkspace(auth.user.userId, wsId);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'You cannot edit this workspace' },
        { status: 403 }
      );
    }

    const updated = updateWorkspace(wsId, { meetingId: null });
    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error('[workspaces/attach-meeting] DELETE error:', error);
    const message = error instanceof Error ? error.message : 'Failed to detach meeting';
    return NextResponse.json({ error: 'Internal', message }, { status: 500 });
  }
}
