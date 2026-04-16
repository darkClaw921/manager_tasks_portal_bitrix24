import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireAdmin, isAuthError } from '@/lib/auth/guards';
import { getAuthUrl } from '@/lib/bitrix/oauth';
import { getUserPortals } from '@/lib/portals/access';
import type { PortalPublic } from '@/types';
import type { PortalWithAccess } from '@/lib/portals/access';

/**
 * Convert PortalWithAccess to public portal (safe for client).
 */
function toPublicPortalWithAccess(portal: PortalWithAccess): PortalPublic & {
  role: string;
  canSeeResponsible: boolean;
  canSeeAccomplice: boolean;
  canSeeAuditor: boolean;
  canSeeCreator: boolean;
  canSeeAll: boolean;
} {
  return {
    id: portal.id,
    userId: 0, // Not relevant in access model, kept for PortalPublic compatibility
    domain: portal.domain,
    name: portal.name,
    color: portal.color,
    memberId: portal.memberId,
    isActive: portal.isActive,
    lastSyncAt: portal.lastSyncAt,
    createdAt: portal.createdAt,
    updatedAt: portal.updatedAt,
    role: portal.role,
    canSeeResponsible: portal.canSeeResponsible,
    canSeeAccomplice: portal.canSeeAccomplice,
    canSeeAuditor: portal.canSeeAuditor,
    canSeeCreator: portal.canSeeCreator,
    canSeeAll: portal.canSeeAll,
  };
}

/**
 * GET /api/portals
 *
 * List all portals the current user has access to (via user_portal_access).
 * Query params: ?active=true (optional, filter by is_active)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { searchParams } = new URL(request.url);
    const activeFilter = searchParams.get('active');

    let userPortals = getUserPortals(auth.user.userId);

    // Optional filter by active status
    if (activeFilter === 'true') {
      userPortals = userPortals.filter((p) => p.isActive);
    } else if (activeFilter === 'false') {
      userPortals = userPortals.filter((p) => !p.isActive);
    }

    return NextResponse.json({
      data: userPortals.map(toPublicPortalWithAccess),
    });
  } catch (error) {
    console.error('[portals] GET error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/portals
 *
 * Initiate connecting a new portal. Requires app admin role.
 * Returns the OAuth URL to redirect user to.
 * Body: { domain: string }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (isAuthError(auth)) return auth;

    const body = await request.json();
    const { domain, clientId, clientSecret, name, color } = body;

    if (!domain || typeof domain !== 'string') {
      return NextResponse.json(
        { error: 'Validation', message: 'Domain is required' },
        { status: 400 }
      );
    }

    if (!clientId || typeof clientId !== 'string') {
      return NextResponse.json(
        { error: 'Validation', message: 'Client ID is required' },
        { status: 400 }
      );
    }

    if (!clientSecret || typeof clientSecret !== 'string') {
      return NextResponse.json(
        { error: 'Validation', message: 'Client Secret is required' },
        { status: 400 }
      );
    }

    // Clean domain: remove protocol, trailing slashes, whitespace
    const cleanDomain = domain
      .trim()
      .replace(/^https?:\/\//, '')
      .replace(/\/+$/, '');

    if (!cleanDomain) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid domain' },
        { status: 400 }
      );
    }

    // Validate optional color (hex string like #RRGGBB)
    const cleanColor = typeof color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(color.trim())
      ? color.trim()
      : undefined;
    const cleanName = typeof name === 'string' && name.trim().length > 0
      ? name.trim()
      : undefined;

    // Generate OAuth URL with per-portal credentials and portal metadata
    const authUrl = await getAuthUrl(
      cleanDomain,
      auth.user.userId,
      clientId.trim(),
      clientSecret.trim(),
      cleanName,
      cleanColor,
    );

    return NextResponse.json({
      data: { authUrl },
    });
  } catch (error) {
    console.error('[portals] POST error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Internal server error' },
      { status: 500 }
    );
  }
}
