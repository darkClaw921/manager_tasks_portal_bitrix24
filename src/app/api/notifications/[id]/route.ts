import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { notifications } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth, isAuthError } from '@/lib/auth/guards';

/**
 * PATCH /api/notifications/[id]
 *
 * Mark a single notification as read.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (isAuthError(authResult)) return authResult;
  const { user } = authResult;

  const { id } = await context.params;
  const notificationId = parseInt(id, 10);

  if (isNaN(notificationId)) {
    return NextResponse.json(
      { error: 'Bad Request', message: 'Invalid notification ID' },
      { status: 400 }
    );
  }

  // Verify the notification belongs to the user
  const notification = db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.userId, user.userId)
      )
    )
    .get();

  if (!notification) {
    return NextResponse.json(
      { error: 'Not Found', message: 'Уведомление не найдено' },
      { status: 404 }
    );
  }

  db.update(notifications)
    .set({ isRead: true })
    .where(eq(notifications.id, notificationId))
    .run();

  return NextResponse.json({ data: { id: notificationId, isRead: true } });
}
