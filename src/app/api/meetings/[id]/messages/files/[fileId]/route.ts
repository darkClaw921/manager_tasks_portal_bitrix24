import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { canJoinMeeting } from '@/lib/meetings/access';
import { getMeeting } from '@/lib/meetings/meetings';
import { getMessage } from '@/lib/meetings/messages';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string; fileId: string }> };

/**
 * Parse an HTTP Range header for a single byte-range request.
 * Returns null when the header is absent/malformed or requests more than
 * one range (multipart/byteranges is intentionally not supported).
 *
 * Copy of the helper used by `recordings/[trackId]` — once we have a third
 * streaming endpoint we should factor this out into `lib/http/range.ts`.
 */
function parseRange(
  header: string | null,
  totalSize: number
): { start: number; end: number } | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const startStr = match[1] ?? '';
  const endStr = match[2] ?? '';

  let start: number;
  let end: number;
  if (startStr === '' && endStr === '') {
    return null;
  } else if (startStr === '') {
    const suffix = Number.parseInt(endStr, 10);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(totalSize - suffix, 0);
    end = totalSize - 1;
  } else {
    start = Number.parseInt(startStr, 10);
    end = endStr === '' ? totalSize - 1 : Number.parseInt(endStr, 10);
  }

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end < start ||
    start >= totalSize
  ) {
    return null;
  }
  end = Math.min(end, totalSize - 1);
  return { start, end };
}

/** Wrap a Node readable into a Web `ReadableStream<Uint8Array>` for Next. */
function nodeStreamToWebStream(
  nodeStream: NodeJS.ReadableStream
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on('data', (chunk: Buffer | string) => {
        const bytes =
          typeof chunk === 'string'
            ? new TextEncoder().encode(chunk)
            : new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
        controller.enqueue(bytes);
      });
      nodeStream.on('end', () => controller.close());
      nodeStream.on('error', (err) => controller.error(err));
    },
    cancel() {
      const destroyable = nodeStream as { destroy?: (err?: Error) => void };
      destroyable.destroy?.();
    },
  });
}

/**
 * GET /api/meetings/[id]/messages/files/[fileId]
 *
 * Streams a file attached to a chat message.
 *
 * Access: `canJoinMeeting` on the URL meeting (same gating as `/recordings/`).
 * `fileId` is `meeting_messages.id` and must belong to the URL meeting — a
 * mismatch returns 404 (no cross-meeting information leak).
 *
 * Content-Disposition:
 *   - `image/*` → `inline` so browsers render thumbnails/lightbox images.
 *   - anything else → `attachment` with the original filename, so the file
 *     downloads instead of navigating away from the meeting.
 *
 * Supports HTTP `Range` for resumable downloads + video scrubbing.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { id, fileId } = await context.params;
    const meetingId = parseInt(id, 10);
    const messageId = parseInt(fileId, 10);

    if (
      !Number.isInteger(meetingId) ||
      meetingId <= 0 ||
      !Number.isInteger(messageId) ||
      messageId <= 0
    ) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid id or fileId' },
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

    const message = getMessage(messageId);
    // Require the message belongs to this meeting and is a file/image type.
    if (
      !message ||
      message.meetingId !== meetingId ||
      message.kind === 'text' ||
      !message.filePath
    ) {
      return NextResponse.json(
        { error: 'Not Found', message: 'File not found' },
        { status: 404 }
      );
    }

    // Containment: ensure the stored `filePath` lies inside the configured
    // upload root. This protects against a compromised DB row pointing at an
    // arbitrary on-disk location.
    const uploadRoot = path.resolve(
      process.env.MEETING_UPLOADS_DIR ??
        path.join(process.cwd(), 'data', 'meeting-uploads')
    );
    const resolvedFile = path.resolve(message.filePath);
    if (!resolvedFile.startsWith(uploadRoot + path.sep)) {
      console.warn(
        `[messages/files] Refused to serve path outside upload root: ${resolvedFile}`
      );
      return NextResponse.json(
        { error: 'Not Found', message: 'File not found' },
        { status: 404 }
      );
    }

    let stat: fs.Stats;
    try {
      stat = fs.statSync(resolvedFile);
    } catch {
      return NextResponse.json(
        { error: 'Not Found', message: 'File missing on disk' },
        { status: 404 }
      );
    }
    if (!stat.isFile()) {
      return NextResponse.json(
        { error: 'Not Found', message: 'File missing on disk' },
        { status: 404 }
      );
    }

    const totalSize = stat.size;
    const mime = message.mimeType ?? 'application/octet-stream';
    const filename = message.fileName ?? path.basename(resolvedFile);
    const disposition = message.kind === 'image' ? 'inline' : 'attachment';

    const rangeHeader = request.headers.get('range');
    const range = parseRange(rangeHeader, totalSize);

    const baseHeaders: Record<string, string> = {
      'Content-Type': mime,
      'Accept-Ranges': 'bytes',
      // RFC5987 encoding so non-ASCII filenames survive download.
      'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'private, max-age=0, no-store',
    };

    if (rangeHeader && !range) {
      return new NextResponse(null, {
        status: 416,
        headers: {
          ...baseHeaders,
          'Content-Range': `bytes */${totalSize}`,
        },
      });
    }

    if (range) {
      const { start, end } = range;
      const chunkSize = end - start + 1;
      const nodeStream = fs.createReadStream(resolvedFile, { start, end });
      const body = nodeStreamToWebStream(nodeStream);
      return new NextResponse(body, {
        status: 206,
        headers: {
          ...baseHeaders,
          'Content-Range': `bytes ${start}-${end}/${totalSize}`,
          'Content-Length': String(chunkSize),
        },
      });
    }

    const nodeStream = fs.createReadStream(resolvedFile);
    const body = nodeStreamToWebStream(nodeStream);
    return new NextResponse(body, {
      status: 200,
      headers: {
        ...baseHeaders,
        'Content-Length': String(totalSize),
      },
    });
  } catch (error) {
    console.error('[meetings/[id]/messages/files/[fileId]] GET error:', error);
    const message = error instanceof Error ? error.message : 'Failed to stream file';
    return NextResponse.json(
      { error: 'Internal', message },
      { status: 500 }
    );
  }
}
