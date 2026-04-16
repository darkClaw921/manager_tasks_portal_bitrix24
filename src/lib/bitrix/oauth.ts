import { SignJWT, jwtVerify } from 'jose';
import type { BitrixTokenResponse } from '@/types';
import { getJwtSecret } from '@/lib/auth/jwt';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const BITRIX_OAUTH_URL = 'https://oauth.bitrix.info/oauth/token/';

/** Secret key for signing/verifying OAuth state parameter (uses shared JWT secret) */
const STATE_SECRET = getJwtSecret();

/**
 * Generate Bitrix24 OAuth authorization URL.
 *
 * @param domain - Portal domain (e.g., 'company.bitrix24.ru')
 * @param userId - Current authenticated user ID to embed in state
 * @param clientId - Bitrix24 app client ID for this portal
 * @param clientSecret - Bitrix24 app client secret for this portal
 * @returns Full authorization URL to redirect user to
 */
export async function getAuthUrl(
  domain: string,
  userId: number,
  clientId: string,
  clientSecret: string,
  name?: string,
  color?: string,
): Promise<string> {
  // Create signed state with userId + credentials + portal metadata for CSRF protection
  const state = await new SignJWT({ userId, clientId, clientSecret, name, color })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10m') // State valid for 10 minutes
    .sign(STATE_SECRET);

  const redirectUri = `${APP_URL}/api/oauth/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
  });

  // Normalize domain: remove protocol if present, remove trailing slash
  const cleanDomain = domain
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');

  return `https://${cleanDomain}/oauth/authorize/?${params.toString()}`;
}

/**
 * Verify and decode the OAuth state parameter.
 *
 * @param state - The state string from the callback
 * @returns Object with userId, clientId, clientSecret or null if invalid
 */
export async function verifyOAuthState(
  state: string,
): Promise<{ userId: number; clientId: string; clientSecret: string; name?: string; color?: string } | null> {
  try {
    const { payload } = await jwtVerify(state, STATE_SECRET);
    const userId = payload.userId as number;
    const clientId = payload.clientId as string;
    const clientSecret = payload.clientSecret as string;
    const name = payload.name as string | undefined;
    const color = payload.color as string | undefined;
    if (!userId || !clientId || !clientSecret) return null;
    return { userId, clientId, clientSecret, name, color };
  } catch {
    return null;
  }
}

/**
 * Exchange an authorization code for access and refresh tokens.
 *
 * @param code - Authorization code from Bitrix24 callback
 * @param clientId - Bitrix24 app client ID
 * @param clientSecret - Bitrix24 app client secret
 * @returns Token response with access_token, refresh_token, etc.
 */
export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
): Promise<BitrixTokenResponse> {
  const redirectUri = `${APP_URL}/api/oauth/callback`;

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  });

  const response = await fetch(`${BITRIX_OAUTH_URL}?${params.toString()}`, {
    method: 'POST',
  });

  if (!response.ok) {
    // Do not include full error body in thrown error — it may contain tokens in URL params
    console.error(`[oauth] Token exchange failed: status ${response.status}`);
    throw new Error(`Token exchange failed: ${response.status}`);
  }

  const data: BitrixTokenResponse = await response.json();

  // Validate response has required fields
  if (!data.access_token || !data.refresh_token) {
    throw new Error('Invalid token response: missing access_token or refresh_token');
  }

  return data;
}
