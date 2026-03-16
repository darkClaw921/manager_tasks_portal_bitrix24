import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from './middleware';
import type { JWTPayload } from './jwt';

/**
 * Require authentication. Returns the user payload or a 401 response.
 */
export async function requireAuth(
  request: NextRequest
): Promise<{ user: JWTPayload } | NextResponse> {
  const user = await getAuthUser(request);

  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Требуется авторизация' },
      { status: 401 }
    );
  }

  return { user };
}

/**
 * Require admin role. Returns the user payload or 401/403 response.
 */
export async function requireAdmin(
  request: NextRequest
): Promise<{ user: JWTPayload } | NextResponse> {
  const result = await requireAuth(request);

  if (result instanceof NextResponse) {
    return result;
  }

  if (!result.user.isAdmin) {
    return NextResponse.json(
      { error: 'Forbidden', message: 'Требуются права администратора' },
      { status: 403 }
    );
  }

  return result;
}

/**
 * Helper to check if a result is an auth error response
 */
export function isAuthError(result: { user: JWTPayload } | NextResponse): result is NextResponse {
  return result instanceof NextResponse;
}
