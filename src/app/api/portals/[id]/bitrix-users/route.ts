import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { isPortalAdmin } from '@/lib/portals/access';
import { fetchBitrixUsers, searchBitrixUsers } from '@/lib/bitrix/users';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/portals/[id]/bitrix-users
 *
 * Fetch Bitrix24 users from the portal.
 * Query params: ?search=query (optional, filters by name/email)
 * Requires portal admin or app admin.
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

    const searchQuery = request.nextUrl.searchParams.get('search');

    let bitrixUsers;
    if (searchQuery && searchQuery.trim().length > 0) {
      bitrixUsers = await searchBitrixUsers(portalId, searchQuery.trim());
    } else {
      bitrixUsers = await fetchBitrixUsers(portalId);
    }

    return NextResponse.json({ data: bitrixUsers });
  } catch (error) {
    console.error('[portals/[id]/bitrix-users] GET error:', error);

    // Handle Bitrix24 API errors gracefully
    if (error instanceof Error && error.name === 'Bitrix24Error') {
      return NextResponse.json(
        { error: 'Bitrix24 Error', message: error.message },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { error: 'Internal', message: 'Internal server error' },
      { status: 500 }
    );
  }
}
