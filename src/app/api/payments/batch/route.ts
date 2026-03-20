import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import {
  batchUpdatePaymentStatus,
  batchUpdatePaymentStatusAdmin,
} from '@/lib/payments/rates';
import { db } from '@/lib/db';
import { taskRates } from '@/lib/db/schema';
import { inArray, eq, and } from 'drizzle-orm';

/**
 * PATCH /api/payments/batch
 *
 * Batch update payment status for multiple rates.
 * Body: { rateIds: number[], isPaid: boolean }
 * Checks ownership of all rates (or admin bypasses).
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const body = await request.json();
    const { rateIds, isPaid } = body;

    // Validate rateIds
    if (!Array.isArray(rateIds) || rateIds.length === 0) {
      return NextResponse.json(
        { error: 'Validation', message: 'rateIds must be a non-empty array' },
        { status: 400 }
      );
    }

    if (!rateIds.every((id: unknown) => typeof id === 'number' && Number.isInteger(id))) {
      return NextResponse.json(
        { error: 'Validation', message: 'All rateIds must be integers' },
        { status: 400 }
      );
    }

    if (typeof isPaid !== 'boolean') {
      return NextResponse.json(
        { error: 'Validation', message: 'isPaid must be a boolean' },
        { status: 400 }
      );
    }

    let updated: number;

    if (auth.user.isAdmin) {
      // Admin can update any rates
      updated = batchUpdatePaymentStatusAdmin(rateIds, isPaid);
    } else {
      // Verify all rateIds belong to the current user
      const ownedCount = db
        .select({ id: taskRates.id })
        .from(taskRates)
        .where(
          and(
            inArray(taskRates.id, rateIds),
            eq(taskRates.userId, auth.user.userId)
          )
        )
        .all().length;

      if (ownedCount !== rateIds.length) {
        return NextResponse.json(
          { error: 'Forbidden', message: 'Some rates do not belong to you' },
          { status: 403 }
        );
      }

      updated = batchUpdatePaymentStatus(auth.user.userId, rateIds, isPaid);
    }

    return NextResponse.json({ data: { updated } });
  } catch (error) {
    console.error('[payments/batch] PATCH error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to batch update payment status' },
      { status: 500 }
    );
  }
}
