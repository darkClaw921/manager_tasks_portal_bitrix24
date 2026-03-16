import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { isPortalAdmin } from '@/lib/portals/access';
import { getCustomStageById, updateCustomStage, deleteCustomStage } from '@/lib/bitrix/stage-settings';

type RouteContext = { params: Promise<{ id: string; stageId: string }> };

/**
 * PATCH /api/portals/[id]/custom-stages/[stageId]
 *
 * Update a custom stage. Portal admin only.
 * Body: { title?: string, color?: string, sort?: number }
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
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

    // Verify stage belongs to this portal
    const existingStage = getCustomStageById(stageId, portalId);
    if (!existingStage) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Custom stage not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { title, color, sort } = body;

    const updateData: { title?: string; color?: string; sort?: number } = {};
    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim().length === 0) {
        return NextResponse.json(
          { error: 'Validation', message: 'title must be a non-empty string' },
          { status: 400 }
        );
      }
      updateData.title = title.trim();
    }
    if (color !== undefined) updateData.color = color;
    if (sort !== undefined && typeof sort === 'number') updateData.sort = sort;

    updateCustomStage(stageId, updateData);

    // Return updated stage
    const updated = getCustomStageById(stageId, portalId);

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error('[portals/[id]/custom-stages/[stageId]] PATCH error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/portals/[id]/custom-stages/[stageId]
 *
 * Delete a custom stage. Cascades to portal_stage_mappings.
 * Portal admin only.
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

    // Verify stage belongs to this portal
    const existingStage = getCustomStageById(stageId, portalId);
    if (!existingStage) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Custom stage not found' },
        { status: 404 }
      );
    }

    deleteCustomStage(stageId);

    return NextResponse.json({ data: { message: 'Custom stage deleted' } });
  } catch (error) {
    console.error('[portals/[id]/custom-stages/[stageId]] DELETE error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Internal server error' },
      { status: 500 }
    );
  }
}
