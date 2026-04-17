import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { canJoinWorkspace, isOwner } from '@/lib/workspaces/access';
import {
  deleteWorkspace,
  getWorkspaceDetail,
  updateWorkspace,
} from '@/lib/workspaces/workspaces';

type RouteContext = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const n = parseInt(raw, 10);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

/**
 * GET /api/workspaces/[id]
 *
 * Returns the workspace + participant list. 403 if the caller cannot join.
 * Response: `{ data: WorkspaceDetail }`.
 */
export async function GET(request: NextRequest, context: RouteContext) {
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

    const detail = getWorkspaceDetail(wsId);
    if (!detail) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Workspace not found' },
        { status: 404 }
      );
    }

    const allowed = await canJoinWorkspace(auth.user.userId, wsId);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'You do not have access to this workspace' },
        { status: 403 }
      );
    }

    return NextResponse.json({ data: detail });
  } catch (error) {
    console.error('[workspaces/[id]] GET error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to fetch workspace' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/workspaces/[id]
 *
 * Owner-only update of mutable fields. Body: `{ title?: string, meetingId?: number | null }`.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
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

    const owner = await isOwner(auth.user.userId, wsId);
    if (!owner && !auth.user.isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Only the workspace owner can update' },
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

    const patch: { title?: string; meetingId?: number | null } = {};
    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim().length === 0) {
        return NextResponse.json(
          { error: 'Validation', message: 'title must be a non-empty string' },
          { status: 400 }
        );
      }
      if (title.length > 200) {
        return NextResponse.json(
          { error: 'Validation', message: 'title must not exceed 200 characters' },
          { status: 400 }
        );
      }
      patch.title = title;
    }
    if (meetingId !== undefined) {
      if (meetingId === null) {
        patch.meetingId = null;
      } else if (Number.isInteger(meetingId) && (meetingId as number) > 0) {
        patch.meetingId = meetingId as number;
      } else {
        return NextResponse.json(
          { error: 'Validation', message: 'meetingId must be a positive integer or null' },
          { status: 400 }
        );
      }
    }

    try {
      const updated = updateWorkspace(wsId, patch);
      if (!updated) {
        return NextResponse.json(
          { error: 'Not Found', message: 'Workspace not found' },
          { status: 404 }
        );
      }
      return NextResponse.json({ data: updated });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update workspace';
      return NextResponse.json({ error: 'Validation', message }, { status: 400 });
    }
  } catch (error) {
    console.error('[workspaces/[id]] PATCH error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to update workspace' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/workspaces/[id]
 *
 * Hard-delete. Owner-only (admin override). CASCADE removes participants/
 * ops/chat messages/assets.
 */
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

    const owner = await isOwner(auth.user.userId, wsId);
    if (!owner && !auth.user.isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Only the workspace owner can delete' },
        { status: 403 }
      );
    }

    const removed = deleteWorkspace(wsId);
    if (!removed) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Workspace not found' },
        { status: 404 }
      );
    }
    return NextResponse.json({ data: { removed: true } });
  } catch (error) {
    console.error('[workspaces/[id]] DELETE error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to delete workspace' },
      { status: 500 }
    );
  }
}
