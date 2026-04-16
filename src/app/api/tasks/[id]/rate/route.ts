import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import {
  getTaskRateForUser,
  upsertTaskRate,
  deleteTaskRate,
  isUserParticipant,
} from '@/lib/payments/rates';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/tasks/[id]/rate[?userId=<n>]
 *
 * Without userId: returns current user's rate.
 * With userId: admin-only, returns that user's rate for the task.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { id } = await context.params;
    const taskId = parseInt(id, 10);
    if (isNaN(taskId)) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid task ID' },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const targetUserParam = searchParams.get('userId');
    let targetUserId = auth.user.userId;

    if (targetUserParam !== null) {
      const parsed = parseInt(targetUserParam, 10);
      if (isNaN(parsed) || parsed <= 0) {
        return NextResponse.json(
          { error: 'Validation', message: 'userId must be a positive integer' },
          { status: 400 }
        );
      }
      if (parsed !== auth.user.userId && !auth.user.isAdmin) {
        return NextResponse.json(
          { error: 'Forbidden', message: 'Only admin can read rates of other users' },
          { status: 403 }
        );
      }
      targetUserId = parsed;
    }

    const rate = getTaskRateForUser(targetUserId, taskId);

    return NextResponse.json({ data: rate ?? null });
  } catch (error) {
    console.error('[tasks/[id]/rate] GET error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to fetch task rate' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/tasks/[id]/rate
 *
 * Create or update the current user's rate for a task.
 * Body: { rateType: 'hourly' | 'fixed', amount: number, hoursOverride?: number, note?: string }
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { id } = await context.params;
    const taskId = parseInt(id, 10);
    if (isNaN(taskId)) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid task ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { rateType, amount, hoursOverride, note, userId: bodyUserId } = body;

    // Validate required fields
    if (!rateType || !['hourly', 'fixed'].includes(rateType)) {
      return NextResponse.json(
        { error: 'Validation', message: 'rateType must be "hourly" or "fixed"' },
        { status: 400 }
      );
    }

    if (typeof amount !== 'number' || amount < 0) {
      return NextResponse.json(
        { error: 'Validation', message: 'amount must be a non-negative number' },
        { status: 400 }
      );
    }

    // Resolve target user. Admin may pass `userId` to set a rate on behalf of
    // another participant; regular users can only set their own rate.
    let targetUserId = auth.user.userId;
    if (bodyUserId !== undefined && bodyUserId !== null) {
      if (typeof bodyUserId !== 'number' || !Number.isInteger(bodyUserId) || bodyUserId <= 0) {
        return NextResponse.json(
          { error: 'Validation', message: 'userId must be a positive integer' },
          { status: 400 }
        );
      }
      if (bodyUserId !== auth.user.userId && !auth.user.isAdmin) {
        return NextResponse.json(
          { error: 'Forbidden', message: 'Only admin can set rates for other users' },
          { status: 403 }
        );
      }
      targetUserId = bodyUserId;
    }

    // Target user must be a participant in the task
    if (!isUserParticipant(targetUserId, taskId)) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Target user is not a participant of this task' },
        { status: 403 }
      );
    }

    const rate = upsertTaskRate(targetUserId, {
      taskId,
      rateType,
      amount,
      hoursOverride: hoursOverride ?? null,
      note: note ?? null,
    });

    return NextResponse.json({ data: rate });
  } catch (error) {
    console.error('[tasks/[id]/rate] PUT error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to save task rate' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/tasks/[id]/rate
 *
 * Delete the current user's rate for a task.
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { id } = await context.params;
    const taskId = parseInt(id, 10);
    if (isNaN(taskId)) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid task ID' },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const targetUserParam = searchParams.get('userId');
    let targetUserId = auth.user.userId;

    if (targetUserParam !== null) {
      const parsed = parseInt(targetUserParam, 10);
      if (isNaN(parsed) || parsed <= 0) {
        return NextResponse.json(
          { error: 'Validation', message: 'userId must be a positive integer' },
          { status: 400 }
        );
      }
      if (parsed !== auth.user.userId && !auth.user.isAdmin) {
        return NextResponse.json(
          { error: 'Forbidden', message: 'Only admin can delete rates of other users' },
          { status: 403 }
        );
      }
      targetUserId = parsed;
    }

    const deleted = deleteTaskRate(targetUserId, taskId);

    if (!deleted) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Task rate not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    console.error('[tasks/[id]/rate] DELETE error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to delete task rate' },
      { status: 500 }
    );
  }
}
