import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { setPaidAmount } from '@/lib/wallet/wallet';
import { getTaskRateById } from '@/lib/payments/rates';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PATCH /api/wallet/rates/[id]/paid-amount
 *
 * Body: { paidAmount: number }
 * Updates paidAmount on a rate owned by the caller. isPaid/paidAt are
 * auto-synced inside setPaidAmount based on the computed expectedAmount.
 *
 * Returns:
 *   400 — invalid rateId or invalid paidAmount
 *   401 — unauthenticated
 *   403 — rate belongs to another user
 *   404 — rate not found
 *   200 — updated rate row
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { id } = await context.params;
    const rateId = Number(id);
    if (!Number.isFinite(rateId) || rateId <= 0) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid rate ID' },
        { status: 400 }
      );
    }

    const body = (await request.json().catch(() => null)) as
      | { paidAmount?: unknown }
      | null;
    const raw = body?.paidAmount;
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
      return NextResponse.json(
        {
          error: 'Validation',
          message: 'paidAmount must be a finite non-negative number',
        },
        { status: 400 }
      );
    }

    // Ownership check up-front so we can distinguish 404 from 403 cleanly.
    const existing = getTaskRateById(rateId);
    if (!existing) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Rate not found' },
        { status: 404 }
      );
    }
    if (existing.userId !== auth.user.userId) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'You can only update your own rates' },
        { status: 403 }
      );
    }

    const updated = setPaidAmount(auth.user.userId, rateId, raw);
    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error('[wallet/rates/[id]/paid-amount] PATCH error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to update paid amount' },
      { status: 500 }
    );
  }
}
