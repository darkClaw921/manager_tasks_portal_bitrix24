import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import {
  canJoinWorkspace,
  canEditWorkspace,
  isOwner,
  addParticipants,
} from '@/lib/workspaces/access';
import {
  getWorkspace,
  markParticipantSeen,
} from '@/lib/workspaces/workspaces';
import { issueLiveKitToken } from '@/lib/meetings/tokens';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/workspaces/[id]/token
 *
 * Mint a LiveKit access token for the current user to join the workspace's
 * room. Uses the same `issueLiveKitToken` helper as the meetings flow —
 * the token grants `canPublishData` so the client can fan out canvas ops
 * and cursor presence over the data channel.
 *
 * Side effects:
 *   - Stamps `workspace_participants.last_seen_at` for the caller.
 *   - For owner-issued tokens we additionally request roomAdmin so the
 *     owner can later issue room-level commands (Phase 3 polish).
 *
 * Response: `{ data: { token, url, roomName } }`.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { id } = await context.params;
    const wsId = parseInt(id, 10);
    if (!Number.isInteger(wsId) || wsId <= 0) {
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

    // Resolve display name (falls back to email).
    const userRow = db
      .select({
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      })
      .from(users)
      .where(eq(users.id, auth.user.userId))
      .get();
    const userName = userRow
      ? `${userRow.firstName} ${userRow.lastName}`.trim() || userRow.email
      : auth.user.email;

    const ownerFlag = await isOwner(auth.user.userId, wsId);

    // Admins who join via override should appear in participants too,
    // otherwise they wouldn't show up in the participants panel for the
    // owner. Idempotent — a real owner row already exists for the owner.
    if (!ownerFlag) {
      const editor = await canEditWorkspace(auth.user.userId, wsId);
      addParticipants(wsId, [auth.user.userId], editor ? 'editor' : 'viewer');
    }

    // Touch lastSeenAt so the participants panel can render "online" badges.
    markParticipantSeen(wsId, auth.user.userId);

    const token = await issueLiveKitToken({
      userId: auth.user.userId,
      userName,
      roomName: ws.roomName,
      isHost: ownerFlag,
    });

    const publicUrl =
      process.env.NEXT_PUBLIC_LIVEKIT_URL ||
      process.env.LIVEKIT_URL ||
      '';

    return NextResponse.json({
      data: {
        token,
        url: publicUrl,
        roomName: ws.roomName,
      },
    });
  } catch (error) {
    console.error('[workspaces/[id]/token] POST error:', error);
    const message = error instanceof Error ? error.message : 'Failed to issue token';
    return NextResponse.json({ error: 'Internal', message }, { status: 500 });
  }
}
