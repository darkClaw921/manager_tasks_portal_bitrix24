import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import {
  canEditWorkspace,
  canJoinWorkspace,
} from '@/lib/workspaces/access';
import { getWorkspace } from '@/lib/workspaces/workspaces';
import {
  createComment,
  getCommentCountsByElement,
  listCommentsForElement,
  listRecentComments,
} from '@/lib/workspaces/comments';

type RouteContext = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const n = parseInt(raw, 10);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

/**
 * GET /api/workspaces/[id]/comments
 *
 * Query:
 *   - `elementId` (optional): when present, returns the thread for that element.
 *   - `mode=counts`: returns aggregated counts per element id.
 *   - default: returns recent activity for the whole workspace (limit 50).
 *
 * Auth: canJoinWorkspace.
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

    const sp = request.nextUrl.searchParams;
    const elementId = sp.get('elementId');
    const mode = sp.get('mode');

    if (mode === 'counts') {
      const includeResolved = sp.get('includeResolved') === '1';
      return NextResponse.json({
        data: { counts: getCommentCountsByElement(wsId, { includeResolved }) },
      });
    }
    if (elementId) {
      const comments = listCommentsForElement(wsId, elementId);
      return NextResponse.json({ data: { comments } });
    }
    const limit = Math.min(200, Math.max(1, Number(sp.get('limit') ?? '50')));
    const comments = listRecentComments(wsId, limit);
    return NextResponse.json({ data: { comments } });
  } catch (error) {
    console.error('[workspaces/[id]/comments] GET error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to fetch comments' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/workspaces/[id]/comments
 *
 * Body: `{ elementId: string, content: string }`. canEditWorkspace required.
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
    const editable = await canEditWorkspace(auth.user.userId, wsId);
    if (!editable) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'You do not have edit access to this workspace' },
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
    const { elementId, content } = body as { elementId?: unknown; content?: unknown };
    if (typeof elementId !== 'string' || elementId.length === 0 || elementId.length > 64) {
      return NextResponse.json(
        { error: 'Validation', message: 'elementId must be a non-empty string ≤64 chars' },
        { status: 400 }
      );
    }
    if (typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json(
        { error: 'Validation', message: 'content must be a non-empty string' },
        { status: 400 }
      );
    }
    try {
      const comment = createComment({
        workspaceId: wsId,
        elementId,
        userId: auth.user.userId,
        content,
      });
      return NextResponse.json({ data: { comment } }, { status: 201 });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create comment';
      return NextResponse.json({ error: 'Validation', message }, { status: 400 });
    }
  } catch (error) {
    console.error('[workspaces/[id]/comments] POST error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to create comment' },
      { status: 500 }
    );
  }
}
