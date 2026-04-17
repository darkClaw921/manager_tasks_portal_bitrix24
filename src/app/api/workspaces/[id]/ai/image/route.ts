/**
 * POST /api/workspaces/[id]/ai/image
 *
 * Body: `{ prompt: string }` (1..2000 chars).
 *
 * Pipeline:
 *   1. Auth + canEditWorkspace.
 *   2. `generateImage(prompt)` → bytes + MIME via OpenRouter
 *      (`google/gemini-2.5-flash-image-preview`).
 *   3. `saveAsset({ kind: 'ai', uploadedBy: null, … })` →
 *      `workspace_assets` row.
 *   4. Respond `{ data: { assetId, mime, width, height } }`.
 *
 * The route does NOT auto-create the canvas `image` element — that
 * happens client-side via `commitOp({type:'add', el:{kind:'image',
 * assetId,…}})`. Keeps the route stateless w.r.t. canvas semantics
 * (placement, dimensions, z-order all live in the caller).
 *
 * Generation can take 10-30s. The route holds the connection open;
 * Phase 3 polish may move to async + polling if upstream latencies
 * grow.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { canEditWorkspace } from '@/lib/workspaces/access';
import { getWorkspace } from '@/lib/workspaces/workspaces';
import { generateImage } from '@/lib/workspaces/ai';
import { saveAsset } from '@/lib/workspaces/assets';
import { isAIAvailable, AIError } from '@/lib/ai/client';

export const runtime = 'nodejs';
export const maxDuration = 60; // seconds — image generation can be slow

type RouteContext = { params: Promise<{ id: string }> };

const MAX_PROMPT_LENGTH = 2000;

function parseId(raw: string): number | null {
  const n = parseInt(raw, 10);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
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
    const prompt =
      typeof body === 'object' && body !== null && 'prompt' in body
        ? (body as { prompt: unknown }).prompt
        : null;
    if (typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Validation', message: 'prompt must be a string' },
        { status: 400 }
      );
    }
    const trimmed = prompt.trim();
    if (!trimmed) {
      return NextResponse.json(
        { error: 'Validation', message: 'prompt must not be empty' },
        { status: 400 }
      );
    }
    if (trimmed.length > MAX_PROMPT_LENGTH) {
      return NextResponse.json(
        {
          error: 'Validation',
          message: `prompt exceeds ${MAX_PROMPT_LENGTH} characters`,
        },
        { status: 400 }
      );
    }

    let generated;
    try {
      generated = await generateImage({ prompt: trimmed });
    } catch (err) {
      if (err instanceof AIError) {
        const status =
          err.code === 'rate_limited'
            ? 429
            : err.code === 'missing_api_key'
              ? 503
              : 502;
        return NextResponse.json(
          { error: 'AIError', message: err.message, code: err.code },
          { status }
        );
      }
      throw err;
    }

    let asset;
    try {
      asset = await saveAsset({
        workspaceId: wsId,
        buffer: generated.buffer,
        mime: generated.mime,
        uploadedBy: null, // AI-generated — no human author
        kind: 'ai',
        fileName: `ai_${Date.now()}.${generated.mime.split('/')[1] ?? 'png'}`,
        // generateImage doesn't probe dims — saveAsset will run sharp.
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save asset';
      console.warn('[workspaces/ai/image] saveAsset failed:', msg);
      return NextResponse.json(
        { error: 'Validation', message: msg },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        data: {
          assetId: asset.id,
          mime: asset.mime,
          width: asset.width,
          height: asset.height,
          createdAt: asset.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[workspaces/ai/image] POST error:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate image';
    return NextResponse.json({ error: 'Internal', message }, { status: 500 });
  }
}
