import type { TaskRateWithTask } from './payment';

/**
 * Payment status of a single rate — derived from paidAmount vs expectedAmount.
 *
 *   - 'unpaid':   paidAmount === 0
 *   - 'partial':  0 < paidAmount < expectedAmount
 *   - 'paid':     paidAmount === expectedAmount
 *   - 'overpaid': paidAmount > expectedAmount
 *
 * Computation is performed server-side in src/lib/wallet/wallet.ts so the
 * field is always present on rows returned to the UI.
 */
export type WalletPaymentStatus = 'unpaid' | 'partial' | 'paid' | 'overpaid';

/**
 * Per-rate row for the user's wallet.
 *
 * Extends TaskRateWithTask with the three fields the wallet UI needs in
 * addition to the raw persisted rate: the already-paid amount (DB column),
 * the computed expected amount (shared helper in src/lib/payments/calc.ts),
 * and the derived payment status.
 */
export interface WalletRate extends TaskRateWithTask {
  /** Cumulative amount already paid against this rate (persisted). */
  paidAmount: number;
  /** Expected (earned) amount computed from rateType/amount/hours. */
  expectedAmount: number;
  /** Derived status: unpaid | partial | paid | overpaid. */
  paymentStatus: WalletPaymentStatus;
}

/**
 * Aggregated wallet figures for a single user.
 *
 * Rates are grouped by the parent task's status:
 *   - earned:   task status in (COMPLETED, SUPPOSEDLY_COMPLETED)
 *   - expected: task status in (NEW, PENDING, IN_PROGRESS)
 *   - deferred: task status === DEFERRED
 *
 * All monetary fields are numbers (not strings). outstanding = earned - paid.
 */
export interface WalletSummary {
  /** Sum of expectedAmount across rates attached to finished tasks. */
  earned: number;
  /** Sum of expectedAmount across rates attached to in-progress tasks. */
  expected: number;
  /** Sum of expectedAmount across rates attached to deferred tasks. */
  deferred: number;
  /** Total paidAmount across the earned bucket. */
  paid: number;
  /** earned - paid: still owed to the user for finished work. */
  outstanding: number;
  /** Distinct task count contributing to the earned bucket. */
  tasksEarnedCount: number;
  /** Distinct task count contributing to the expected bucket. */
  tasksExpectedCount: number;
}
