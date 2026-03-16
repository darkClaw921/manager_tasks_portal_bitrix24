import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { hasPortalAccess } from '@/lib/portals/access';
import { getStagesForPortal, fetchStages } from '@/lib/bitrix/stages';
import { getCustomStageMappingsForPortal } from '@/lib/bitrix/stage-settings';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/portals/[id]/stages
 *
 * Get stages for a portal from the local database.
 * Each stage is enriched with customStage info if mapped.
 * Query params:
 *   - entityId: filter by entity ID (default: all)
 *   - refresh: if 'true', re-fetch stages from Bitrix24 before returning
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

    // Verify user has access to this portal
    if (!auth.user.isAdmin && !hasPortalAccess(auth.user.userId, portalId)) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Portal not found' },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const entityIdParam = searchParams.get('entityId');
    const refresh = searchParams.get('refresh') === 'true';

    // Optionally refresh stages from Bitrix24
    if (refresh) {
      const entityId = entityIdParam !== null ? parseInt(entityIdParam, 10) : 0;
      try {
        await fetchStages(portalId, entityId);
      } catch (error) {
        console.error(`[stages] Refresh failed for portal ${portalId}:`, error);
        // Continue to return cached stages even if refresh fails
      }
    }

    // Get stages from local DB
    const entityId = entityIdParam !== null ? parseInt(entityIdParam, 10) : undefined;
    const stages = getStagesForPortal(portalId, entityId);

    // Get custom stage mapping info
    const customStageMappings = getCustomStageMappingsForPortal(portalId);

    // Enrich each stage with custom stage info
    const enrichedStages = stages.map((stage) => {
      const customStage = customStageMappings.get(stage.id) || null;
      return {
        ...stage,
        customStage,
      };
    });

    return NextResponse.json({ data: enrichedStages });
  } catch (error) {
    console.error('[portals/[id]/stages] GET error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Internal server error' },
      { status: 500 }
    );
  }
}
