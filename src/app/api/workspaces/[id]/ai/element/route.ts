/**
 * POST /api/workspaces/[id]/ai/element
 *
 * Per-element AI editor. Body:
 *   { elementId: string, instruction: string, element: Element }
 *
 * Returns:
 *   { data: { patch: Partial<Element>, explanation: string } }
 *
 * Why we accept the full `element` payload from the client rather than
 * looking it up server-side:
 *   - The canvas keeps an authoritative live state in memory; the
 *     persisted snapshot may be stale by up to ~30s (snapshot debounce).
 *   - Fetching the snapshot + replaying ops would duplicate the
 *     reducer logic and add latency for no real safety win — the
 *     server still validates that the supplied `id`/`kind` are non-
 *     empty strings and the patch is whitelisted by `editElementWithAI`.
 *
 * The server NEVER applies the patch — it only computes & returns it.
 * The client writes the result through the existing `commitOp({type:
 * 'update', id, patch})` pipeline, so realtime + persistence semantics
 * are unchanged.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { canEditWorkspace } from '@/lib/workspaces/access';
import { getWorkspace } from '@/lib/workspaces/workspaces';
import { editElementWithAI } from '@/lib/workspaces/ai';
import { isAIAvailable, AIError } from '@/lib/ai/client';
import type { Element } from '@/types/workspace';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

const MAX_INSTRUCTION_LENGTH = 2000;

function parseId(raw: string): number | null {
  const n = parseInt(raw, 10);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

interface RequestBody {
  elementId: string;
  instruction: string;
  element: Element;
}

function isValidBody(value: unknown): value is RequestBody {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.elementId !== 'string' || v.elementId.length === 0) return false;
  if (typeof v.instruction !== 'string' || v.instruction.trim().length === 0) {
    return false;
  }
  if (!v.element || typeof v.element !== 'object') return false;
  const el = v.element as Record<string, unknown>;
  if (typeof el.id !== 'string' || typeof el.kind !== 'string') return false;
  return true;
}

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

    const allowed = await canEditWorkspace(auth.user.userId, wsId);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'You cannot edit this workspace' },
        { status: 403 }
      );
    }

    if (!isAIAvailable()) {
      return NextResponse.json(
        { error: 'Unavailable', message: 'AI features are disabled (OPENROUTER_API_KEY missing)' },
        { status: 503 }
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
    if (!isValidBody(body)) {
      return NextResponse.json(
        {
          error: 'Validation',
          message: 'Body must be { elementId: string, instruction: string, element: Element }',
        },
        { status: 400 }
      );
    }
    if (body.instruction.length > MAX_INSTRUCTION_LENGTH) {
      return NextResponse.json(
        {
          error: 'Validation',
          message: `instruction exceeds ${MAX_INSTRUCTION_LENGTH} characters`,
        },
        { status: 400 }
      );
    }
    // Cross-check that elementId matches what was supplied — defends
    // against caller bugs that swap one element's id with another.
    if (body.element.id !== body.elementId) {
      return NextResponse.json(
        { error: 'Validation', message: 'elementId does not match element.id' },
        { status: 400 }
      );
    }

    let result;
    try {
      result = await editElementWithAI({
        element: body.element,
        instruction: body.instruction,
      });
    } catch (err) {
      if (err instanceof AIError) {
        return NextResponse.json(
          { error: 'AIError', message: err.message, code: err.code },
          { status: err.code === 'rate_limited' ? 429 : 502 }
        );
      }
      throw err;
    }

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error('[workspaces/[id]/ai/element] POST error:', error);
    const message = error instanceof Error ? error.message : 'Failed to edit element';
    return NextResponse.json({ error: 'Internal', message }, { status: 500 });
  }
}
