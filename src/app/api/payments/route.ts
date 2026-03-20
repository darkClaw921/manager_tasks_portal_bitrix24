import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import {
  getTaskRatesForUser,
  getAllTaskRates,
  getPaymentSummary,
} from '@/lib/payments/rates';
import type { PaymentFilters } from '@/types/payment';

/**
 * GET /api/payments
 *
 * Get task rates with filtering and pagination.
 * - Regular user: only their own rates
 * - Admin with ?userId=N: rates for specific user
 * - Admin without userId: all users' rates
 *
 * Query params: portalId?, dateFrom?, dateTo?, isPaid?, taskStatus?, userId? (admin), page?, limit?
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { searchParams } = new URL(request.url);

    // Parse filters from query params
    const filters: PaymentFilters = {};

    const portalId = searchParams.get('portalId');
    if (portalId) filters.portalId = parseInt(portalId, 10);

    const dateFrom = searchParams.get('dateFrom');
    if (dateFrom) filters.dateFrom = dateFrom;

    const dateTo = searchParams.get('dateTo');
    if (dateTo) filters.dateTo = dateTo;

    const isPaid = searchParams.get('isPaid');
    if (isPaid !== null) filters.isPaid = isPaid === 'true';

    const taskStatus = searchParams.get('taskStatus');
    if (taskStatus) filters.taskStatus = taskStatus;

    const page = searchParams.get('page');
    filters.page = page ? parseInt(page, 10) : 1;

    const limit = searchParams.get('limit');
    filters.limit = limit ? Math.min(parseInt(limit, 10), 100) : 20;

    const isAdmin = auth.user.isAdmin;
    const userIdParam = searchParams.get('userId');

    let result: { data: unknown[]; total: number };
    let summaryUserId: number | null;

    if (isAdmin && userIdParam) {
      // Admin filtering by specific user
      const targetUserId = parseInt(userIdParam, 10);
      filters.userId = targetUserId;
      result = getAllTaskRates(filters);
      summaryUserId = targetUserId;
    } else if (isAdmin && !userIdParam) {
      // Admin: all users
      result = getAllTaskRates(filters);
      summaryUserId = null;
    } else {
      // Regular user: only own rates
      result = getTaskRatesForUser(auth.user.userId, filters);
      summaryUserId = auth.user.userId;
    }

    const summary = getPaymentSummary(summaryUserId, filters);

    const totalPages = Math.ceil(result.total / (filters.limit ?? 20));

    return NextResponse.json({
      data: result.data,
      total: result.total,
      page: filters.page,
      limit: filters.limit,
      totalPages,
      summary,
    });
  } catch (error) {
    console.error('[payments] GET error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to fetch payments' },
      { status: 500 }
    );
  }
}
