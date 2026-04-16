import webpush from 'web-push';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { createNotification } from '@/lib/bitrix/webhook-handlers';
import type { NotificationType } from '@/types';
import { encrypt, decrypt } from '@/lib/crypto/encryption';

// ==================== VAPID Configuration ====================

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@taskhub.local';

// Configure web-push with VAPID details
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// ==================== Push Subscription Management ====================

/**
 * Save a push subscription for a user.
 * Stores the PushSubscription JSON in the users.push_subscription column.
 */
export function savePushSubscription(userId: number, subscription: PushSubscriptionJSON): void {
  db.update(users)
    .set({
      pushSubscription: encrypt(JSON.stringify(subscription)),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(users.id, userId))
    .run();

  console.log(`[push] Saved push subscription for user ${userId}`);
}

/**
 * Remove the push subscription for a user.
 */
export function removePushSubscription(userId: number): void {
  db.update(users)
    .set({
      pushSubscription: null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(users.id, userId))
    .run();

  console.log(`[push] Removed push subscription for user ${userId}`);
}

/**
 * Get the push subscription for a user.
 * Returns null if the user has no subscription.
 */
export function getPushSubscription(userId: number): webpush.PushSubscription | null {
  const user = db
    .select({ pushSubscription: users.pushSubscription })
    .from(users)
    .where(eq(users.id, userId))
    .get();

  if (!user?.pushSubscription) return null;

  try {
    const decrypted = decrypt(user.pushSubscription);
    return JSON.parse(decrypted) as webpush.PushSubscription;
  } catch {
    console.error(`[push] Failed to parse push subscription for user ${userId}`);
    return null;
  }
}

// ==================== Push Notification Delivery ====================

/** Push notification payload */
interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: {
    url?: string;
    taskId?: number | null;
    portalId?: number | null;
  };
  tag?: string;
}

/**
 * Send a web push notification to a user's device.
 * Returns true if the push was sent successfully, false otherwise.
 */
async function deliverWebPush(userId: number, payload: PushPayload): Promise<boolean> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn('[push] VAPID keys not configured, skipping web push delivery');
    return false;
  }

  const subscription = getPushSubscription(userId);
  if (!subscription) {
    // User has no push subscription, silently skip
    return false;
  }

  try {
    await webpush.sendNotification(
      subscription,
      JSON.stringify(payload),
      {
        TTL: 24 * 60 * 60, // 24 hours
        urgency: 'high',
      }
    );

    console.log(`[push] Web push delivered to user ${userId}: ${payload.title}`);
    return true;
  } catch (error: unknown) {
    const statusCode = (error as { statusCode?: number }).statusCode;

    if (statusCode === 410 || statusCode === 404) {
      // Subscription has expired or is no longer valid
      console.log(`[push] Subscription expired for user ${userId} (${statusCode}), removing`);
      removePushSubscription(userId);
    } else {
      console.error(`[push] Failed to send web push to user ${userId}:`, error);
    }

    return false;
  }
}

// ==================== Main Push Notification Function ====================

/**
 * Send a push notification to a user.
 *
 * Creates a notification record in the database AND attempts to deliver
 * a Web Push notification to the user's subscribed device.
 *
 * `link` overrides the click-through URL. When omitted, the URL falls back
 * to `/tasks/<taskId>` (task-related types) or `/dashboard`.
 *
 * @returns The notification ID from the database
 */
export async function sendPushNotification(params: {
  userId: number;
  type: NotificationType;
  title: string;
  message?: string | null;
  portalId?: number | null;
  taskId?: number | null;
  link?: string | null;
}): Promise<number> {
  // Create the notification in DB
  const notificationId = createNotification({
    userId: params.userId,
    type: params.type,
    title: params.title,
    message: params.message,
    portalId: params.portalId,
    taskId: params.taskId,
    link: params.link,
  });

  // Build the URL for notification click navigation. Explicit `link` wins;
  // otherwise fall back to the task page or dashboard.
  let url = '/dashboard';
  if (params.link) {
    url = params.link;
  } else if (params.taskId) {
    url = `/tasks/${params.taskId}`;
  }

  // Attempt Web Push delivery (non-blocking, errors are handled internally)
  deliverWebPush(params.userId, {
    title: params.title,
    body: params.message || '',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    data: {
      url,
      taskId: params.taskId,
      portalId: params.portalId,
    },
    tag: `taskhub-${params.type}-${params.taskId || notificationId}`,
  }).catch((error) => {
    console.error('[push] Unexpected error in deliverWebPush:', error);
  });

  return notificationId;
}

/**
 * Deliver only the web push notification (no DB record).
 *
 * Used when the DB notification is created separately (e.g., digest with full message
 * in DB but truncated body for push).
 */
export async function deliverPushNotification(params: {
  userId: number;
  type: NotificationType;
  title: string;
  body: string;
  taskId?: number | null;
  portalId?: number | null;
}): Promise<boolean> {
  let url = '/dashboard';
  if (params.taskId) {
    url = `/tasks/${params.taskId}`;
  }

  try {
    return await deliverWebPush(params.userId, {
      title: params.title,
      body: params.body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      data: {
        url,
        taskId: params.taskId,
        portalId: params.portalId,
      },
      tag: `taskhub-${params.type}-${Date.now()}`,
    });
  } catch (error) {
    console.error('[push] Unexpected error in deliverPushNotification:', error);
    return false;
  }
}

// Re-export PushSubscriptionJSON type for API routes
export type { PushSubscriptionJSON };

/** Typed representation of what the browser sends us */
interface PushSubscriptionJSON {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}
