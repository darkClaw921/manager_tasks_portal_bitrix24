/**
 * Shared payment calculation helpers.
 *
 * Central formula used by /payments (rates.ts:getPaymentSummary) and by the
 * user wallet layer. Keep the two consumers aligned — the formula must stay
 * identical so the summary displayed in /payments is consistent with the
 * `expected` value the user sees in /wallet.
 */

/**
 * Minimal rate shape required for expected-amount computation.
 * Deliberately structural (not Pick<TaskRate>) to make the helper usable
 * with partial JOIN row shapes as well as full TaskRate records.
 */
export interface ExpectedAmountRate {
  rateType: string; // 'hourly' | 'fixed'
  amount: number;
  hoursOverride: number | null;
}

/**
 * Minimal task shape — only timeSpent is needed from the task itself.
 * Tracked time (user time-tracking entries) is passed separately because it
 * is aggregated from timeTrackingEntries via SQL in callers.
 */
export interface ExpectedAmountTask {
  timeSpent: number | null;
}

/**
 * Compute the expected (earned) amount for a single rate.
 *
 * Formula:
 *   - hourly: amount * hours
 *       where hours = hoursOverride ?? trackedTime/3600 ?? timeSpent/3600 ?? 0
 *   - fixed:  amount
 *
 * `trackedTime` and `task.timeSpent` are expected in **seconds**.
 *
 * Numbers are returned without rounding — callers that need a display-friendly
 * value should apply their own Math.round(... * 100) / 100.
 */
export function computeExpectedAmount(
  rate: ExpectedAmountRate,
  task: ExpectedAmountTask,
  trackedTime?: number | null
): number {
  if (rate.rateType === 'hourly') {
    const hours =
      rate.hoursOverride ??
      (trackedTime ? trackedTime / 3600 : task.timeSpent ? task.timeSpent / 3600 : 0);
    return rate.amount * hours;
  }
  return rate.amount;
}
