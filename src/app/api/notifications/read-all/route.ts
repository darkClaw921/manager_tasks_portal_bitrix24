import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { notifications } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth, isAuthError } from '@/lib/auth/guards';

/**
 * POST /api/notifications/read-all
 *
 * Mark all notifications as read for the current user.
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (isAuthError(authResult)) return authResult;
  const { user } = authResult;

  db.update(notifications)
    .set({ isRead: true })
    .where(
      and(
        eq(notifications.userId, user.userId),
        eq(notifications.isRead, false)
      )
    )
    .run();

  return NextResponse.json({ data: { success: true } });
}
