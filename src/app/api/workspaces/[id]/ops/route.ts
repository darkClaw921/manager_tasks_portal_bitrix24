import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { canEditWorkspace, canJoinWorkspace } from '@/lib/workspaces/access';
import {
  appendOp,
  getWorkspace,
  listOpsSince,
} from '@/lib/workspaces/workspaces';
import type { WorkspaceOp } from '@/types/workspace';

type RouteContext = { params: Promise<{ id: string }> };

/** Hard limit on how many ops a single POST may carry. Defends against abuse. */
const MAX_OPS_PER_BATCH = 200;

function parseId(raw: string): number | null {
  const n = parseInt(raw, 10);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

/**
 * GET /api/workspaces/[id]/ops?since=<v>
 *
 * Late-join replay: return all ops with `id > since`, in append order, so
 * the client can fold them onto the snapshot it just loaded.
 *
 * Response:
 *   `{ data: { ops: Array<{id, userId, clientOpId, baseVersion, op, createdAt}>, maxId: number } }`.
 *   `maxId` is the largest server id returned (or `since` when empty) so the
 *   caller can advance its cursor without scanning.
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

    const url = new URL(request.url);
    const sinceRaw = url.searchParams.get('since');
    let since = 0;
    if (sinceRaw !== null) {
      const parsed = Number.parseInt(sinceRaw, 10);
      if (!Number.isFinite(parsed) || parsed < 0) {
        return NextResponse.json(
          { error: 'Validation', message: 'since must be a non-negative integer' },
          { status: 400 }
        );
      }
      since = parsed;
    }

    const items = listOpsSince(wsId, since);
    const maxId = items.length > 0 ? items[items.length - 1].id : since;
    return NextResponse.json({
      data: {
        ops: items,
        maxId,
      },
    });
  } catch (error) {
    console.error('[workspaces/[id]/ops] GET error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to fetch ops' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/workspaces/[id]/ops
 *
 * Persist a batch of canvas mutations. Each entry carries the wire-format
 * op + the snapshot version it was authored against + a client-generated
 * `clientOpId` for idempotency.
 *
 * Body:
 *   `{ ops: Array<{ clientOpId, baseVersion, op: WorkspaceOp }> }`.
 *
 * Response (preserves order):
 *   `{ data: { acks: Array<{ clientOpId, serverId, createdAt, deduped }> } }`.
 *
 * Idempotency: re-POSTing the same `clientOpId` yields the original
 * `serverId` (deduped=true) — safe to retry on flaky networks.
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
    const { ops } = body as { ops?: unknown };
    if (!Array.isArray(ops)) {
      return NextResponse.json(
        { error: 'Validation', message: 'ops must be an array' },
        { status: 400 }
      );
    }
    if (ops.length === 0) {
      return NextResponse.json({ data: { acks: [] } });
    }
    if (ops.length > MAX_OPS_PER_BATCH) {
      return NextResponse.json(
        {
          error: 'Validation',
          message: `ops batch too large: ${ops.length} (max ${MAX_OPS_PER_BATCH})`,
        },
        { status: 400 }
      );
    }

    interface AckEntry {
      clientOpId: string;
      serverId: number;
      createdAt: string;
      deduped: boolean;
    }
    const acks: AckEntry[] = [];

    for (let i = 0; i < ops.length; i += 1) {
      const entry = ops[i];
      if (!entry || typeof entry !== 'object') {
        return NextResponse.json(
          { error: 'Validation', message: `ops[${i}] must be an object` },
          { status: 400 }
        );
      }
      const { clientOpId, baseVersion, op } = entry as {
        clientOpId?: unknown;
        baseVersion?: unknown;
        op?: unknown;
      };
      if (typeof clientOpId !== 'string' || clientOpId.length === 0) {
        return NextResponse.json(
          { error: 'Validation', message: `ops[${i}].clientOpId must be a non-empty string` },
          { status: 400 }
        );
      }
      if (!Number.isInteger(baseVersion) || (baseVersion as number) < 0) {
        return NextResponse.json(
          { error: 'Validation', message: `ops[${i}].baseVersion must be a non-negative integer` },
          { status: 400 }
        );
      }
      if (!op || typeof op !== 'object' || typeof (op as { type?: unknown }).type !== 'string') {
        return NextResponse.json(
          { error: 'Validation', message: `ops[${i}].op must be a WorkspaceOp object with a 'type' string` },
          { status: 400 }
        );
      }

      try {
        const result = appendOp({
          workspaceId: wsId,
          userId: auth.user.userId,
          clientOpId,
          baseVersion: baseVersion as number,
          op: op as WorkspaceOp,
        });
        acks.push({
          clientOpId: result.clientOpId,
          serverId: result.id,
          createdAt: result.createdAt,
          deduped: result.deduped,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'append failed';
        return NextResponse.json(
          { error: 'Internal', message: `ops[${i}]: ${message}` },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ data: { acks } }, { status: 201 });
  } catch (error) {
    console.error('[workspaces/[id]/ops] POST error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to append ops' },
      { status: 500 }
    );
  }
}
