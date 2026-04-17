import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import {
  addParticipants,
  canJoinWorkspace,
  isOwner,
  listParticipants,
} from '@/lib/workspaces/access';
import { getWorkspace } from '@/lib/workspaces/workspaces';
import type { WorkspaceRole } from '@/types/workspace';

type RouteContext = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const n = parseInt(raw, 10);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

/**
 * GET /api/workspaces/[id]/participants
 *
 * Returns the participant list (joined to users for display name) for any
 * caller allowed to join the workspace.
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

    const ws = getWorkspace(wsId);
    if (!ws) {
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

    const data = listParticipants(wsId);
    return NextResponse.json({ data });
  } catch (error) {
    console.error('[workspaces/[id]/participants] GET error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to fetch participants' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/workspaces/[id]/participants
 *
 * Owner-only invite. Body: `{ userIds: number[], role?: 'editor' | 'viewer' }`.
 * Idempotent — re-inviting an already-listed user is a no-op for that id.
 *
 * Response: 201 + `{ data: { added: WorkspaceParticipant[], alreadyPresent: number[] } }`.
 */
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

    const owner = await isOwner(auth.user.userId, wsId);
    if (!owner && !auth.user.isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Only the workspace owner can invite users' },
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
    const { userIds, role } = (body ?? {}) as {
      userIds?: unknown;
      role?: unknown;
    };

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

    let inviteRole: WorkspaceRole = 'editor';
    if (role !== undefined) {
      if (role !== 'editor' && role !== 'viewer') {
        return NextResponse.json(
          { error: 'Validation', message: "role must be 'editor' or 'viewer'" },
          { status: 400 }
        );
      }
      inviteRole = role;
    }

    const result = addParticipants(wsId, userIds as number[], inviteRole);
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    console.error('[workspaces/[id]/participants] POST error:', error);
    const message = error instanceof Error ? error.message : 'Failed to invite users';
    return NextResponse.json({ error: 'Internal', message }, { status: 500 });
  }
}
