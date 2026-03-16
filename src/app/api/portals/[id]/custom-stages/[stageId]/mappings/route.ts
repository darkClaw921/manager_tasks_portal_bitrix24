import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { isPortalAdmin } from '@/lib/portals/access';
import { getCustomStageById, mapBitrixStageToCustom, unmapBitrixStage } from '@/lib/bitrix/stage-settings';
import { db } from '@/lib/db';
import { portalStageMappings, taskStages } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

type RouteContext = { params: Promise<{ id: string; stageId: string }> };

/**
 * GET /api/portals/[id]/custom-stages/[stageId]/mappings
 *
 * List Bitrix24 stages mapped to this custom stage.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { id, stageId: stageIdParam } = await context.params;
    const portalId = parseInt(id, 10);
    const stageId = parseInt(stageIdParam, 10);

    if (isNaN(portalId) || isNaN(stageId)) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid portal ID or stage ID' },
        { status: 400 }
      );
    }

    // Verify stage belongs to this portal
    const existingStage = getCustomStageById(stageId, portalId);
    if (!existingStage) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Custom stage not found' },
        { status: 404 }
      );
    }

    // Get mappings for this custom stage
    const mappings = db
      .select({
        id: portalStageMappings.id,
        bitrixStageId: portalStageMappings.bitrixStageId,
        taskStageTitle: taskStages.title,
        taskStageColor: taskStages.color,
        taskStageBitrixId: taskStages.bitrixStageId,
      })
      .from(portalStageMappings)
      .innerJoin(taskStages, eq(portalStageMappings.bitrixStageId, taskStages.id))
      .where(
        and(
          eq(portalStageMappings.portalId, portalId),
          eq(portalStageMappings.customStageId, stageId)
        )
      )
      .all();

    return NextResponse.json({ data: mappings });
  } catch (error) {
    console.error('[portals/[id]/custom-stages/[stageId]/mappings] GET error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/portals/[id]/custom-stages/[stageId]/mappings
 *
 * Add a Bitrix24 stage mapping to a custom stage. Portal admin only.
 * Body: { bitrixStageId: number }
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { id, stageId: stageIdParam } = await context.params;
    const portalId = parseInt(id, 10);
    const stageId = parseInt(stageIdParam, 10);

    if (isNaN(portalId) || isNaN(stageId)) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid portal ID or stage ID' },
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

    // Verify custom stage belongs to this portal
    const existingStage = getCustomStageById(stageId, portalId);
    if (!existingStage) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Custom stage not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { bitrixStageId } = body;

    if (!bitrixStageId || typeof bitrixStageId !== 'number') {
      return NextResponse.json(
        { error: 'Validation', message: 'bitrixStageId is required and must be a number' },
        { status: 400 }
      );
    }

    // Verify the Bitrix24 stage exists and belongs to this portal
    const taskStage = db
      .select({ id: taskStages.id })
      .from(taskStages)
      .where(
        and(
          eq(taskStages.id, bitrixStageId),
          eq(taskStages.portalId, portalId)
        )
      )
      .get();

    if (!taskStage) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Bitrix24 stage not found for this portal' },
        { status: 404 }
      );
    }

    try {
      const mappingId = mapBitrixStageToCustom(portalId, stageId, bitrixStageId);
      return NextResponse.json(
        { data: { id: mappingId, message: 'Mapping created' } },
        { status: 201 }
      );
    } catch (err) {
      // UNIQUE constraint violation — bitrix stage already mapped
      if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
        return NextResponse.json(
          { error: 'Conflict', message: 'This Bitrix24 stage is already mapped to a custom stage' },
          { status: 409 }
        );
      }
      throw err;
    }
  } catch (error) {
    console.error('[portals/[id]/custom-stages/[stageId]/mappings] POST error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/portals/[id]/custom-stages/[stageId]/mappings
 *
 * Remove a Bitrix24 stage mapping. Portal admin only.
 * Body: { bitrixStageId: number }
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { id, stageId: stageIdParam } = await context.params;
    const portalId = parseInt(id, 10);
    const stageId = parseInt(stageIdParam, 10);

    if (isNaN(portalId) || isNaN(stageId)) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid portal ID or stage ID' },
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

    // Verify custom stage belongs to this portal
    const existingStage = getCustomStageById(stageId, portalId);
    if (!existingStage) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Custom stage not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { bitrixStageId } = body;

    if (!bitrixStageId || typeof bitrixStageId !== 'number') {
      return NextResponse.json(
        { error: 'Validation', message: 'bitrixStageId is required and must be a number' },
        { status: 400 }
      );
    }

    const removed = unmapBitrixStage(portalId, bitrixStageId);

    if (!removed) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Mapping not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: { message: 'Mapping removed' } });
  } catch (error) {
    console.error('[portals/[id]/custom-stages/[stageId]/mappings] DELETE error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Internal server error' },
      { status: 500 }
    );
  }
}
