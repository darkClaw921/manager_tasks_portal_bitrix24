import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireAdmin, isAuthError } from '@/lib/auth/guards';
import { getAllSettings, getWorkHours, setWorkHours } from '@/lib/settings';

/**
 * GET /api/settings
 *
 * Returns all application settings as key-value pairs.
 * Requires authentication.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const settings = getAllSettings();

    return NextResponse.json({ data: settings });
  } catch (error) {
    console.error('[settings] GET error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/settings
 *
 * Update work hours settings. Requires admin role.
 * Body: { work_hours_start?: number, work_hours_end?: number }
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (isAuthError(auth)) return auth;

    const body = await request.json();
    const { work_hours_start, work_hours_end } = body;

    // Get current values as fallback
    const current = getWorkHours();
    const newStart = work_hours_start !== undefined ? work_hours_start : current.start;
    const newEnd = work_hours_end !== undefined ? work_hours_end : current.end;

    // Type validation
    if (typeof newStart !== 'number' || typeof newEnd !== 'number') {
      return NextResponse.json(
        { error: 'Validation', message: 'work_hours_start and work_hours_end must be numbers' },
        { status: 400 }
      );
    }

    // Range validation
    if (!Number.isInteger(newStart) || newStart < 0 || newStart > 23) {
      return NextResponse.json(
        { error: 'Validation', message: 'work_hours_start must be an integer between 0 and 23' },
        { status: 400 }
      );
    }

    if (!Number.isInteger(newEnd) || newEnd < 1 || newEnd > 24) {
      return NextResponse.json(
        { error: 'Validation', message: 'work_hours_end must be an integer between 1 and 24' },
        { status: 400 }
      );
    }

    // Logic validation: start must be less than end
    if (newStart >= newEnd) {
      return NextResponse.json(
        { error: 'Validation', message: 'work_hours_start must be less than work_hours_end' },
        { status: 400 }
      );
    }

    // Update settings
    setWorkHours(newStart, newEnd);

    // Return updated settings
    const updatedSettings = getAllSettings();

    return NextResponse.json({ data: updatedSettings });
  } catch (error) {
    console.error('[settings] PATCH error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Internal server error' },
      { status: 500 }
    );
  }
}
