/**
 * POST /api/workspaces/[id]/assets/upload
 *
 * multipart/form-data with a single required `file` part. Persists the
 * bytes via `lib/workspaces/assets.ts:saveAsset` and returns the new
 * asset metadata so the client can immediately add an `image` element
 * to the canvas referencing it.
 *
 * Mirrors `src/app/api/meetings/[id]/messages/upload/route.ts` for
 * consistency: same size cap (25 MiB), same auth pattern, same path
 * containment guard.
 */

import { NextRequest, NextResponse } from 'next/server';
import path from 'node:path';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { canEditWorkspace } from '@/lib/workspaces/access';
import { getWorkspace } from '@/lib/workspaces/workspaces';
import {
  saveAsset,
  ALLOWED_ASSET_MIMES,
  MAX_ASSET_BYTES,
} from '@/lib/workspaces/assets';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

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
        { error: 'Forbidden', message: 'You cannot upload to this workspace' },
        { status: 403 }
      );
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (err) {
      console.warn('[workspaces/assets/upload] formData parse failed:', err);
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid multipart body' },
        { status: 400 }
      );
    }

    const fileEntry = formData.get('file');
    if (!(fileEntry instanceof File)) {
      return NextResponse.json(
        { error: 'Validation', message: 'Missing file field' },
        { status: 400 }
      );
    }

    if (fileEntry.size <= 0) {
      return NextResponse.json(
        { error: 'Validation', message: 'File is empty' },
        { status: 400 }
      );
    }
    if (fileEntry.size > MAX_ASSET_BYTES) {
      return NextResponse.json(
        {
          error: 'PayloadTooLarge',
          message: `File exceeds ${MAX_ASSET_BYTES} bytes`,
        },
        { status: 413 }
      );
    }

    const mime = (fileEntry.type || '').toLowerCase();
    if (!ALLOWED_ASSET_MIMES.has(mime)) {
      return NextResponse.json(
        {
          error: 'Forbidden',
          message:
            'Только изображения PNG, JPEG, WebP и GIF поддерживаются для загрузки',
        },
        { status: 415 }
      );
    }

    const buffer = Buffer.from(await fileEntry.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_ASSET_BYTES) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid file payload' },
        { status: 400 }
      );
    }

    const fileName = path.basename(fileEntry.name || 'image');

    let asset;
    try {
      asset = await saveAsset({
        workspaceId: wsId,
        buffer,
        mime,
        uploadedBy: auth.user.userId,
        kind: 'upload',
        fileName,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save asset';
      console.warn('[workspaces/assets/upload] saveAsset failed:', msg);
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
    console.error('[workspaces/assets/upload] POST error:', error);
    const message = error instanceof Error ? error.message : 'Failed to upload asset';
    return NextResponse.json({ error: 'Internal', message }, { status: 500 });
  }
}
