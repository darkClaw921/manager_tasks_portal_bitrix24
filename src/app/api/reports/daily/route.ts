import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { generateDailyReport, regenerateReport } from '@/lib/ai/reports';
import { AIError } from '@/lib/ai/client';

/**
 * GET /api/reports/daily?date=YYYY-MM-DD
 *
 * Get or generate daily report for the specified date.
 * Returns cached report if exists, otherwise generates a new one.
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (isAuthError(authResult)) return authResult;
  const { user } = authResult;

  const date = request.nextUrl.searchParams.get('date') || undefined;

  // Validate date format if provided
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: 'Invalid date format', message: 'Формат даты: YYYY-MM-DD' },
      { status: 400 }
    );
  }

  try {
    const report = await generateDailyReport(user.userId, date);
    return NextResponse.json({ data: report });
  } catch (error) {
    if (error instanceof AIError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.code === 'missing_api_key' ? 503 : 500 }
      );
    }

    console.error('[api/reports/daily] Error:', error);
    return NextResponse.json(
      { error: 'generation_failed', message: 'Ошибка при генерации дневного отчёта' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/reports/daily
 *
 * Force-regenerate daily report (delete cached and create new).
 * Body: { date?: "YYYY-MM-DD" }
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (isAuthError(authResult)) return authResult;
  const { user } = authResult;

  let date: string | undefined;
  try {
    const body = await request.json();
    date = body.date;
  } catch {
    // No body or invalid JSON - use today's date
  }

  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: 'Invalid date format', message: 'Формат даты: YYYY-MM-DD' },
      { status: 400 }
    );
  }

  try {
    const report = await regenerateReport(user.userId, 'daily', { date });
    return NextResponse.json({ data: report });
  } catch (error) {
    if (error instanceof AIError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.code === 'missing_api_key' ? 503 : 500 }
      );
    }

    console.error('[api/reports/daily] Regeneration error:', error);
    return NextResponse.json(
      { error: 'generation_failed', message: 'Ошибка при регенерации дневного отчёта' },
      { status: 500 }
    );
  }
}
