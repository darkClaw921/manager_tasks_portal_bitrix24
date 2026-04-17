import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin, isAuthError } from '@/lib/auth/guards';
import { getUserPortals } from '@/lib/portals/access';

/**
 * GET /api/users/[id]/portals
 *
 * Get portals for a specific user. Admin only.
 * Returns public portal data (no tokens).
 *
 * Uses user_portal_access JOIN portals (via getUserPortals()) so that
 * all portals a user has access to are returned — not only portals
 * where the user is the legacy "owner" (portals.userId).
 *
 * Each entry also exposes access role and permissions
 * (canSeeResponsible, canSeeAccomplice, canSeeAuditor, canSeeCreator,
 * canSeeAll) so the admin UI can show the type of access.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (isAuthError(auth)) return auth;

    const { id } = await context.params;
    const userId = parseInt(id, 10);

    if (isNaN(userId)) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid user ID' },
        { status: 400 }
      );
    }

    // Verify user exists
    const user = db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .get();

    if (!user) {
      return NextResponse.json(
        { error: 'NotFound', message: 'User not found' },
        { status: 404 }
      );
    }

    // Read via user_portal_access (a user can have access to many portals,
    // regardless of who "owns" them). Preserve the previous response shape
    // (id, domain, name, color, memberId, isActive, lastSyncAt, createdAt)
    // and enrich with role + permissions.
    const accessible = getUserPortals(userId);

    const userPortals = accessible.map((p) => ({
      id: p.id,
      domain: p.domain,
      name: p.name,
      color: p.color,
      memberId: p.memberId,
      isActive: p.isActive,
      lastSyncAt: p.lastSyncAt,
      createdAt: p.createdAt,
      role: p.role,
      canSeeResponsible: p.canSeeResponsible,
      canSeeAccomplice: p.canSeeAccomplice,
      canSeeAuditor: p.canSeeAuditor,
      canSeeCreator: p.canSeeCreator,
      canSeeAll: p.canSeeAll,
    }));

    return NextResponse.json({ data: userPortals });
  } catch (error) {
    console.error('[users/[id]/portals] GET error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to fetch user portals' },
      { status: 500 }
    );
  }
}
