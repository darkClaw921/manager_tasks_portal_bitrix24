import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { isPortalAdmin, getPortalUsers, grantPortalAccess, hasPortalAccess } from '@/lib/portals/access';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/portals/[id]/access
 *
 * List all users with access to a portal. Requires portal admin or app admin.
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

    // Check: must be portal admin or app admin
    if (!auth.user.isAdmin && !isPortalAdmin(auth.user.userId, portalId)) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Requires portal admin access' },
        { status: 403 }
      );
    }

    const portalUsers = getPortalUsers(portalId);

    return NextResponse.json({ data: portalUsers });
  } catch (error) {
    console.error('[portals/[id]/access] GET error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/portals/[id]/access
 *
 * Grant a user access to a portal. Requires portal admin or app admin.
 * Body: { userId, role?, canSeeResponsible?, canSeeAccomplice?, canSeeAuditor?, canSeeCreator?, canSeeAll? }
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
    const { userId, role, canSeeResponsible, canSeeAccomplice, canSeeAuditor, canSeeCreator, canSeeAll } = body;

    if (!userId || typeof userId !== 'number') {
      return NextResponse.json(
        { error: 'Validation', message: 'userId is required and must be a number' },
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

    // Check if access already exists
    if (hasPortalAccess(userId, portalId)) {
      return NextResponse.json(
        { error: 'Conflict', message: 'User already has access to this portal' },
        { status: 409 }
      );
    }

    const accessId = grantPortalAccess(userId, portalId, {
      role: role || 'viewer',
      permissions: {
        canSeeResponsible: canSeeResponsible ?? true,
        canSeeAccomplice: canSeeAccomplice ?? false,
        canSeeAuditor: canSeeAuditor ?? false,
        canSeeCreator: canSeeCreator ?? false,
        canSeeAll: canSeeAll ?? false,
      },
    });

    return NextResponse.json(
      { data: { id: accessId, message: 'Access granted' } },
      { status: 201 }
    );
  } catch (error) {
    console.error('[portals/[id]/access] POST error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Internal server error' },
      { status: 500 }
    );
  }
}
