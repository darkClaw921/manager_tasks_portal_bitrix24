import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import {
  rejectPaymentRequest,
  PaymentRequestError,
} from '@/lib/wallet/payment-requests';
import { mapPaymentRequestError } from '../../route';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/payment-requests/[id]/reject
 *
 * Recipient rejects a pending payment request.
 * No body required. On success returns the updated PaymentRequest with
 * status='rejected' and respondedAt set.
 */
export async function POST(request: NextRequest, context: RouteContext) {
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

    const data = rejectPaymentRequest(auth.user.userId, requestId);
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof PaymentRequestError) {
      return mapPaymentRequestError(error);
    }
    console.error('[payment-requests/[id]/reject] POST error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to reject payment request' },
      { status: 500 }
    );
  }
}
