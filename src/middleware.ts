import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { getJwtSecret } from '@/lib/auth/jwt';

/**
 * Protected route prefixes - unauthenticated users are redirected to /login.
 */
const PROTECTED_PREFIXES = [
  '/dashboard',
  '/tasks',
  '/calendar',
  '/portals',
  '/settings',
  '/reports',
  '/admin',
  '/meetings',
];

/**
 * Explicit public exceptions. Guests joining a meeting via invite link
 * reach `/join/<token>` without an account — keep it outside the
 * protected-prefix check.
 */
const PUBLIC_EXCEPTIONS = [
  '/join/',
];

/**
 * Auth pages - authenticated users are redirected to /dashboard.
 */
const AUTH_PAGES = ['/login'];

/**
 * Verify JWT in edge runtime using jose directly.
 * We duplicate minimal verification logic here because middleware runs in Edge Runtime
 * and cannot import Node.js modules.
 */
async function verifyJWT(token: string): Promise<boolean> {
  try {
    const secret = getJwtSecret();
    await jwtVerify(token, secret, {
      issuer: 'taskhub',
      audience: 'taskhub-users',
    });
    return true;
  } catch {
    return false;
  }
}

function getTokenFromRequest(request: NextRequest): string | null {
  // Try cookie first
  const cookieToken = request.cookies.get('token')?.value;
  if (cookieToken) return cookieToken;

  // Try Authorization header
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return null;
}

/**
 * Add security headers to a response.
 */
function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token = getTokenFromRequest(request);
  const isAuthenticated = token ? await verifyJWT(token) : false;

  // Protected routes: redirect to login if not authenticated
  const isPublicException = PUBLIC_EXCEPTIONS.some((prefix) =>
    pathname.startsWith(prefix)
  );
  const isProtectedRoute =
    !isPublicException &&
    PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (isProtectedRoute && !isAuthenticated) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return addSecurityHeaders(NextResponse.redirect(loginUrl));
  }

  // Auth pages: redirect to dashboard if already authenticated
  const isAuthPage = AUTH_PAGES.some((page) => pathname === page);

  if (isAuthPage && isAuthenticated) {
    return addSecurityHeaders(NextResponse.redirect(new URL('/dashboard', request.url)));
  }

  // Root page: redirect based on auth state
  if (pathname === '/') {
    if (isAuthenticated) {
      return addSecurityHeaders(NextResponse.redirect(new URL('/dashboard', request.url)));
    } else {
      return addSecurityHeaders(NextResponse.redirect(new URL('/login', request.url)));
    }
  }

  return addSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - /api (API routes)
     * - /_next (Next.js internals)
     * - /static (static files)
     * - /favicon.ico
     * - Files with extensions (images, fonts, etc.)
     */
    '/((?!api|_next|static|favicon\\.ico|.*\\..*).*)',
  ],
};
