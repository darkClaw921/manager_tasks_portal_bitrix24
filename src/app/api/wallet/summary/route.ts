import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { getWalletSummary } from '@/lib/wallet/wallet';

/**
 * GET /api/wallet/summary
 *
 * Returns aggregated wallet figures for the authenticated user — no admin
 * override: the wallet is always the current user's view.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const summary = getWalletSummary(auth.user.userId);
    return NextResponse.json({ data: summary });
  } catch (error) {
    console.error('[wallet/summary] GET error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to fetch wallet summary' },
      { status: 500 }
    );
  }
}
