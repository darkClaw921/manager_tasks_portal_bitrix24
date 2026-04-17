/**
 * GET /api/workspaces/[id]/assets/[assetId]
 *
 * Stream the raw bytes of a workspace asset (image). Auth-protected:
 *   - requireAuth (any logged-in user)
 *   - canJoinWorkspace (member / owner / admin)
 *   - the asset must belong to the workspace in the URL — defends
 *     against id-guessing across workspaces
 *
 * Cache-Control is `private, max-age=86400, immutable` — assets are
 * immutable (we never overwrite a file under an existing id; new uploads
 * always get a fresh row + path), so browsers can hold them as long as
 * they want, but only on a per-user cache.
 *
 * No DELETE/PATCH here — assets are append-only by design (Phase 1
 * shape). If we ever need cleanup, the cron job will sweep based on
 * orphaned rows (no element references them).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { canJoinWorkspace } from '@/lib/workspaces/access';
import { getWorkspace } from '@/lib/workspaces/workspaces';
import { readAssetFile } from '@/lib/workspaces/assets';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string; assetId: string }> };

function parseId(raw: string): number | null {
  const n = parseInt(raw, 10);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { id, assetId } = await context.params;
    const wsId = parseId(id);
    const aId = parseId(assetId);
    if (wsId == null || aId == null) {
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

    const allowed = await canJoinWorkspace(auth.user.userId, wsId);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'You do not have access to this workspace' },
        { status: 403 }
      );
    }

    const file = await readAssetFile(aId);
    if (!file) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Asset not found' },
        { status: 404 }
      );
    }
    if (file.asset.workspaceId !== wsId) {
      // Cross-workspace lookup — refuse so a member of workspace A
      // cannot fetch an asset belonging to workspace B by guessing ids.
      return NextResponse.json(
        { error: 'Not Found', message: 'Asset not found' },
        { status: 404 }
      );
    }

    return new Response(new Uint8Array(file.buffer), {
      status: 200,
      headers: {
        'Content-Type': file.mime,
        'Content-Length': String(file.buffer.byteLength),
        'Cache-Control': 'private, max-age=86400, immutable',
        // Show inline (not download) for browser image rendering. The
        // basename is sanitised by `saveAsset` so it is safe to emit.
        'Content-Disposition': `inline; filename="${file.fileName.replace(/"/g, '')}"`,
      },
    });
  } catch (error) {
    console.error('[workspaces/[id]/assets/[assetId]] GET error:', error);
    const message = error instanceof Error ? error.message : 'Failed to read asset';
    return NextResponse.json({ error: 'Internal', message }, { status: 500 });
  }
}
