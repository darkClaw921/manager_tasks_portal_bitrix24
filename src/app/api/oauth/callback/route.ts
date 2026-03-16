import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { portals } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { verifyOAuthState, exchangeCode } from '@/lib/bitrix/oauth';
import { registerEventHandlers } from '@/lib/bitrix/events';
import { fetchStages } from '@/lib/bitrix/stages';
import { grantPortalAccess, hasPortalAccess } from '@/lib/portals/access';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

/**
 * GET /api/oauth/callback
 *
 * Handles the OAuth callback from Bitrix24.
 * Receives code, domain, member_id, state from query params.
 * Exchanges code for tokens and creates/updates portal in DB.
 *
 * Uniqueness is by memberId only (one portal per Bitrix24 instance).
 * Auto-creates user_portal_access for the connecting admin.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const domain = searchParams.get('domain');
    const memberId = searchParams.get('member_id');
    const state = searchParams.get('state');

    // Validate required params
    if (!code || !domain || !memberId || !state) {
      const missing = [];
      if (!code) missing.push('code');
      if (!domain) missing.push('domain');
      if (!memberId) missing.push('member_id');
      if (!state) missing.push('state');
      return NextResponse.redirect(
        `${APP_URL}/portals?error=${encodeURIComponent(`Missing parameters: ${missing.join(', ')}`)}`
      );
    }

    // Verify and decode state (contains userId)
    const userId = await verifyOAuthState(state);
    if (!userId) {
      return NextResponse.redirect(
        `${APP_URL}/portals?error=${encodeURIComponent('Invalid or expired state. Please try connecting again.')}`
      );
    }

    // Exchange authorization code for tokens
    let tokenData;
    try {
      tokenData = await exchangeCode(code);
    } catch (error) {
      console.error('[oauth/callback] Token exchange error:', error);
      return NextResponse.redirect(
        `${APP_URL}/portals?error=${encodeURIComponent('Failed to exchange authorization code. Please try again.')}`
      );
    }

    const tokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
    const clientEndpoint = tokenData.client_endpoint || `https://${domain}/rest/`;
    const now = new Date().toISOString();

    // Check if portal already exists by memberId (unique per Bitrix24 instance)
    const existingPortal = db
      .select()
      .from(portals)
      .where(eq(portals.memberId, memberId))
      .get();

    if (existingPortal) {
      // Update existing portal with new tokens
      db.update(portals)
        .set({
          domain,
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          tokenExpiresAt,
          clientEndpoint,
          isActive: true,
          updatedAt: now,
        })
        .where(eq(portals.id, existingPortal.id))
        .run();

      console.log(`[oauth/callback] Updated portal ${existingPortal.id} (${domain}) for user ${userId}`);

      // Ensure connecting user has admin access
      if (!hasPortalAccess(userId, existingPortal.id)) {
        grantPortalAccess(userId, existingPortal.id, {
          role: 'admin',
          permissions: { canSeeAll: true, canSeeResponsible: true },
        });
        console.log(`[oauth/callback] Granted admin access to user ${userId} for portal ${existingPortal.id}`);
      }

      // Register event handlers and fetch stages in background (non-blocking)
      registerAndSync(existingPortal.id).catch((err) =>
        console.error(`[oauth/callback] Background sync error for portal ${existingPortal.id}:`, err)
      );

      return NextResponse.redirect(
        `${APP_URL}/portals?success=${encodeURIComponent(`Portal ${domain} reconnected successfully`)}&portalId=${existingPortal.id}`
      );
    }

    // Create new portal
    const result = db
      .insert(portals)
      .values({
        userId,
        domain,
        name: domain.split('.')[0] || domain, // Use first part of domain as default name
        memberId,
        clientEndpoint,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        tokenExpiresAt,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const portalId = Number(result.lastInsertRowid);

    console.log(`[oauth/callback] Created new portal ${portalId} (${domain}) for user ${userId}`);

    // Auto-create user_portal_access for connecting admin with full permissions
    grantPortalAccess(userId, portalId, {
      role: 'admin',
      permissions: {
        canSeeAll: true,
        canSeeResponsible: true,
        canSeeAccomplice: false,
        canSeeAuditor: false,
        canSeeCreator: false,
      },
    });
    console.log(`[oauth/callback] Created admin access for user ${userId} on portal ${portalId}`);

    // Register event handlers and fetch stages in background (non-blocking)
    registerAndSync(portalId).catch((err) =>
      console.error(`[oauth/callback] Background sync error for portal ${portalId}:`, err)
    );

    return NextResponse.redirect(
      `${APP_URL}/portals?success=${encodeURIComponent(`Portal ${domain} connected successfully`)}&portalId=${portalId}`
    );
  } catch (error) {
    console.error('[oauth/callback] Unexpected error:', error);
    return NextResponse.redirect(
      `${APP_URL}/portals?error=${encodeURIComponent('An unexpected error occurred. Please try again.')}`
    );
  }
}

/**
 * Register event handlers and fetch stages for a portal.
 * Runs in background after OAuth callback redirect.
 * Saves app_token from event registration.
 */
async function registerAndSync(portalId: number): Promise<void> {
  // 1. Register event handlers
  const appToken = await registerEventHandlers(portalId);

  // Save app_token if received
  if (appToken) {
    db.update(portals)
      .set({ appToken, updatedAt: new Date().toISOString() })
      .where(eq(portals.id, portalId))
      .run();
    console.log(`[oauth/callback] Saved app_token for portal ${portalId}`);
  }

  // 2. Fetch and cache stages
  await fetchStages(portalId);
}
