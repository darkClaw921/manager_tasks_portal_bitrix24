import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import {
  getPaymentRequestDetail,
  PaymentRequestError,
} from '@/lib/wallet/payment-requests';
import { mapPaymentRequestError } from '../_utils';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/payment-requests/[id]
 *
 * Returns the full payment request (with items). Access is granted to the
 * sender (admin) or recipient (user).
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { id } = await context.params;
    const requestId = parseInt(id, 10);
    if (isNaN(requestId) || requestId <= 0) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid request id' },
        { status: 400 }
      );
    }

    const data = getPaymentRequestDetail(requestId, auth.user.userId);
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof PaymentRequestError) {
      return mapPaymentRequestError(error);
    }
    console.error('[payment-requests/[id]] GET error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to fetch payment request' },
      { status: 500 }
    );
  }
}
