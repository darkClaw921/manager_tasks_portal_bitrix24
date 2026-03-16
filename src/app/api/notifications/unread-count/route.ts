import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { notifications } from '@/lib/db/schema';
import { eq, and, count } from 'drizzle-orm';
import { requireAuth, isAuthError } from '@/lib/auth/guards';

/**
 * GET /api/notifications/unread-count
 *
 * Returns the count of unread notifications for the current user.
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (isAuthError(authResult)) return authResult;
  const { user } = authResult;

  const result = db
    .select({ count: count() })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, user.userId),
        eq(notifications.isRead, false)
      )
    )
    .get();

  return NextResponse.json({
    data: { count: result?.count || 0 },
  });
}
