import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { generateWeeklyReport, regenerateReport } from '@/lib/ai/reports';
import { AIError } from '@/lib/ai/client';

/**
 * GET /api/reports/weekly?week=YYYY-WNN
 *
 * Get or generate weekly report for the specified week.
 * Returns cached report if exists, otherwise generates a new one.
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (isAuthError(authResult)) return authResult;
  const { user } = authResult;

  const week = request.nextUrl.searchParams.get('week') || undefined;

  // Validate week format if provided
  if (week && !/^\d{4}-W\d{2}$/.test(week)) {
    return NextResponse.json(
      { error: 'Invalid week format', message: 'Формат недели: YYYY-WNN (например, 2026-W12)' },
      { status: 400 }
    );
  }

  try {
    const report = await generateWeeklyReport(user.userId, week);
    return NextResponse.json({ data: report });
  } catch (error) {
    if (error instanceof AIError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.code === 'missing_api_key' ? 503 : 500 }
      );
    }

    console.error('[api/reports/weekly] Error:', error);
    return NextResponse.json(
      { error: 'generation_failed', message: 'Ошибка при генерации недельного отчёта' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/reports/weekly
 *
 * Force-regenerate weekly report (delete cached and create new).
 * Body: { week?: "YYYY-WNN" }
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (isAuthError(authResult)) return authResult;
  const { user } = authResult;

  let week: string | undefined;
  try {
    const body = await request.json();
    week = body.week;
  } catch {
    // No body or invalid JSON - use current week
  }

  if (week && !/^\d{4}-W\d{2}$/.test(week)) {
    return NextResponse.json(
      { error: 'Invalid week format', message: 'Формат недели: YYYY-WNN (например, 2026-W12)' },
      { status: 400 }
    );
  }

  try {
    const report = await regenerateReport(user.userId, 'weekly', { week });
    return NextResponse.json({ data: report });
  } catch (error) {
    if (error instanceof AIError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.code === 'missing_api_key' ? 503 : 500 }
      );
    }

    console.error('[api/reports/weekly] Regeneration error:', error);
    return NextResponse.json(
      { error: 'generation_failed', message: 'Ошибка при регенерации недельного отчёта' },
      { status: 500 }
    );
  }
}
