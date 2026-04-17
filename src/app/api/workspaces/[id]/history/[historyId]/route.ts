import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { canJoinWorkspace, isOwner } from '@/lib/workspaces/access';
import { getWorkspace, getSnapshot, saveSnapshot } from '@/lib/workspaces/workspaces';
import { getHistoryRow } from '@/lib/workspaces/history';
import { generateThumbnail } from '@/lib/workspaces/thumbnail';

type RouteContext = {
  params: Promise<{ id: string; historyId: string }>;
};

function parseId(raw: string): number | null {
  const n = parseInt(raw, 10);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

/**
 * GET /api/workspaces/[id]/history/[historyId]
 *
 * Returns the full payload of a historic snapshot (for preview).
 * Auth: canJoinWorkspace.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { id, historyId: hid } = await context.params;
    const wsId = parseId(id);
    const histId = parseId(hid);
    if (wsId == null || histId == null) {
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
    const row = getHistoryRow(wsId, histId);
    if (!row) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Snapshot history row not found' },
        { status: 404 }
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.payload);
    } catch {
      parsed = { elements: {} };
    }
    return NextResponse.json({
      data: {
        id: row.id,
        version: row.version,
        payload: parsed,
        createdAt: row.createdAt,
        createdBy: row.createdBy,
      },
    });
  } catch (error) {
    console.error('[workspaces/[id]/history/[historyId]] GET error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to fetch history snapshot' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/workspaces/[id]/history/[historyId]/restore
 * (handled here at the same path with method dispatch — Next 15 maps the
 * `restore` segment via a dedicated route below.)
 */

/**
 * POST /api/workspaces/[id]/history/[historyId] (restore)
 *
 * Owner/admin only. Copies the row's payload back into the live snapshot via
 * `saveSnapshot`. The new snapshot becomes the current head; `currentVersion`
 * advances by one (snapshot save bumps the integer monotonically internally).
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { id, historyId: hid } = await context.params;
    const wsId = parseId(id);
    const histId = parseId(hid);
    if (wsId == null || histId == null) {
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
    const owner = await isOwner(auth.user.userId, wsId);
    if (!owner) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Only the workspace owner can restore history' },
        { status: 403 }
      );
    }
    const row = getHistoryRow(wsId, histId);
    if (!row) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Snapshot history row not found' },
        { status: 404 }
      );
    }
    // Pin the new snapshot to a version number ahead of the current head so
    // the truncate of pending ops is safe (saveSnapshot truncates ops with
    // id ≤ version).
    const cur = getSnapshot(wsId);
    const nextVersion = (cur?.version ?? 0) + 1;
    saveSnapshot(wsId, nextVersion, row.payload);
    void generateThumbnail(wsId).catch((err) => {
      console.warn('[history/restore] thumbnail gen failed:', err);
    });
    return NextResponse.json({ data: { restored: true, version: nextVersion } });
  } catch (error) {
    console.error('[workspaces/[id]/history/[historyId]] POST error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to restore history snapshot' },
      { status: 500 }
    );
  }
}
