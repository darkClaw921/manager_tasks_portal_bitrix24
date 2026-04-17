import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { canJoinWorkspace } from '@/lib/workspaces/access';
import { getWorkspace } from '@/lib/workspaces/workspaces';
import { getThumbnailPath } from '@/lib/workspaces/thumbnail';

type RouteContext = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const n = parseInt(raw, 10);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

/**
 * GET /api/workspaces/[id]/thumbnail
 *
 * Returns the workspace preview PNG bytes (auth-gated by canJoinWorkspace).
 * Returns 404 when the workspace has no thumbnail yet — clients should fall
 * back to a placeholder.
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

    const filePath = await getThumbnailPath(wsId);
    if (!filePath) {
      return NextResponse.json(
        { error: 'Not Found', message: 'No thumbnail yet' },
        { status: 404 }
      );
    }
    let bytes: Buffer;
    try {
      bytes = await fs.readFile(filePath);
    } catch {
      return NextResponse.json(
        { error: 'Not Found', message: 'Thumbnail file missing' },
        { status: 404 }
      );
    }
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        // Cache aggressively per-user; thumbnails are revalidated on snapshot save.
        'Cache-Control': 'private, max-age=60, must-revalidate',
        'Content-Disposition': 'inline',
      },
    });
  } catch (error) {
    console.error('[workspaces/[id]/thumbnail] GET error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to fetch thumbnail' },
      { status: 500 }
    );
  }
}
