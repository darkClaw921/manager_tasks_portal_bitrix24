/**
 * Wallet service layer.
 *
 * Aggregates rate/payment data from the user's perspective:
 *   - getWalletSummary: totals grouped by parent task status
 *   - getWalletRates:   per-rate rows with expected/paid/status enriched
 *   - setPaidAmount:    update paid_amount, sync isPaid/paidAt accordingly
 *
 * Keeps expected-amount math in sync with /payments by delegating to the
 * shared helper computeExpectedAmount (src/lib/payments/calc.ts). Reuses
 * rateWithTaskSelect/mapRowToTaskRateWithTask from rates.ts so the JOIN
 * shape stays single-sourced.
 */

import { db } from '@/lib/db';
import { taskRates, tasks, portals } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { computeExpectedAmount } from '@/lib/payments/calc';
import {
  rateWithTaskSelect,
  mapRowToTaskRateWithTask,
} from '@/lib/payments/rates';
import type { TaskRate } from '@/lib/db/schema';
import type { TaskStatus } from '@/types/task';
import type {
  WalletSummary,
  WalletRate,
  WalletPaymentStatus,
} from '@/types/wallet';

// ==================== Task status grouping ====================

export type WalletGroup = 'earned' | 'expected' | 'deferred';

/**
 * Map of task.status -> wallet bucket. Statuses not present in the map are
 * ignored (should not happen given the TaskStatus union, but defensive).
 */
const TASK_STATUS_GROUP: Record<TaskStatus, WalletGroup> = {
  COMPLETED: 'earned',
  SUPPOSEDLY_COMPLETED: 'earned',
  NEW: 'expected',
  PENDING: 'expected',
  IN_PROGRESS: 'expected',
  DEFERRED: 'deferred',
};

const EARNED_STATUSES: TaskStatus[] = ['COMPLETED', 'SUPPOSEDLY_COMPLETED'];
const EXPECTED_STATUSES: TaskStatus[] = ['NEW', 'PENDING', 'IN_PROGRESS'];
const DEFERRED_STATUSES: TaskStatus[] = ['DEFERRED'];

