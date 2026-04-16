/**
 * Cron job: reconcile empty meetings every minute (Phase 4).
 *
 * This module is intentionally thin — all business logic lives in
 * `src/lib/meetings/cleanup.ts`. The cron wrapper only owns scheduling,
 * the idempotency guard (so HMR or a second instrumentation load does not
 * double-register), and error isolation (a throw in `tickEmptyMeetings`
 * must never tear down the cron).
 *
 * Kept separate from `scheduler.ts` so the meetings feature can evolve
 * without the broader cron layer having to know about it. Registration
 * happens from `src/instrumentation.ts`, alongside the main scheduler.
 */

import cron from 'node-cron';
import { tickEmptyMeetings } from '@/lib/meetings/cleanup';

let isRegistered = false;

/**
 * Register the every-minute task that scans every `status = 'live'`
 * meeting for emptiness and auto-ends those that have been empty for at
 * least 5 minutes. Idempotent — safe to call multiple times.
 */
export function registerMeetingsCleanupCron(): void {
  if (isRegistered) {
    console.log('[cron:meetings-cleanup] Already registered, skipping');
    return;
  }
  isRegistered = true;

  cron.schedule('* * * * *', async () => {
    try {
      await tickEmptyMeetings();
    } catch (error) {
      // Swallow — a transient DB hiccup or LiveKit timeout must not crash
      // the cron runtime. The next tick retries.
      console.error('[cron:meetings-cleanup] tick failed:', error);
    }
  });

  console.log(
    '[cron:meetings-cleanup] Registered: tickEmptyMeetings runs every minute',
  );
}
