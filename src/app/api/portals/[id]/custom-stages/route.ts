import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { isPortalAdmin, hasPortalAccess } from '@/lib/portals/access';
import { getCustomStages, createCustomStage } from '@/lib/bitrix/stage-settings';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/portals/[id]/custom-stages
 *
 * List custom stages for a portal with their Bitrix24 stage mappings.
 * Accessible to any user with portal access.
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

    // Check: must have portal access or be app admin
    if (!auth.user.isAdmin && !hasPortalAccess(auth.user.userId, portalId)) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'No access to this portal' },
        { status: 403 }
      );
    }

    const stages = getCustomStages(portalId);

    return NextResponse.json({ data: stages });
  } catch (error) {
    console.error('[portals/[id]/custom-stages] GET error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/portals/[id]/custom-stages
 *
 * Create a new custom stage. Portal admin only.
 * Body: { title: string, color?: string, sort?: number }
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
    const { title, color, sort } = body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json(
        { error: 'Validation', message: 'title is required and must be a non-empty string' },
        { status: 400 }
      );
    }

    const stage = createCustomStage(portalId, {
      title: title.trim(),
      color: color || undefined,
      sort: typeof sort === 'number' ? sort : undefined,
    });

    return NextResponse.json({ data: stage }, { status: 201 });
  } catch (error) {
    console.error('[portals/[id]/custom-stages] POST error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Internal server error' },
      { status: 500 }
    );
  }
}
