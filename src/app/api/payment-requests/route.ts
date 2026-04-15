import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import {
  createPaymentRequest,
  listIncomingRequests,
  listOutgoingRequests,
  PaymentRequestError,
} from '@/lib/wallet/payment-requests';
import type { CreatePaymentRequestInput } from '@/types/payment-request';

/**
 * POST /api/payment-requests
 *
 * Admin-only. Creates a new payment request for a target user.
 * Body: { toUserId: number, items: [{taskRateId, proposedAmount}], note?: string }
 * Response: 201 Created with the full PaymentRequest (including items).
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    if (!auth.user.isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Только администратор может создавать запросы оплаты' },
        { status: 403 }
      );
    }

    const body = (await request.json()) as unknown;
    const validation = validateCreateInput(body);
    if ('error' in validation) {
      return NextResponse.json(
        { error: 'Validation', message: validation.error },
        { status: 400 }
      );
    }

    const created = createPaymentRequest(auth.user.userId, validation.input);
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    if (error instanceof PaymentRequestError) {
      return mapPaymentRequestError(error);
    }
    console.error('[payment-requests] POST error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to create payment request' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/payment-requests?direction=incoming|outgoing
 *
 * - direction=incoming: requests where current user is toUserId (user inbox).
 * - direction=outgoing: requests where current user is fromUserId (admin sent).
 *   Admin-only for 'outgoing'.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { searchParams } = new URL(request.url);
    const direction = searchParams.get('direction');

    if (direction !== 'incoming' && direction !== 'outgoing') {
      return NextResponse.json(
        {
          error: 'Validation',
          message: 'direction must be "incoming" or "outgoing"',
        },
        { status: 400 }
      );
    }

    if (direction === 'outgoing') {
      if (!auth.user.isAdmin) {
        return NextResponse.json(
          { error: 'Forbidden', message: 'Только администратор имеет исходящие запросы' },
          { status: 403 }
        );
      }
      const data = listOutgoingRequests(auth.user.userId);
      return NextResponse.json({ data });
    }

    const data = listIncomingRequests(auth.user.userId);
    return NextResponse.json({ data });
  } catch (error) {
    console.error('[payment-requests] GET error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to list payment requests' },
      { status: 500 }
    );
  }
}

// ==================== Helpers ====================

type ValidationResult =
  | { input: CreatePaymentRequestInput }
  | { error: string };

function validateCreateInput(body: unknown): ValidationResult {
  if (!body || typeof body !== 'object') {
    return { error: 'Request body must be an object' };
  }
  const b = body as Record<string, unknown>;
  const toUserId = b.toUserId;
  if (typeof toUserId !== 'number' || !Number.isFinite(toUserId) || toUserId <= 0) {
    return { error: 'toUserId must be a positive number' };
  }
  if (!Array.isArray(b.items) || b.items.length === 0) {
    return { error: 'items must be a non-empty array' };
  }
  const items: Array<{ taskRateId: number; proposedAmount: number }> = [];
  for (const raw of b.items) {
    if (!raw || typeof raw !== 'object') {
      return { error: 'each item must be an object' };
    }
    const r = raw as Record<string, unknown>;
    const taskRateId = r.taskRateId;
    const proposedAmount = r.proposedAmount;
    if (
      typeof taskRateId !== 'number' ||
      !Number.isFinite(taskRateId) ||
      taskRateId <= 0
    ) {
      return { error: 'taskRateId must be a positive number' };
    }
    if (
      typeof proposedAmount !== 'number' ||
      !Number.isFinite(proposedAmount) ||
      proposedAmount <= 0
    ) {
      return { error: 'proposedAmount must be a positive number' };
    }
    items.push({ taskRateId, proposedAmount });
  }
  const note = b.note;
  if (note !== undefined && note !== null && typeof note !== 'string') {
    return { error: 'note must be a string' };
  }
  return {
    input: {
      toUserId,
      items,
      note: typeof note === 'string' ? note : undefined,
    },
  };
}

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
