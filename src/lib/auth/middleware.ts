import { NextRequest } from 'next/server';
import { verifyToken, type JWTPayload } from './jwt';

/**
 * Extract and verify JWT from request.
 * Checks both cookies ('token') and Authorization header ('Bearer xxx').
 * Returns the decoded JWT payload or null if not authenticated.
 */
export async function getAuthUser(request: NextRequest): Promise<JWTPayload | null> {
  // 1. Try cookie first
  const cookieToken = request.cookies.get('token')?.value;
  if (cookieToken) {
    const payload = await verifyToken(cookieToken);
    if (payload) return payload;
  }

  // 2. Try Authorization header
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const bearerToken = authHeader.slice(7);
    const payload = await verifyToken(bearerToken);
    if (payload) return payload;
  }

  return null;
}
