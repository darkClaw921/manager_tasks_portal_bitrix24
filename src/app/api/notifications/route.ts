import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { notifications, portals } from '@/lib/db/schema';
import { eq, and, desc, count } from 'drizzle-orm';
import { requireAuth, isAuthError } from '@/lib/auth/guards';

/**
 * GET /api/notifications
 *
 * Returns paginated list of notifications for the current user.
 * Query params:
 * - page (default: 1)
 * - limit (default: 20, max: 50)
 * - is_read (optional: "true" | "false")
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (isAuthError(authResult)) return authResult;
  const { user } = authResult;

  const searchParams = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
  const isReadParam = searchParams.get('is_read');
  const offset = (page - 1) * limit;

  // Build conditions
  const conditions = [eq(notifications.userId, user.userId)];

  if (isReadParam === 'true') {
    conditions.push(eq(notifications.isRead, true));
  } else if (isReadParam === 'false') {
    conditions.push(eq(notifications.isRead, false));
  }

  const where = conditions.length === 1 ? conditions[0] : and(...conditions);

  // Get total count
  const totalResult = db
    .select({ count: count() })
    .from(notifications)
    .where(where)
    .get();

  const total = totalResult?.count || 0;

  // Get notifications with portal info
  const items = db
    .select({
      id: notifications.id,
      userId: notifications.userId,
      type: notifications.type,
      title: notifications.title,
      message: notifications.message,
      portalId: notifications.portalId,
      taskId: notifications.taskId,
      isRead: notifications.isRead,
      createdAt: notifications.createdAt,
      portalName: portals.name,
      portalColor: portals.color,
      portalDomain: portals.domain,
    })
    .from(notifications)
    .leftJoin(portals, eq(notifications.portalId, portals.id))
    .where(where)
    .orderBy(desc(notifications.createdAt))
    .limit(limit)
    .offset(offset)
    .all();

  return NextResponse.json({
    data: items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}
