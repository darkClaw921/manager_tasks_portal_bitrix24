import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { isPortalAdmin, hasPortalAccess } from '@/lib/portals/access';
import { getAllMappingsForPortal, createMapping, deleteMapping } from '@/lib/portals/mappings';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/portals/[id]/mappings
 *
 * List all user-to-Bitrix24 mappings for a portal.
 * Requires portal access (any user with access to this portal).
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { id } = await context.params;
    const portalId = parseInt(id, 10);
    if (isNaN(portalId)) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid portal ID' },
        { status: 400 }
      );
    }

    // Check: any user with portal access can read mappings
    if (!auth.user.isAdmin && !hasPortalAccess(auth.user.userId, portalId)) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Requires portal access' },
        { status: 403 }
      );
    }

    const mappings = getAllMappingsForPortal(portalId);

    return NextResponse.json({ data: mappings });
  } catch (error) {
    console.error('[portals/[id]/mappings] GET error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/portals/[id]/mappings
 *
 * Create a user-to-Bitrix24 mapping.
 * Body: { userId: number, bitrixUserId: string, bitrixName?: string }
 * Requires portal admin or app admin.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { id } = await context.params;
    const portalId = parseInt(id, 10);
    if (isNaN(portalId)) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid portal ID' },
        { status: 400 }
      );
    }

    // Check: must be portal admin or app admin
    if (!auth.user.isAdmin && !isPortalAdmin(auth.user.userId, portalId)) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Requires portal admin access' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { userId, bitrixUserId, bitrixName } = body;

    // Validate required fields
    if (!userId || typeof userId !== 'number') {
      return NextResponse.json(
        { error: 'Validation', message: 'userId is required and must be a number' },
        { status: 400 }
      );
    }

    if (!bitrixUserId || typeof bitrixUserId !== 'string') {
      return NextResponse.json(
        { error: 'Validation', message: 'bitrixUserId is required and must be a string' },
        { status: 400 }
      );
    }

    // Verify user exists
    const user = db.select({ id: users.id }).from(users).where(eq(users.id, userId)).get();
    if (!user) {
      return NextResponse.json(
        { error: 'Not Found', message: 'User not found' },
        { status: 404 }
      );
    }

    // Verify user has access to this portal
    if (!hasPortalAccess(userId, portalId)) {
      return NextResponse.json(
        { error: 'Validation', message: 'User does not have access to this portal' },
        { status: 400 }
      );
    }

    // Create mapping (UNIQUE constraints will throw on duplicate)
    try {
      const mapping = createMapping(userId, portalId, bitrixUserId, bitrixName);
      return NextResponse.json({ data: mapping }, { status: 201 });
    } catch (err) {
      // SQLite UNIQUE constraint violation
      if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
        return NextResponse.json(
          { error: 'Conflict', message: 'Mapping already exists for this user or Bitrix24 user' },
          { status: 409 }
        );
      }
      throw err;
    }
  } catch (error) {
    console.error('[portals/[id]/mappings] POST error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/portals/[id]/mappings
 *
 * Remove a user-to-Bitrix24 mapping.
 * Body: { userId: number }
 * Requires portal admin or app admin.
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { id } = await context.params;
    const portalId = parseInt(id, 10);
    if (isNaN(portalId)) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid portal ID' },
        { status: 400 }
      );
    }

    // Check: must be portal admin or app admin
    if (!auth.user.isAdmin && !isPortalAdmin(auth.user.userId, portalId)) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Requires portal admin access' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { userId } = body;

    if (!userId || typeof userId !== 'number') {
      return NextResponse.json(
        { error: 'Validation', message: 'userId is required and must be a number' },
        { status: 400 }
      );
    }

    const deleted = deleteMapping(userId, portalId);

    if (!deleted) {
      return NextResponse.json(
        { error: 'Not Found', message: 'No mapping found for this user on this portal' },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: { message: 'Mapping deleted' } });
  } catch (error) {
    console.error('[portals/[id]/mappings] DELETE error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Internal server error' },
      { status: 500 }
    );
  }
}
