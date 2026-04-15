import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { getWalletRates, type WalletGroup } from '@/lib/wallet/wallet';

const VALID_GROUPS: readonly WalletGroup[] = ['earned', 'expected', 'deferred'];

function isValidGroup(v: string | null): v is WalletGroup {
  return v !== null && (VALID_GROUPS as readonly string[]).includes(v);
}

/**
 * GET /api/wallet/rates
 *
 * Returns rates enriched with paidAmount, expectedAmount, and paymentStatus.
 *
 * - Regular user: returns their own rates.
 * - Admin with ?userId=N: returns the target user's rates (used by the
 *   admin-side PaymentRequestCreateDialog to pick candidate rates).
 *
 * Supports ?group=earned|expected|deferred to restrict to a single bucket.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { searchParams } = new URL(request.url);
    const rawGroup = searchParams.get('group');

    let group: WalletGroup | undefined;
    if (rawGroup !== null) {
      if (!isValidGroup(rawGroup)) {
        return NextResponse.json(
          {
            error: 'Validation',
            message: 'group must be one of: earned, expected, deferred',
          },
          { status: 400 }
        );
      }
      group = rawGroup;
    }

    // Admins can fetch another user's rates via ?userId=N. Non-admins are
    // forbidden from doing so (silently ignore).
    let targetUserId = auth.user.userId;
    const userIdParam = searchParams.get('userId');
    if (userIdParam !== null) {
      if (!auth.user.isAdmin) {
        return NextResponse.json(
          {
            error: 'Forbidden',
            message: 'Только администратор может запрашивать ставки другого пользователя',
          },
          { status: 403 }
        );
      }
      const parsed = parseInt(userIdParam, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return NextResponse.json(
          { error: 'Validation', message: 'userId must be a positive integer' },
          { status: 400 }
        );
      }
      targetUserId = parsed;
    }

    const data = getWalletRates(targetUserId, { group });
    return NextResponse.json({ data });
  } catch (error) {
    console.error('[wallet/rates] GET error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to fetch wallet rates' },
      { status: 500 }
    );
  }
}
