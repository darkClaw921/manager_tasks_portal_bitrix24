import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { canJoinMeeting } from '@/lib/meetings/access';
import { getMeeting } from '@/lib/meetings/meetings';
import { getRecording, getStreamPath } from '@/lib/meetings/recordings';

type RouteContext = { params: Promise<{ id: string; trackId: string }> };

/**
 * Map file extension to a Content-Type. Falls back to `application/octet-stream`.
 * Kept narrow on purpose — we only serve formats the meeting-worker produces.
 */
function contentTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.mkv':
      return 'video/x-matroska';
    case '.mp4':
      return 'video/mp4';
    case '.webm':
      return 'video/webm';
    case '.ogg':
    case '.oga':
      return 'audio/ogg';
    case '.mp3':
      return 'audio/mpeg';
    case '.m4a':
      return 'audio/mp4';
    case '.wav':
      return 'audio/wav';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Parse an HTTP Range header for a single-range byte request.
 * Returns null when the header is absent/malformed or requests more than
 * one range (multipart/byteranges is intentionally not supported).
 */
function parseRange(
  header: string | null,
  totalSize: number
): { start: number; end: number } | null {
  if (!header) return null;
  // Supported form: "bytes=START-END" or "bytes=START-"
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const startStr = match[1] ?? '';
  const endStr = match[2] ?? '';

  let start: number;
  let end: number;
  if (startStr === '' && endStr === '') {
    return null;
  } else if (startStr === '') {
    // Suffix range: last N bytes.
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
  // Clamp end to file size.
  end = Math.min(end, totalSize - 1);
  return { start, end };
}

/**
 * Adapt a Node readable stream into a Web ReadableStream that Next.js can
 * hand back as a Response body. Errors on the underlying fs stream abort
 * the web stream so the client sees a broken connection instead of hanging.
 */
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
      // `destroy()` is the standard API; fall back gracefully if absent.
      const destroyable = nodeStream as { destroy?: (err?: Error) => void };
      destroyable.destroy?.();
    },
  });
}

/**
 * GET /api/meetings/[id]/recordings/[trackId]
 *
 * Streams a recording file with optional HTTP Range support.
 * - No Range header   → 200 OK, full body.
 * - Valid Range       → 206 Partial Content with Content-Range/Content-Length.
 * - Malformed Range   → 416 Range Not Satisfiable.
 *
 * Access gating mirrors `/api/meetings/[id]` — the caller must pass
 * `canJoinMeeting`. The `trackId` must belong to the `meetingId` in the URL,
 * otherwise 404 (no information leak across meetings).
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { id, trackId } = await context.params;
    const meetingId = parseInt(id, 10);
    const recordingId = parseInt(trackId, 10);

    if (
      !Number.isInteger(meetingId) ||
      meetingId <= 0 ||
      !Number.isInteger(recordingId) ||
      recordingId <= 0
    ) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid id or trackId' },
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

    const recording = getRecording(recordingId);
    if (!recording || recording.meetingId !== meetingId) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Recording not found' },
        { status: 404 }
      );
    }

    if (recording.status !== 'done') {
      return NextResponse.json(
        { error: 'Conflict', message: `Recording is ${recording.status}, not ready` },
        { status: 409 }
      );
    }

    const filePath = getStreamPath(recordingId);
    if (!filePath) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Recording file missing on disk' },
        { status: 404 }
      );
    }

    const stat = fs.statSync(filePath);
    const totalSize = stat.size;
    const mime = contentTypeFor(filePath);
    const filename = path.basename(filePath);

    const rangeHeader = request.headers.get('range');
    const range = parseRange(rangeHeader, totalSize);

    // Common headers for both 200 and 206 responses.
    const baseHeaders: Record<string, string> = {
      'Content-Type': mime,
      'Accept-Ranges': 'bytes',
      // RFC5987-encoded filename so non-ASCII names survive download.
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'private, max-age=0, no-store',
    };

    if (rangeHeader && !range) {
      // Client asked for a range we cannot satisfy.
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
      const nodeStream = fs.createReadStream(filePath, { start, end });
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

    // Full-body response.
    const nodeStream = fs.createReadStream(filePath);
    const body = nodeStreamToWebStream(nodeStream);
    return new NextResponse(body, {
      status: 200,
      headers: {
        ...baseHeaders,
        'Content-Length': String(totalSize),
      },
    });
  } catch (error) {
    console.error('[meetings/[id]/recordings/[trackId]] GET error:', error);
    const message = error instanceof Error ? error.message : 'Failed to stream recording';
    return NextResponse.json(
      { error: 'Internal', message },
      { status: 500 }
    );
  }
}
