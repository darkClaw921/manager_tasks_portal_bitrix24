import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { timeTrackingEntries } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth, isAuthError } from '@/lib/auth/guards';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * DELETE /api/time-tracking/[id]
 *
 * Delete a time tracking entry.
 * Only the owner (userId) can delete their own entries.
 * Returns 404 for non-existent or other user's entries (no information leak).
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { id } = await context.params;
    const entryId = parseInt(id, 10);
    if (isNaN(entryId)) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid entry ID' },
        { status: 400 }
      );
    }

    // Check entry exists and belongs to current user
    const entry = db
      .select({ id: timeTrackingEntries.id })
      .from(timeTrackingEntries)
      .where(
        and(
          eq(timeTrackingEntries.id, entryId),
          eq(timeTrackingEntries.userId, auth.user.userId)
        )
      )
      .get();

    if (!entry) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Entry not found' },
        { status: 404 }
      );
    }

    // Delete the entry
    db.delete(timeTrackingEntries)
      .where(eq(timeTrackingEntries.id, entryId))
      .run();

    return NextResponse.json({ data: { message: 'Deleted' } });
  } catch (error) {
    console.error('[time-tracking/[id]] DELETE error:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete entry';
    return NextResponse.json(
      { error: 'Internal', message },
      { status: 500 }
    );
  }
}
