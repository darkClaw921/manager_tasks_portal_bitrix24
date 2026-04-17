import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { canEditWorkspace, isOwner } from '@/lib/workspaces/access';
import { getWorkspace } from '@/lib/workspaces/workspaces';
import {
  deleteComment,
  getComment,
  setCommentResolved,
} from '@/lib/workspaces/comments';

type RouteContext = {
  params: Promise<{ id: string; commentId: string }>;
};

function parseId(raw: string): number | null {
  const n = parseInt(raw, 10);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

/**
 * PATCH /api/workspaces/[id]/comments/[commentId]
 *
 * Body: `{ resolved: boolean }`.
 * Permitted by author OR workspace owner OR admin (admins are owners by access.ts).
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { id, commentId: cid } = await context.params;
    const wsId = parseId(id);
    const commentId = parseId(cid);
    if (wsId == null || commentId == null) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid id' },
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

    const comment = getComment(commentId);
    if (!comment || comment.workspaceId !== wsId) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Comment not found' },
        { status: 404 }
      );
    }
    const owner = await isOwner(auth.user.userId, wsId);
    if (comment.userId !== auth.user.userId && !owner) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'You cannot modify this comment' },
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
    const { resolved } = body as { resolved?: unknown };
    if (typeof resolved !== 'boolean') {
      return NextResponse.json(
        { error: 'Validation', message: 'resolved must be boolean' },
        { status: 400 }
      );
    }
    setCommentResolved(commentId, resolved);
    return NextResponse.json({ data: { id: commentId, resolved } });
  } catch (error) {
    console.error('[workspaces/[id]/comments/[commentId]] PATCH error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to update comment' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/workspaces/[id]/comments/[commentId]
 *
 * Permitted by author OR workspace owner.
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { id, commentId: cid } = await context.params;
    const wsId = parseId(id);
    const commentId = parseId(cid);
    if (wsId == null || commentId == null) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid id' },
        { status: 400 }
      );
    }

    const comment = getComment(commentId);
    if (!comment || comment.workspaceId !== wsId) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Comment not found' },
        { status: 404 }
      );
    }
    const owner = await isOwner(auth.user.userId, wsId);
    const editable = await canEditWorkspace(auth.user.userId, wsId);
    if (comment.userId !== auth.user.userId && !owner && !editable) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'You cannot delete this comment' },
        { status: 403 }
      );
    }
    deleteComment(commentId);
    return NextResponse.json({ data: { removed: true } });
  } catch (error) {
    console.error('[workspaces/[id]/comments/[commentId]] DELETE error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to delete comment' },
      { status: 500 }
    );
  }
}
