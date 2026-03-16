import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { portals } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { unregisterEventHandlers } from '@/lib/bitrix/events';
import { hasPortalAccess, isPortalAdmin } from '@/lib/portals/access';
import type { PortalPublic } from '@/types';

/**
 * Strip sensitive token fields from a portal record.
 */
function toPublicPortal(portal: typeof portals.$inferSelect): PortalPublic {
  return {
    id: portal.id,
    userId: portal.userId,
    domain: portal.domain,
    name: portal.name,
    color: portal.color,
    memberId: portal.memberId,
    isActive: portal.isActive,
    lastSyncAt: portal.lastSyncAt,
    createdAt: portal.createdAt,
    updatedAt: portal.updatedAt,
  };
}

/**
 * Get portal by ID (no user filter — access is checked separately).
 */
function getPortalById(portalId: number) {
  return db
    .select()
    .from(portals)
    .where(eq(portals.id, portalId))
    .get() || null;
}

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/portals/[id]
 *
 * Get details of a specific portal. Requires user to have access via user_portal_access.
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

    // Check access via user_portal_access (or app admin)
    if (!auth.user.isAdmin && !hasPortalAccess(auth.user.userId, portalId)) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Portal not found' },
        { status: 404 }
      );
    }

    const portal = getPortalById(portalId);
    if (!portal) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Portal not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: toPublicPortal(portal) });
  } catch (error) {
    console.error('[portals/[id]] GET error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/portals/[id]
 *
 * Update portal properties (name, color, isActive).
 * Requires portal admin or app admin.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
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

    // Require portal admin or app admin
    if (!auth.user.isAdmin && !isPortalAdmin(auth.user.userId, portalId)) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Requires portal admin access' },
        { status: 403 }
      );
    }

    const portal = getPortalById(portalId);
    if (!portal) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Portal not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };

    if (typeof body.name === 'string' && body.name.trim()) {
      updates.name = body.name.trim();
    }
    if (typeof body.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(body.color)) {
      updates.color = body.color;
    }
    if (typeof body.isActive === 'boolean') {
      updates.isActive = body.isActive;
    }

    db.update(portals)
      .set(updates)
      .where(eq(portals.id, portalId))
      .run();

    // Return updated portal
    const updated = getPortalById(portalId);
    return NextResponse.json({ data: updated ? toPublicPortal(updated) : null });
  } catch (error) {
    console.error('[portals/[id]] PATCH error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/portals/[id]
 *
 * Soft-delete a portal (set is_active=false).
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

    // Require portal admin or app admin
    if (!auth.user.isAdmin && !isPortalAdmin(auth.user.userId, portalId)) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Requires portal admin access' },
        { status: 403 }
      );
    }

    const portal = getPortalById(portalId);
    if (!portal) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Portal not found' },
        { status: 404 }
      );
    }

    // Unregister event handlers (non-blocking)
    unregisterEventHandlers(portalId).catch((err) =>
      console.error(`[portals/[id]] Failed to unregister events for portal ${portalId}:`, err)
    );

    // Soft delete: set is_active to false
    db.update(portals)
      .set({
        isActive: false,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(portals.id, portalId))
      .run();

    return NextResponse.json({
      data: { message: 'Portal disconnected successfully' },
    });
  } catch (error) {
    console.error('[portals/[id]] DELETE error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Internal server error' },
      { status: 500 }
    );
  }
}
