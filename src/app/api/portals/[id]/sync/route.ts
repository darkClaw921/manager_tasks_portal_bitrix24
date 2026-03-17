import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { portals } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { fullSync } from '@/lib/bitrix/sync';
import { hasPortalAccess } from '@/lib/portals/access';
import { registerEventHandlers, listEventHandlers } from '@/lib/bitrix/events';
import { encrypt } from '@/lib/crypto/encryption';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/portals/[id]/sync
 *
 * Trigger a full sync for a portal: re-register events + stages + all tasks with comments, checklists, files.
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

    // Verify user has access to the portal
    if (!auth.user.isAdmin && !hasPortalAccess(auth.user.userId, portalId)) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Portal not found' },
        { status: 404 }
      );
    }

    const portal = db
      .select()
      .from(portals)
      .where(eq(portals.id, portalId))
      .get();

    if (!portal) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Portal not found' },
        { status: 404 }
      );
    }

    if (!portal.isActive) {
      return NextResponse.json(
        { error: 'Conflict', message: 'Portal is not active' },
        { status: 409 }
      );
    }

    // Re-register event handlers (updates webhook URL if NEXT_PUBLIC_APP_URL changed)
    try {
      const appToken = await registerEventHandlers(portalId);
      if (appToken) {
        db.update(portals)
          .set({ appToken: encrypt(appToken), updatedAt: new Date().toISOString() })
          .where(eq(portals.id, portalId))
          .run();
        console.log(`[sync] Updated app_token for portal ${portalId}`);
      }
    } catch (error) {
      console.error(`[sync] Failed to re-register events for portal ${portalId}:`, error);
    }

    // Diagnostic: list registered events
    try {
      const events = await listEventHandlers(portalId);
      console.log(`[sync] Registered events for portal ${portalId}:`, JSON.stringify(events));
    } catch (error) {
      console.error(`[sync] Failed to list events:`, error);
    }

    // Run full sync (stages + tasks + comments + checklists + files)
    const result = await fullSync(portalId);

    return NextResponse.json({
      data: {
        message: 'Sync completed successfully',
        tasksCount: result.tasksCount,
        errors: result.errors.length > 0 ? result.errors : undefined,
        lastSyncAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[portals/[id]/sync] POST error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Sync failed. Please try again.' },
      { status: 500 }
    );
  }
}
