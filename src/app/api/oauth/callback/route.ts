import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { portals } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { verifyOAuthState, exchangeCode } from '@/lib/bitrix/oauth';
import { registerEventHandlers } from '@/lib/bitrix/events';
import { fetchStages } from '@/lib/bitrix/stages';
import { fullSync } from '@/lib/bitrix/sync';
import { grantPortalAccess, hasPortalAccess } from '@/lib/portals/access';
import { getBitrixUserIdForUser, createMapping } from '@/lib/portals/mappings';
import { encrypt } from '@/lib/crypto/encryption';

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
 * Per-portal client_id/client_secret are stored in the state JWT.
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

    // Verify and decode state (contains userId, clientId, clientSecret)
    const stateData = await verifyOAuthState(state);
    if (!stateData) {
      return NextResponse.redirect(
        `${APP_URL}/portals?error=${encodeURIComponent('Invalid or expired state. Please try connecting again.')}`
      );
    }

    const { userId, clientId, clientSecret, name: portalName, color: portalColor } = stateData;

    // Exchange authorization code for tokens using per-portal credentials
    let tokenData;
    try {
      tokenData = await exchangeCode(code, clientId, clientSecret);
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
      // Update existing portal with new tokens and credentials (encrypted).
      // Also update name/color if user supplied them during reconnect.
      db.update(portals)
        .set({
          domain,
          clientId: encrypt(clientId),
          clientSecret: encrypt(clientSecret),
          accessToken: encrypt(tokenData.access_token),
          refreshToken: encrypt(tokenData.refresh_token),
          tokenExpiresAt,
          clientEndpoint,
          isActive: true,
          updatedAt: now,
          ...(portalName ? { name: portalName } : {}),
          ...(portalColor ? { color: portalColor } : {}),
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

      // Auto-create Bitrix24 user mapping for connecting admin
      if (tokenData.user_id && !getBitrixUserIdForUser(userId, existingPortal.id)) {
        try {
          createMapping(userId, existingPortal.id, String(tokenData.user_id));
          console.log(`[oauth/callback] Created bitrix mapping for user ${userId} -> bitrix ${tokenData.user_id} on portal ${existingPortal.id}`);
        } catch (err) {
          console.warn(`[oauth/callback] Bitrix mapping already exists for portal ${existingPortal.id}:`, err);
        }
      }

      // Register event handlers and fetch stages in background (non-blocking)
      registerAndSync(existingPortal.id).catch((err) =>
        console.error(`[oauth/callback] Background sync error for portal ${existingPortal.id}:`, err)
      );

      return NextResponse.redirect(
        `${APP_URL}/portals?success=${encodeURIComponent(`Portal ${domain} reconnected successfully`)}&portalId=${existingPortal.id}`
      );
    }

    // Create new portal (tokens and credentials encrypted).
    // Use user-supplied name/color from OAuth state; fall back to defaults.
    const result = db
      .insert(portals)
      .values({
        userId,
        domain,
        name: portalName || domain.split('.')[0] || domain,
        memberId,
        clientId: encrypt(clientId),
        clientSecret: encrypt(clientSecret),
        clientEndpoint,
        accessToken: encrypt(tokenData.access_token),
        refreshToken: encrypt(tokenData.refresh_token),
        tokenExpiresAt,
        createdAt: now,
        updatedAt: now,
        ...(portalColor ? { color: portalColor } : {}),
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

    // Auto-create Bitrix24 user mapping for connecting admin
    if (tokenData.user_id) {
      try {
        createMapping(userId, portalId, String(tokenData.user_id));
        console.log(`[oauth/callback] Created bitrix mapping for user ${userId} -> bitrix ${tokenData.user_id} on portal ${portalId}`);
      } catch (err) {
        console.warn(`[oauth/callback] Failed to create bitrix mapping for portal ${portalId}:`, err);
      }
    }

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

  // Save app_token if received (encrypted)
  if (appToken) {
    db.update(portals)
      .set({ appToken: encrypt(appToken), updatedAt: new Date().toISOString() })
      .where(eq(portals.id, portalId))
      .run();
    console.log(`[oauth/callback] Saved app_token for portal ${portalId}`);
  }

  // 2. Fetch and cache stages
  await fetchStages(portalId);

  // 3. Full sync of tasks
  try {
    const result = await fullSync(portalId);
    console.log(`[oauth/callback] Full sync completed for portal ${portalId}: ${result.tasksCount} tasks`);
  } catch (err) {
    console.error(`[oauth/callback] Full sync failed for portal ${portalId}:`, err);
  }
}
