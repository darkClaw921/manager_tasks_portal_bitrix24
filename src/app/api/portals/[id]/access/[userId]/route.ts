import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { isPortalAdmin, updatePortalAccess, revokePortalAccess, getPortalAccess } from '@/lib/portals/access';

type RouteContext = { params: Promise<{ id: string; userId: string }> };

/**
 * GET /api/portals/[id]/access/[userId]
 *
 * Get access details for a specific user on a portal.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { id, userId: targetUserIdStr } = await context.params;
    const portalId = parseInt(id, 10);
    const targetUserId = parseInt(targetUserIdStr, 10);

    if (isNaN(portalId) || isNaN(targetUserId)) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid portal ID or user ID' },
        { status: 400 }
      );
    }

    // Must be portal admin, app admin, or the user themselves
    if (!auth.user.isAdmin && !isPortalAdmin(auth.user.userId, portalId) && auth.user.userId !== targetUserId) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Access denied' },
        { status: 403 }
      );
    }

    const access = getPortalAccess(targetUserId, portalId);
    if (!access) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Access record not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: access });
  } catch (error) {
    console.error('[portals/[id]/access/[userId]] GET error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/portals/[id]/access/[userId]
 *
 * Update permissions for a user on a portal. Requires portal admin or app admin.
 * Body: { role?, canSeeResponsible?, canSeeAccomplice?, canSeeAuditor?, canSeeCreator?, canSeeAll? }
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { id, userId: targetUserIdStr } = await context.params;
    const portalId = parseInt(id, 10);
    const targetUserId = parseInt(targetUserIdStr, 10);

    if (isNaN(portalId) || isNaN(targetUserId)) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid portal ID or user ID' },
        { status: 400 }
      );
    }

    // Must be portal admin or app admin
    if (!auth.user.isAdmin && !isPortalAdmin(auth.user.userId, portalId)) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Requires portal admin access' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { role, canSeeResponsible, canSeeAccomplice, canSeeAuditor, canSeeCreator, canSeeAll } = body;

    // Build permissions update
    const permissions: Record<string, boolean> = {};
    if (typeof canSeeResponsible === 'boolean') permissions.canSeeResponsible = canSeeResponsible;
    if (typeof canSeeAccomplice === 'boolean') permissions.canSeeAccomplice = canSeeAccomplice;
    if (typeof canSeeAuditor === 'boolean') permissions.canSeeAuditor = canSeeAuditor;
    if (typeof canSeeCreator === 'boolean') permissions.canSeeCreator = canSeeCreator;
    if (typeof canSeeAll === 'boolean') permissions.canSeeAll = canSeeAll;

    const updated = updatePortalAccess(targetUserId, portalId, {
      role: role || undefined,
      permissions: Object.keys(permissions).length > 0 ? permissions : undefined,
    });

    if (!updated) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Access record not found' },
        { status: 404 }
      );
    }

    // Return updated access
    const access = getPortalAccess(targetUserId, portalId);

    return NextResponse.json({ data: access });
  } catch (error) {
    console.error('[portals/[id]/access/[userId]] PATCH error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/portals/[id]/access/[userId]
 *
 * Revoke a user's access to a portal. Requires portal admin or app admin.
 * Cannot revoke the last admin's access.
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { id, userId: targetUserIdStr } = await context.params;
    const portalId = parseInt(id, 10);
    const targetUserId = parseInt(targetUserIdStr, 10);

    if (isNaN(portalId) || isNaN(targetUserId)) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid portal ID or user ID' },
        { status: 400 }
      );
    }

    // Must be portal admin or app admin
    if (!auth.user.isAdmin && !isPortalAdmin(auth.user.userId, portalId)) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Requires portal admin access' },
        { status: 403 }
      );
    }

    const revoked = revokePortalAccess(targetUserId, portalId);

    if (!revoked) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Cannot remove the last admin from the portal' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      data: { message: 'Access revoked successfully' },
    });
  } catch (error) {
    console.error('[portals/[id]/access/[userId]] DELETE error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Internal server error' },
      { status: 500 }
    );
  }
}
