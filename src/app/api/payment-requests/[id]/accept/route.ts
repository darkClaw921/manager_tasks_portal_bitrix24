import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import {
  acceptPaymentRequest,
  PaymentRequestError,
} from '@/lib/wallet/payment-requests';
import { mapPaymentRequestError } from '../../route';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/payment-requests/[id]/accept
 *
 * Recipient accepts a pending payment request.
 * Body (optional): { overrides?: Record<string, number> }
 *   - Key: PaymentRequestItem.id (stringified). Value: appliedAmount override.
 *
 * On success returns the updated PaymentRequest. Status becomes 'accepted' if
 * no overrides were provided, 'modified' otherwise.
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

    // Body is optional: empty body is allowed.
    let overrides: { [itemId: string]: number } | undefined;
    const contentLength = request.headers.get('content-length');
    if (contentLength && contentLength !== '0') {
      const text = await request.text();
      if (text.trim().length > 0) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          return NextResponse.json(
            { error: 'Validation', message: 'Invalid JSON body' },
            { status: 400 }
          );
        }
        const validation = validateOverrides(parsed);
        if ('error' in validation) {
          return NextResponse.json(
            { error: 'Validation', message: validation.error },
            { status: 400 }
          );
        }
        overrides = validation.overrides;
      }
    }

    const data = acceptPaymentRequest(auth.user.userId, requestId, overrides);
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof PaymentRequestError) {
      return mapPaymentRequestError(error);
    }
    console.error('[payment-requests/[id]/accept] POST error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to accept payment request' },
      { status: 500 }
    );
  }
}

type OverridesValidation =
  | { overrides: { [itemId: string]: number } | undefined }
  | { error: string };

function validateOverrides(body: unknown): OverridesValidation {
  if (body === null) return { overrides: undefined };
  if (typeof body !== 'object') {
    return { error: 'body must be an object' };
  }
  const b = body as Record<string, unknown>;
  const raw = b.overrides;
  if (raw === undefined || raw === null) return { overrides: undefined };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: 'overrides must be an object' };
  }
  const result: { [itemId: string]: number } = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      return {
        error: `override for item ${key} must be a non-negative number`,
      };
    }
    result[key] = value;
  }
  return { overrides: result };
}
