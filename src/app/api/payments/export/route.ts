import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import {
  getTaskRatesForUser,
  getAllTaskRates,
  getPaymentSummary,
} from '@/lib/payments/rates';
import { generatePaymentReport, type ReportDesign } from '@/lib/payments/pdf-generator';
import { db } from '@/lib/db';
import { users, portals } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { PaymentFilters } from '@/types/payment';

/**
 * GET /api/payments/export
 *
 * Export payments as PDF report.
 * Query params: portalId?, dateFrom?, dateTo?, isPaid?, taskStatus?, userId? (admin)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { searchParams } = new URL(request.url);

    // Parse filters from query params
    const filters: PaymentFilters = {};

    const portalIdParam = searchParams.get('portalId');
    if (portalIdParam) filters.portalId = parseInt(portalIdParam, 10);

    const dateFrom = searchParams.get('dateFrom');
    if (dateFrom) filters.dateFrom = dateFrom;

    const dateTo = searchParams.get('dateTo');
    if (dateTo) filters.dateTo = dateTo;

    const isPaidParam = searchParams.get('isPaid');
    if (isPaidParam !== null) filters.isPaid = isPaidParam === 'true';

    const taskStatus = searchParams.get('taskStatus');
    if (taskStatus) filters.taskStatus = taskStatus;

    const isAdmin = auth.user.isAdmin;
    const userIdParam = searchParams.get('userId');

    // Remove pagination limit for export — we want all data
    filters.limit = 10000;
    filters.page = 1;

    // Fetch rates and summary
    let ratesResult;
    let summaryUserId: number | null;

    if (isAdmin && userIdParam) {
      const targetUserId = parseInt(userIdParam, 10);
      filters.userId = targetUserId;
      ratesResult = getAllTaskRates(filters);
      summaryUserId = targetUserId;
    } else if (isAdmin && !userIdParam) {
      ratesResult = getAllTaskRates(filters);
      summaryUserId = null;
    } else {
      ratesResult = getTaskRatesForUser(auth.user.userId, filters);
      summaryUserId = auth.user.userId;
    }

    const summary = getPaymentSummary(summaryUserId, filters);

    // Get user info for the report
    const user = db
      .select({
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      })
      .from(users)
      .where(eq(users.id, auth.user.userId))
      .get();

    if (!user) {
      return NextResponse.json(
        { error: 'NotFound', message: 'Пользователь не найден' },
        { status: 404 }
      );
    }

    // Get portal name for filter display
    let portalName: string | undefined;
    if (filters.portalId) {
      const portal = db
        .select({ name: portals.name })
        .from(portals)
        .where(eq(portals.id, filters.portalId))
        .get();
      portalName = portal?.name;
    }

    // Generate PDF
    const designParam = searchParams.get('design');
    const design: ReportDesign = designParam === 'modern' ? 'modern' : 'official';
    const now = new Date().toISOString().slice(0, 10);
    const pdfBuffer = await generatePaymentReport({
      user,
      rates: ratesResult.data,
      summary,
      filters: {
        portalName,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        isPaid: filters.isPaid,
        taskStatus: filters.taskStatus,
      },
      generatedAt: now,
      design,
    });

    const filename = `payment-report-${now}.pdf`;

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdfBuffer.length),
      },
    });
  } catch (error) {
    console.error('[payments/export] GET error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to export payments' },
      { status: 500 }
    );
  }
}
