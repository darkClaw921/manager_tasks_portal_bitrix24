import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { isOwner, removeParticipant } from '@/lib/workspaces/access';
import { getWorkspace } from '@/lib/workspaces/workspaces';
import { kickFromWorkspaceRoom } from '@/lib/workspaces/livekit-kick';

type RouteContext = { params: Promise<{ id: string; userId: string }> };

/**
 * DELETE /api/workspaces/[id]/participants/[userId]
 *
 * Owner-only removal. Returns 400 when the caller tries to remove the
 * workspace owner.
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { id, userId } = await context.params;
    const wsId = parseInt(id, 10);
    const targetUserId = parseInt(userId, 10);
    if (!Number.isInteger(wsId) || wsId <= 0) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid workspace id' },
        { status: 400 }
      );
    }
    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid user id' },
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
        { error: 'Forbidden', message: 'Only the workspace owner can remove participants' },
        { status: 403 }
      );
    }

    try {
      removeParticipant(wsId, targetUserId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove participant';
      return NextResponse.json({ error: 'Validation', message }, { status: 400 });
    }

    // Best-effort: evict the kicked peer from the LiveKit room so they cannot
    // keep broadcasting ops over the data channel until their token expires.
    void kickFromWorkspaceRoom(ws.roomName, targetUserId);

    return NextResponse.json({ data: { removed: true } });
  } catch (error) {
    console.error('[workspaces/[id]/participants/[userId]] DELETE error:', error);
    const message = error instanceof Error ? error.message : 'Failed to remove participant';
    return NextResponse.json({ error: 'Internal', message }, { status: 500 });
  }
}
