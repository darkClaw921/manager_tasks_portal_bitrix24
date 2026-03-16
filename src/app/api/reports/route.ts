import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { getUserReports } from '@/lib/ai/reports';

/**
 * GET /api/reports
 *
 * Returns paginated list of AI reports for the current user.
 * Query params:
 * - type (optional: "daily" | "weekly")
 * - page (default: 1)
 * - limit (default: 20, max: 50)
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (isAuthError(authResult)) return authResult;
  const { user } = authResult;

  const searchParams = request.nextUrl.searchParams;
  const type = searchParams.get('type') as 'daily' | 'weekly' | null;
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));

  try {
    const result = getUserReports(user.userId, {
      type: type || undefined,
      page,
      limit,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[api/reports] Error fetching reports:', error);
    return NextResponse.json(
      { error: 'Failed to fetch reports', message: 'Ошибка при получении отчётов' },
      { status: 500 }
    );
  }
}
