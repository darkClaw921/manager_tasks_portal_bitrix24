import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { canEditWorkspace, canJoinWorkspace } from '@/lib/workspaces/access';
import {
  getSnapshot,
  getWorkspace,
  saveSnapshot,
} from '@/lib/workspaces/workspaces';

type RouteContext = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const n = parseInt(raw, 10);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

/**
 * GET /api/workspaces/[id]/snapshot
 *
 * Returns the current persisted snapshot.
 * Response: `{ data: { version: number, payload: object, updatedAt: string | null } }`.
 *
 * `payload` is the parsed JSON object (so the client doesn't have to
 * double-parse). Brand-new workspaces return `{ version: 0, payload: {} }`.
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

    const slice = getSnapshot(wsId);
    if (!slice) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Workspace snapshot not found' },
        { status: 404 }
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(slice.payload);
    } catch {
      // Stored payload is malformed — return an empty board rather than 500.
      parsed = { elements: {} };
    }

    return NextResponse.json({
      data: {
        version: slice.version,
        payload: parsed,
        updatedAt: slice.updatedAt,
      },
    });
  } catch (error) {
    console.error('[workspaces/[id]/snapshot] GET error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to fetch snapshot' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/workspaces/[id]/snapshot
 *
 * Save a new snapshot AND truncate ops with id <= version. Atomic via the
 * service-layer transaction.
 *
 * Body: `{ version: number, payload: object | string }`.
 *   - `payload` accepts either a JSON-serialisable object (preferred) or a
 *     pre-stringified JSON string (handy when the client already cached it).
 *
 * Requires `canEditWorkspace`.
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
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Validation', message: 'Body must be an object' },
        { status: 400 }
      );
    }

    const { version, payload } = body as {
      version?: unknown;
      payload?: unknown;
    };

    if (!Number.isInteger(version) || (version as number) < 0) {
      return NextResponse.json(
        { error: 'Validation', message: 'version must be a non-negative integer' },
        { status: 400 }
      );
    }

    let payloadString: string;
    if (typeof payload === 'string') {
      payloadString = payload;
    } else if (payload && typeof payload === 'object') {
      try {
        payloadString = JSON.stringify(payload);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'invalid payload';
        return NextResponse.json(
          { error: 'Validation', message: `payload could not be serialised: ${message}` },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { error: 'Validation', message: 'payload must be an object or JSON string' },
        { status: 400 }
      );
    }

    try {
      const slice = saveSnapshot(wsId, version as number, payloadString);
      return NextResponse.json({ data: slice });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save snapshot';
      return NextResponse.json({ error: 'Validation', message }, { status: 400 });
    }
  } catch (error) {
    console.error('[workspaces/[id]/snapshot] POST error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to save snapshot' },
      { status: 500 }
    );
  }
}
