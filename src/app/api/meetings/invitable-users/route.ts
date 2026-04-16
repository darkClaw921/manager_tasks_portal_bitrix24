import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { ne } from 'drizzle-orm';

/**
 * GET /api/meetings/invitable-users
 *
 * Returns a minimal user list (id + first/last name) any authenticated user
 * can consume for building an invite picker. We deliberately exclude email
 * and admin flags — those are admin-only surface (`/api/users`).
 *
 * The caller themselves is excluded (you cannot invite yourself).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const rows = db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(users)
      .where(ne(users.id, auth.user.userId))
      .orderBy(users.firstName, users.lastName)
      .all();

    return NextResponse.json({ data: rows });
  } catch (error) {
    console.error('[meetings/invitable-users] GET error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}
