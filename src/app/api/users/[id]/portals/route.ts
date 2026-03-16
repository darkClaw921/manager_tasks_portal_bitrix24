import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, portals } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin, isAuthError } from '@/lib/auth/guards';

/**
 * GET /api/users/[id]/portals
 *
 * Get portals for a specific user. Admin only.
 * Returns public portal data (no tokens).
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

    const userPortals = db
      .select({
        id: portals.id,
        domain: portals.domain,
        name: portals.name,
        color: portals.color,
        memberId: portals.memberId,
        isActive: portals.isActive,
        lastSyncAt: portals.lastSyncAt,
        createdAt: portals.createdAt,
      })
      .from(portals)
      .where(eq(portals.userId, userId))
      .all();

    return NextResponse.json({ data: userPortals });
  } catch (error) {
    console.error('[users/[id]/portals] GET error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to fetch user portals' },
      { status: 500 }
    );
  }
}
