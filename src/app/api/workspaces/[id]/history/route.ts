import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { canJoinWorkspace } from '@/lib/workspaces/access';
import { getWorkspace } from '@/lib/workspaces/workspaces';
import { listHistory } from '@/lib/workspaces/history';

type RouteContext = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const n = parseInt(raw, 10);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

/**
 * GET /api/workspaces/[id]/history
 *
 * Returns metadata-only listing of snapshot history (newest first).
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
    const rows = listHistory(wsId).map((row) => ({
      id: row.id,
      version: row.version,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
      authorName: row.authorName,
      // payload omitted to keep response light
    }));
    return NextResponse.json({ data: { history: rows } });
  } catch (error) {
    console.error('[workspaces/[id]/history] GET error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to fetch history' },
      { status: 500 }
    );
  }
}
