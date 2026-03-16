import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { savePushSubscription, removePushSubscription } from '@/lib/notifications/push';

/**
 * POST /api/notifications/subscribe
 *
 * Save a push subscription for the authenticated user.
 * Body: PushSubscription JSON (endpoint, keys.p256dh, keys.auth)
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (isAuthError(authResult)) return authResult;
  const { user } = authResult;

  try {
    const body = await request.json();

    // Validate the subscription object
    if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
      return NextResponse.json(
        { error: 'Invalid push subscription: missing endpoint or keys' },
        { status: 400 }
      );
    }

    const subscription = {
      endpoint: body.endpoint as string,
      expirationTime: body.expirationTime as number | null | undefined,
      keys: {
        p256dh: body.keys.p256dh as string,
        auth: body.keys.auth as string,
      },
    };

    savePushSubscription(user.userId, subscription);

    return NextResponse.json({
      data: { success: true },
      message: 'Push subscription saved',
    });
  } catch (error) {
    console.error('[api/notifications/subscribe] Error:', error);
    return NextResponse.json(
      { error: 'Failed to save push subscription' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/notifications/subscribe
 *
 * Remove the push subscription for the authenticated user.
 */
export async function DELETE(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (isAuthError(authResult)) return authResult;
  const { user } = authResult;

  try {
    removePushSubscription(user.userId);

    return NextResponse.json({
      data: { success: true },
      message: 'Push subscription removed',
    });
  } catch (error) {
    console.error('[api/notifications/subscribe] Error:', error);
    return NextResponse.json(
      { error: 'Failed to remove push subscription' },
      { status: 500 }
    );
  }
}
