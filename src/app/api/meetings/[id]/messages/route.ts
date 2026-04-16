import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { canJoinMeeting } from '@/lib/meetings/access';
import { getMeeting } from '@/lib/meetings/meetings';
import {
  listMessages,
  createTextMessage,
  MAX_TEXT_LENGTH,
  MAX_LIMIT,
  DEFAULT_LIMIT,
} from '@/lib/meetings/messages';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/meetings/[id]/messages
 *
 * Returns a newest-first page of chat messages for the meeting.
 *
 * Query params:
 *   - `limit`:  1..100, default 50.
 *   - `before`: ISO 8601 cursor. Returns messages strictly older than this
 *               instant. Omit for the most recent page.
 *
 * Response: `{ items: MeetingMessage[], nextBefore: string | null }`.
 * `nextBefore` is the `createdAt` of the last (oldest) item in the page, or
 * `null` when the page is smaller than `limit` (= no more history).
 *
 * 403 when the caller is not allowed to join the meeting. 404 when missing.
 */
export async function GET(request: NextRequest, context: RouteContext) {
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

    const url = new URL(request.url);
    const limitRaw = url.searchParams.get('limit');
    const beforeRaw = url.searchParams.get('before');

    let limit = DEFAULT_LIMIT;
    if (limitRaw !== null) {
      const parsed = Number.parseInt(limitRaw, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return NextResponse.json(
          { error: 'Validation', message: 'limit must be a positive integer' },
          { status: 400 }
        );
      }
      limit = Math.min(parsed, MAX_LIMIT);
    }

    let before: Date | undefined;
    if (beforeRaw !== null) {
      const parsed = new Date(beforeRaw);
      if (!Number.isFinite(parsed.getTime())) {
        return NextResponse.json(
          { error: 'Validation', message: 'before must be a valid ISO date' },
          { status: 400 }
        );
      }
      before = parsed;
    }

    const items = listMessages(meetingId, { limit, before });
    // Oldest item in the returned page (since we return newest-first).
    const nextBefore =
      items.length === limit ? items[items.length - 1]?.createdAt ?? null : null;

    return NextResponse.json({ items, nextBefore });
  } catch (error) {
    console.error('[meetings/[id]/messages] GET error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to list messages' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/meetings/[id]/messages
 *
 * Creates a new text message. Body: `{ content: string }` — trimmed
 * server-side, must be non-empty and at most `MAX_TEXT_LENGTH` (4000) chars.
 *
 * Response: `201 { data: MeetingMessage }`.
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    const content =
      typeof body === 'object' && body !== null && 'content' in body
        ? (body as { content: unknown }).content
        : null;

    if (typeof content !== 'string') {
      return NextResponse.json(
        { error: 'Validation', message: 'content must be a string' },
        { status: 400 }
      );
    }

    const trimmed = content.trim();
    if (!trimmed) {
      return NextResponse.json(
        { error: 'Validation', message: 'content must not be empty' },
        { status: 400 }
      );
    }
    if (trimmed.length > MAX_TEXT_LENGTH) {
      return NextResponse.json(
        {
          error: 'Validation',
          message: `content exceeds ${MAX_TEXT_LENGTH} characters`,
        },
        { status: 400 }
      );
    }

    const message = createTextMessage(meetingId, auth.user.userId, trimmed);
    return NextResponse.json({ data: message }, { status: 201 });
  } catch (error) {
    console.error('[meetings/[id]/messages] POST error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create message';
    return NextResponse.json(
      { error: 'Internal', message },
      { status: 500 }
    );
  }
}
