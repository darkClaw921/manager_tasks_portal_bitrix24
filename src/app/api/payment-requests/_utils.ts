import { NextResponse } from 'next/server';
import type { PaymentRequestError } from '@/lib/wallet/payment-requests';

/**
 * Maps a PaymentRequestError code to an HTTP response with the appropriate status.
 * Underscore-prefixed file so Next.js does not treat it as a route module.
 */
export function mapPaymentRequestError(
  error: PaymentRequestError
): NextResponse {
  const statusMap = {
    NOT_FOUND: 404,
    FORBIDDEN: 403,
    CONFLICT: 409,
    VALIDATION: 400,
  } as const;
  return NextResponse.json(
    { error: error.code, message: error.message },
    { status: statusMap[error.code] }
  );
}
