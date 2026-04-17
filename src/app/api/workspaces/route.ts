import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import {
  createWorkspace,
  getSnapshot,
  getWorkspace,
  listWorkspacesForUser,
  saveSnapshot,
} from '@/lib/workspaces/workspaces';
import { canJoinWorkspace } from '@/lib/workspaces/access';
import { getTemplate, instantiateTemplate } from '@/lib/workspaces/templates';

/**
 * GET /api/workspaces
 *
 * Returns workspaces the current user owns or is listed in as a participant,
 * newest first. Response: `{ data: Workspace[] }`.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const data = listWorkspacesForUser(auth.user.userId);
    return NextResponse.json({ data });
  } catch (error) {
    console.error('[workspaces] GET error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to fetch workspaces' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/workspaces
 *
 * Create a new workspace. The caller becomes the owner. Optionally pin the
 * board to a meeting via `meetingId`.
 *
 * Body: `{ title: string, meetingId?: number }`
 * Response: 201 + `{ data: Workspace }`.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

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

    const { title, meetingId, templateId, duplicateFrom } = body as {
      title?: unknown;
      meetingId?: unknown;
      templateId?: unknown;
      duplicateFrom?: unknown;
    };

    if (typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json(
        { error: 'Validation', message: 'title is required and must be a non-empty string' },
        { status: 400 }
      );
    }
    if (title.length > 200) {
      return NextResponse.json(
        { error: 'Validation', message: 'title must not exceed 200 characters' },
        { status: 400 }
      );
    }
    if (
      meetingId !== undefined &&
      meetingId !== null &&
      (!Number.isInteger(meetingId) || (meetingId as number) <= 0)
    ) {
      return NextResponse.json(
        { error: 'Validation', message: 'meetingId must be a positive integer when provided' },
        { status: 400 }
      );
    }

    // Validate the optional seed source. At most ONE of templateId / duplicateFrom.
    if (templateId != null && duplicateFrom != null) {
      return NextResponse.json(
        { error: 'Validation', message: 'Provide either templateId OR duplicateFrom, not both' },
        { status: 400 }
      );
    }
    if (templateId !== undefined && templateId !== null && typeof templateId !== 'string') {
      return NextResponse.json(
        { error: 'Validation', message: 'templateId must be a string' },
        { status: 400 }
      );
    }
    if (
      duplicateFrom !== undefined &&
      duplicateFrom !== null &&
      (!Number.isInteger(duplicateFrom) || (duplicateFrom as number) <= 0)
    ) {
      return NextResponse.json(
        { error: 'Validation', message: 'duplicateFrom must be a positive integer when provided' },
        { status: 400 }
      );
    }

    const workspace = createWorkspace({
      ownerId: auth.user.userId,
      title: title.trim(),
      meetingId: (meetingId as number | null | undefined) ?? null,
    });

    // Seed snapshot from a template OR a duplicate source if requested. Both
    // paths short-circuit on validation errors AFTER creation — the new ws
    // remains usable as an empty board.
    if (typeof templateId === 'string') {
      const tpl = getTemplate(templateId);
      if (!tpl) {
        return NextResponse.json(
          { error: 'Validation', message: `Unknown templateId: ${templateId}` },
          { status: 400 }
        );
      }
      const seeded = instantiateTemplate(tpl, auth.user.userId);
      try {
        saveSnapshot(workspace.id, 0, JSON.stringify(seeded));
      } catch (err) {
        console.warn('[workspaces] template seed failed:', err);
      }
    } else if (Number.isInteger(duplicateFrom) && (duplicateFrom as number) > 0) {
      const sourceId = duplicateFrom as number;
      const source = getWorkspace(sourceId);
      if (!source) {
        return NextResponse.json(
          { error: 'Validation', message: `duplicateFrom: workspace ${sourceId} not found` },
          { status: 404 }
        );
      }
      // Caller must be allowed to read the source.
      const canRead = await canJoinWorkspace(auth.user.userId, sourceId);
      if (!canRead) {
        return NextResponse.json(
          { error: 'Forbidden', message: 'No access to source workspace' },
          { status: 403 }
        );
      }
      const sourceSnap = getSnapshot(sourceId);
      if (sourceSnap) {
        try {
          // We persist the source snapshot verbatim — element ids are kept
          // (they're already UUIDs). Image asset references point at
          // `workspace_assets` rows tied to the SOURCE workspace; for now we
          // accept that duplicates render placeholders for those assets.
          // Asset-cloning is documented in the task description as an
          // open decision; we choose the lighter no-clone path.
          saveSnapshot(workspace.id, 0, sourceSnap.payload);
        } catch (err) {
          console.warn('[workspaces] duplicate seed failed:', err);
        }
      }
    }

    return NextResponse.json({ data: workspace }, { status: 201 });
  } catch (error) {
    console.error('[workspaces] POST error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create workspace';
    return NextResponse.json({ error: 'Internal', message }, { status: 500 });
  }
}
