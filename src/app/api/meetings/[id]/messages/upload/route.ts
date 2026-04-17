import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { canJoinMeeting } from '@/lib/meetings/access';
import { getMeeting } from '@/lib/meetings/meetings';
import {
  createFileMessage,
  inferKindFromMime,
} from '@/lib/meetings/messages';
import {
  validateUpload,
  saveUploadToDisk,
  MAX_UPLOAD_BYTES,
} from '@/lib/uploads/safe-upload';

// Default runtime is fine (nodejs); we need fs + sharp.
export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Extract image dimensions via `sharp`. Returns `null` if the library cannot
 * decode the buffer (corrupt file, unsupported format, etc.) — the caller
 * then rejects the upload rather than writing an invalid image row.
 */
async function readImageDimensions(
  buffer: Buffer
): Promise<{ width: number; height: number } | null> {
  try {
    // Dynamic import keeps `sharp` out of the cold start for non-image uploads.
    const sharpModule = await import('sharp');
    const sharpFactory = (sharpModule.default ?? sharpModule) as unknown as (
      input: Buffer
    ) => { metadata: () => Promise<{ width?: number; height?: number }> };
    const meta = await sharpFactory(buffer).metadata();
    const width = typeof meta.width === 'number' ? meta.width : null;
    const height = typeof meta.height === 'number' ? meta.height : null;
    if (!width || !height || width <= 0 || height <= 0) return null;
    return { width, height };
  } catch (err) {
    console.warn('[messages/upload] sharp metadata failed:', err);
    return null;
  }
}

/**
 * POST /api/meetings/[id]/messages/upload
 *
 * multipart/form-data with a single required `file` part (25 MiB max).
 * Stores the bytes under `data/meeting-uploads/<meetingId>/<uuid>_<safeName>`
 * and writes a `meeting_messages` row via `createFileMessage`.
 *
 * For `image/*` uploads the width/height are extracted via `sharp` and
 * persisted so the UI can reserve space for thumbnails without layout shift.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { id } = await context.params;
    const meetingId = parseInt(id, 10);
    if (!Number.isInteger(meetingId) || meetingId <= 0) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid meeting id' },
        { status: 400 }
      );
    }

    const meeting = getMeeting(meetingId);
    if (!meeting) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Meeting not found' },
        { status: 404 }
      );
    }

    const allowed = await canJoinMeeting(auth.user.userId, meetingId);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'You do not have access to this meeting' },
        { status: 403 }
      );
    }

    // Parse multipart. Next.js uses the standard Web FormData API.
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (err) {
      console.warn('[messages/upload] formData parse failed:', err);
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

    const validation = validateUpload(fileEntry);
    if (!validation.valid) {
      const status = validation.status;
      const errKey =
        status === 413
          ? 'PayloadTooLarge'
          : status === 415
            ? 'Forbidden'
            : 'Validation';
      return NextResponse.json(
        { error: errKey, message: validation.reason },
        { status }
      );
    }

    const { safeName, mime: mimeType } = validation;
    const kind = inferKindFromMime(mimeType);

    // Read into memory. 25 MiB cap makes this safe; streaming-to-disk would
    // be more RAM-efficient but complicates the sharp probe for images.
    const arrayBuffer = await fileEntry.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Post-read size verification — guard against clients fibbing in the
    // Content-Length/part header.
    if (buffer.byteLength > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: 'PayloadTooLarge', message: 'File exceeds size limit' },
        { status: 413 }
      );
    }

    // Image probe BEFORE writing to disk — a "broken" image row would render
    // garbage thumbnails and confuse the gallery.
    let width: number | null = null;
    let height: number | null = null;
    if (kind === 'image') {
      const dims = await readImageDimensions(buffer);
      if (!dims) {
        return NextResponse.json(
          {
            error: 'Validation',
            message: 'Unable to read image dimensions — file may be corrupt or unsupported',
          },
          { status: 400 }
        );
      }
      width = dims.width;
      height = dims.height;
    }

    // Build the absolute destination path. Store under
    //   <UPLOAD_ROOT>/<meetingId>/<uuid>_<safeName>
    const uploadRoot =
      process.env.MEETING_UPLOADS_DIR ??
      path.join(process.cwd(), 'data', 'meeting-uploads');
    const meetingDir = path.join(uploadRoot, String(meetingId));

    const saved = await saveUploadToDisk(buffer, {
      dir: meetingDir,
      fileName: safeName,
      mime: mimeType,
    });

    // On DB failure we try to delete the orphaned file to avoid disk leaks.
    let message;
    try {
      message = createFileMessage(meetingId, auth.user.userId, {
        filePath: saved.path,
        fileName: safeName,
        fileSize: saved.size,
        mimeType,
        kind,
        width: width ?? undefined,
        height: height ?? undefined,
      });
    } catch (err) {
      try {
        await fs.promises.unlink(saved.path);
      } catch {
        // ignore — deletion is best-effort
      }
      throw err;
    }

    return NextResponse.json({ data: message }, { status: 201 });
  } catch (error) {
    console.error('[meetings/[id]/messages/upload] POST error:', error);
    const message = error instanceof Error ? error.message : 'Failed to upload file';
    return NextResponse.json(
      { error: 'Internal', message },
      { status: 500 }
    );
  }
}
