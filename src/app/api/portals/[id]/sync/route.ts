import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { portals } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { fullSync } from '@/lib/bitrix/sync';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/portals/[id]/sync
 *
 * Trigger a full sync for a portal: stages + all tasks with comments, checklists, files.
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

    // Verify portal belongs to user and is active
    const portal = db
      .select()
      .from(portals)
      .where(
        and(
          eq(portals.id, portalId),
          eq(portals.userId, auth.user.userId)
        )
      )
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