function statusesForGroup(group: WalletGroup): TaskStatus[] {
  if (group === 'earned') return EARNED_STATUSES;
  if (group === 'expected') return EXPECTED_STATUSES;
  return DEFERRED_STATUSES;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function derivePaymentStatus(
  paidAmount: number,
  expectedAmount: number
): WalletPaymentStatus {
  if (paidAmount <= 0) return 'unpaid';
  // Use a small epsilon so floating-point equality on expected == paid is robust.
  const eps = 0.005;
  if (paidAmount > expectedAmount + eps) return 'overpaid';
  if (paidAmount >= expectedAmount - eps) return 'paid';
  return 'partial';
}

// ==================== getWalletSummary ====================

/**
 * Aggregate wallet totals for a user.
 *
 * Does a single JOIN-based SELECT over taskRates+tasks+portals filtered by
 * userId, then buckets rows in JS by task status. Expected amounts are
 * computed via computeExpectedAmount so the math matches /payments exactly.
 */
export function getWalletSummary(userId: number): WalletSummary {
  // Pull the shared JOIN shape plus paidAmount in a single query.
  const rows = db
    .select({
      ...rateWithTaskSelect,
      paidAmount: taskRates.paidAmount,
    })
    .from(taskRates)
    .innerJoin(tasks, eq(taskRates.taskId, tasks.id))
    .innerJoin(portals, eq(tasks.portalId, portals.id))
    .where(eq(taskRates.userId, userId))
    .all();

  let earned = 0;
  let expected = 0;
  let deferred = 0;
  let paid = 0;
  const earnedTasks = new Set<number>();
  const expectedTasks = new Set<number>();

  for (const row of rows) {
    const group = TASK_STATUS_GROUP[row.taskStatus as TaskStatus];
    if (!group) continue;

    const expectedAmount = computeExpectedAmount(
      {
        rateType: row.rateType,
        amount: row.amount,
        hoursOverride: row.hoursOverride,
      },
      { timeSpent: row.timeSpent },
      row.trackedTime
    );

    if (group === 'earned') {
      earned += expectedAmount;
      earnedTasks.add(row.taskId);
      paid += row.paidAmount ?? 0;
    } else if (group === 'expected') {
      expected += expectedAmount;
      expectedTasks.add(row.taskId);
    } else {
      deferred += expectedAmount;
    }
  }

  return {
    earned: round2(earned),
    expected: round2(expected),
    deferred: round2(deferred),
    paid: round2(paid),
    outstanding: round2(earned - paid),
    tasksEarnedCount: earnedTasks.size,
    tasksExpectedCount: expectedTasks.size,
  };
}

// ==================== getWalletRates ====================

export interface GetWalletRatesFilters {
  /** Restrict to a single status bucket. */
  group?: WalletGroup;
}

/**
 * List rates for a user enriched with paidAmount, expectedAmount and
 * derived paymentStatus. Suitable for table rendering in /wallet.
 *
 * Rate rows carry `.paidAmount` from the DB column; expectedAmount is
 * computed via the shared helper. Ordering is by createdAt DESC.
 */
export function getWalletRates(
  userId: number,
  filters: GetWalletRatesFilters = {}
): WalletRate[] {
  const conditions = [eq(taskRates.userId, userId)];
  if (filters.group) {
    conditions.push(inArray(tasks.status, statusesForGroup(filters.group)));
  }

  const rows = db
    .select({
      ...rateWithTaskSelect,
      paidAmount: taskRates.paidAmount,
    })
    .from(taskRates)
    .innerJoin(tasks, eq(taskRates.taskId, tasks.id))
    .innerJoin(portals, eq(tasks.portalId, portals.id))
    .where(and(...conditions))
    .orderBy(taskRates.createdAt)
    .all();

  return rows.map((row) => {
    const base = mapRowToTaskRateWithTask(row);
    const expectedAmount = round2(
      computeExpectedAmount(
        {
          rateType: row.rateType,
          amount: row.amount,
          hoursOverride: row.hoursOverride,
        },
        { timeSpent: row.timeSpent },
        row.trackedTime
      )
    );
    const paidAmount = row.paidAmount ?? 0;
    return {
      ...base,
      paidAmount,
      expectedAmount,
      paymentStatus: derivePaymentStatus(paidAmount, expectedAmount),
    };
  });
}

// ==================== setPaidAmount ====================

/**
 * Update paidAmount on a rate the user owns. Derives:
 *   - isPaid = paidAmount >= expectedAmount (epsilon-tolerant)
 *   - paidAt = now() when isPaid, null otherwise
 *
 * Throws if the rate doesn't exist or belongs to another user, so routes
 * can surface 403/404 cleanly.
 */
export function setPaidAmount(
  userId: number,
  rateId: number,
  paidAmount: number
): TaskRate {
  if (!Number.isFinite(paidAmount) || paidAmount < 0) {
    throw new Error('paidAmount must be a finite non-negative number');
  }

  // Load rate + parent task via JOIN so we can compute expectedAmount for
  // the isPaid flag derivation. rateWithTaskSelect already exposes the
  // fields we need (rateType, amount, hoursOverride, timeSpent, trackedTime).
  const row = db
    .select(rateWithTaskSelect)
    .from(taskRates)
    .innerJoin(tasks, eq(taskRates.taskId, tasks.id))
    .innerJoin(portals, eq(tasks.portalId, portals.id))
    .where(eq(taskRates.id, rateId))
    .get();

  if (!row) {
    throw new Error(`Rate ${rateId} not found`);
  }
  if (row.userId !== userId) {
    throw new Error(`Rate ${rateId} does not belong to user ${userId}`);
  }

  const expectedAmount = computeExpectedAmount(
    {
      rateType: row.rateType,
      amount: row.amount,
      hoursOverride: row.hoursOverride,
    },
    { timeSpent: row.timeSpent },
    row.trackedTime
  );

  const isPaid = paidAmount + 0.005 >= expectedAmount && paidAmount > 0;
  const now = new Date().toISOString();

  db.update(taskRates)
    .set({
      paidAmount,
      isPaid,
      paidAt: isPaid ? now : null,
      updatedAt: now,
    })
    .where(
      and(
        eq(taskRates.id, rateId),
        eq(taskRates.userId, userId)
      )
    )
    .run();

  const updated = db
    .select()
    .from(taskRates)
    .where(eq(taskRates.id, rateId))
    .get();

  if (!updated) {
    throw new Error(`Rate ${rateId} disappeared after update`);
  }
  return updated;
}
