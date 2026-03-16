import { SignJWT, jwtVerify } from 'jose';
import type { BitrixTokenResponse } from '@/types';

const BITRIX_CLIENT_ID = process.env.BITRIX_CLIENT_ID || '';
const BITRIX_CLIENT_SECRET = process.env.BITRIX_CLIENT_SECRET || '';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const BITRIX_OAUTH_URL = 'https://oauth.bitrix.info/oauth/token/';

/** Secret key for signing/verifying OAuth state parameter */
const STATE_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'default-dev-secret-change-in-production'
);

/**
 * Generate Bitrix24 OAuth authorization URL.
 *
 * @param domain - Portal domain (e.g., 'company.bitrix24.ru')
 * @param userId - Current authenticated user ID to embed in state
 * @returns Full authorization URL to redirect user to
 */
export async function getAuthUrl(domain: string, userId: number): Promise<string> {
  // Create signed state with userId for CSRF protection
  const state = await new SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10m') // State valid for 10 minutes
    .sign(STATE_SECRET);

  const redirectUri = `${APP_URL}/api/oauth/callback`;

  const params = new URLSearchParams({
    client_id: BITRIX_CLIENT_ID,
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
 * @returns The userId embedded in the state, or null if invalid
 */
export async function verifyOAuthState(state: string): Promise<number | null> {
  try {
    const { payload } = await jwtVerify(state, STATE_SECRET);
    return payload.userId as number;
  } catch {
    return null;
  }
}

/**
 * Exchange an authorization code for access and refresh tokens.
 *
 * @param code - Authorization code from Bitrix24 callback
 * @returns Token response with access_token, refresh_token, etc.
 */
export async function exchangeCode(code: string): Promise<BitrixTokenResponse> {
  const redirectUri = `${APP_URL}/api/oauth/callback`;

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: BITRIX_CLIENT_ID,
    client_secret: BITRIX_CLIENT_SECRET,
    code,
    redirect_uri: redirectUri,
  });

  const response = await fetch(`${BITRIX_OAUTH_URL}?${params.toString()}`, {
    method: 'POST',
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed: ${response.status} ${errorText}`);
  }

  const data: BitrixTokenResponse = await response.json();

  // Validate response has required fields
  if (!data.access_token || !data.refresh_token) {
    throw new Error('Invalid token response: missing access_token or refresh_token');
  }

  return data;
}
