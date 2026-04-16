import { db } from '@/lib/db';
import { portals } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { BitrixTokenResponse } from '@/types';
import { encrypt, decrypt } from '@/lib/crypto/encryption';
import { LOCAL_PORTAL_MEMBER_ID } from '@/lib/portals/local';

const BITRIX_OAUTH_URL = 'https://oauth.bitrix.info/oauth/token/';

/**
 * Redact sensitive data (tokens, secrets) from a string before logging.
 * Replaces values of known sensitive URL parameters and JSON fields.
 */
function redactSensitiveData(text: string): string {
  return text
    .replace(
      /(?:access_token|refresh_token|auth|client_secret|application_token)=([^&\s"']+)/gi,
      (match, _value, _offset, _str) => match.replace(_value, '[REDACTED]')
    )
    .replace(
      /"(?:access_token|refresh_token|auth|client_secret|application_token)"\s*:\s*"([^"]+)"/gi,
      (match, value) => match.replace(value, '[REDACTED]')
    );
}

/**
 * Per-portal mutex map to prevent concurrent token refresh race conditions.
 * Key: portalId, Value: Promise chain for serialization.
 */
const refreshMutex = new Map<number, Promise<string>>();

/**
 * Get a valid access token for a portal.
 * If the token is expired, automatically refreshes it.
 */
export async function getValidToken(portalId: number): Promise<string> {
  const portal = db
    .select({
      memberId: portals.memberId,
      accessToken: portals.accessToken,
      refreshToken: portals.refreshToken,
      tokenExpiresAt: portals.tokenExpiresAt,
    })
    .from(portals)
    .where(eq(portals.id, portalId))
    .get();

  if (!portal) {
    throw new Bitrix24Error('PORTAL_NOT_FOUND', `Portal ${portalId} not found`);
  }

  // Last-mile guard: the synthetic local portal has no Bitrix24 integration.
  // If any call-site accidentally reaches the Bitrix branch with the local
  // portal, fail loud and early instead of attempting an OAuth refresh with
  // placeholder 'LOCAL' tokens.
  if (portal.memberId === LOCAL_PORTAL_MEMBER_ID) {
    throw new Bitrix24Error(
      'LOCAL_PORTAL',
      'Local portal has no Bitrix24 integration'
    );
  }

  // Check if token is still valid (with 60s buffer)
  if (portal.tokenExpiresAt) {
    const expiresAt = new Date(portal.tokenExpiresAt).getTime();
    const now = Date.now();
    if (expiresAt - now > 60_000) {
      return decrypt(portal.accessToken);
    }
  }

  // Token is expired or about to expire - refresh with mutex
  return refreshTokenWithMutex(portalId);
}

/**
 * Refresh token with per-portal mutex to prevent race conditions.
 * Multiple concurrent requests to the same portal will share a single refresh.
 */
function refreshTokenWithMutex(portalId: number): Promise<string> {
  const existing = refreshMutex.get(portalId);

  if (existing) {
    // Another refresh is in progress for this portal - wait for it
    return existing;
  }

  const refreshPromise = performTokenRefresh(portalId).finally(() => {
    refreshMutex.delete(portalId);
  });

  refreshMutex.set(portalId, refreshPromise);
  return refreshPromise;
}

/**
 * Actually perform the token refresh against Bitrix24 OAuth server.
 */
async function performTokenRefresh(portalId: number): Promise<string> {
  const portal = db
    .select({
      refreshToken: portals.refreshToken,
      domain: portals.domain,
      clientId: portals.clientId,
      clientSecret: portals.clientSecret,
    })
    .from(portals)
    .where(eq(portals.id, portalId))
    .get();

  if (!portal) {
    throw new Bitrix24Error('PORTAL_NOT_FOUND', `Portal ${portalId} not found`);
  }

  console.log(`[token-manager] Refreshing token for portal ${portalId} (${portal.domain})`);

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: decrypt(portal.clientId),
    client_secret: decrypt(portal.clientSecret),
    refresh_token: decrypt(portal.refreshToken),
  });

  const response = await fetch(`${BITRIX_OAUTH_URL}?${params.toString()}`, {
    method: 'POST',
  });

  if (!response.ok) {
    const errorText = await response.text();
    const safeErrorText = redactSensitiveData(errorText);
    console.error(
      `[token-manager] Token refresh failed for portal ${portalId}: status ${response.status}`,
      safeErrorText
    );
    throw new Bitrix24Error(
      'TOKEN_REFRESH_FAILED',
      `Token refresh failed: ${response.status}`
    );
  }

  const data: BitrixTokenResponse = await response.json();

  // Calculate expiration time
  const tokenExpiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

  // Save new tokens to DB (encrypted)
  db.update(portals)
    .set({
      accessToken: encrypt(data.access_token),
      refreshToken: encrypt(data.refresh_token),
      tokenExpiresAt,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(portals.id, portalId))
    .run();

  console.log(`[token-manager] Token refreshed successfully for portal ${portalId}`);

  return data.access_token;
}

/**
 * Custom error class for Bitrix24-related errors.
 */
export class Bitrix24Error extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'Bitrix24Error';
    this.code = code;
  }
}
