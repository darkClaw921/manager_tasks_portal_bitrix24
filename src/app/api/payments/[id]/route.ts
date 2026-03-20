import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import {
  getTaskRateById,
  updatePaymentStatus,
  updatePaymentStatusAdmin,
} from '@/lib/payments/rates';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PATCH /api/payments/[id]
 *
 * Update payment status (isPaid) for a specific rate.
 * Body: { isPaid: boolean }
 * Owner or admin can update.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { id } = await context.params;
    const rateId = parseInt(id, 10);
    if (isNaN(rateId)) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid rate ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { isPaid } = body;

    if (typeof isPaid !== 'boolean') {
      return NextResponse.json(
        { error: 'Validation', message: 'isPaid must be a boolean' },
        { status: 400 }
      );
    }

    // Check that rate exists and verify ownership
    const existingRate = getTaskRateById(rateId);
    if (!existingRate) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Rate not found' },
        { status: 404 }
      );
    }

    if (existingRate.userId !== auth.user.userId && !auth.user.isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'You can only update your own rates' },
        { status: 403 }
      );
    }

    let updated;
    if (auth.user.isAdmin && existingRate.userId !== auth.user.userId) {
      updated = updatePaymentStatusAdmin(rateId, isPaid);
    } else {
      updated = updatePaymentStatus(auth.user.userId, rateId, isPaid);
    }

    if (!updated) {
      return NextResponse.json(
        { error: 'Internal', message: 'Failed to update payment status' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error('[payments/[id]] PATCH error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to update payment status' },
      { status: 500 }
    );
  }
}
