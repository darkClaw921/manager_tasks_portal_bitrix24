import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

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
    const secret = new TextEncoder().encode(
      process.env.JWT_SECRET || 'default-dev-secret-change-in-production'
    );
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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token = getTokenFromRequest(request);
  const isAuthenticated = token ? await verifyJWT(token) : false;

  // Protected routes: redirect to login if not authenticated
  const isProtectedRoute = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );

  if (isProtectedRoute && !isAuthenticated) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Auth pages: redirect to dashboard if already authenticated
  const isAuthPage = AUTH_PAGES.some((page) => pathname === page);

  if (isAuthPage && isAuthenticated) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Root page: redirect based on auth state
  if (pathname === '/') {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    } else {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  return NextResponse.next();
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
