import cron from 'node-cron';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { generateDigest, checkOverdueTasks } from '@/lib/notifications/digest';
import { generateAllSnapshots } from '@/lib/notifications/snapshot';
import { generateDailyReport } from '@/lib/ai/reports';

let isInitialized = false;

/**
 * Initialize cron jobs for the application.
 *
 * Jobs:
 * 1. Every hour: check for overdue tasks
 * 2. Every minute: check if it's time to send digest for any user (based on digest_time)
 * 3. At midnight (00:00): generate daily task snapshots for all users
 * 4. At midnight (00:05): pre-generate daily reports for all users
 */
export function initializeCron(): void {
  if (isInitialized) {
    console.log('[cron] Already initialized, skipping');
    return;
  }

  isInitialized = true;
  console.log('[cron] Initializing scheduled tasks');

  // ==================== Overdue Check (every hour at :00) ====================
  cron.schedule('0 * * * *', async () => {
    console.log('[cron] Running overdue task check');
    try {
      await checkOverdueTasks();
    } catch (error) {
      console.error('[cron] Overdue check failed:', error);
    }
  });

  // ==================== Digest Delivery (every minute) ====================
  // Check if current time matches any user's digest_time
  cron.schedule('* * * * *', async () => {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    try {
      // Find users whose digest_time matches current minute
      const usersForDigest = db
        .select({ id: users.id, digestTime: users.digestTime })
        .from(users)
        .where(eq(users.digestTime, currentTime))
        .all();

      if (usersForDigest.length === 0) return;

      console.log(
        `[cron] Sending digest to ${usersForDigest.length} user(s) at ${currentTime}`
      );

      for (const user of usersForDigest) {
        try {
          await generateDigest(user.id);
        } catch (error) {
          console.error(`[cron] Digest failed for user ${user.id}:`, error);
        }
      }
    } catch (error) {
      console.error('[cron] Digest check failed:', error);
    }
  });

  // ==================== Daily Task Snapshots (00:00) ====================
  cron.schedule('0 0 * * *', () => {
    console.log('[cron] Generating daily task snapshots');
    try {
      const snapshots = generateAllSnapshots();
      console.log(`[cron] Generated ${snapshots.size} daily snapshots`);
    } catch (error) {
      console.error('[cron] Daily snapshot generation failed:', error);
    }
  });

  // ==================== Daily Report Pre-generation (00:05) ====================
  cron.schedule('5 0 * * *', async () => {
    console.log('[cron] Pre-generating daily reports');

    try {
      const allUsers = db.select({ id: users.id }).from(users).all();

      for (const user of allUsers) {
        try {
          // Generate report for the previous day
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const dateStr = yesterday.toISOString().split('T')[0];

          await generateDailyReport(user.id, dateStr);
          console.log(`[cron] Generated daily report for user ${user.id}`);
        } catch (error) {
          console.error(
            `[cron] Daily report failed for user ${user.id}:`,
            error
          );
        }
      }
    } catch (error) {
      console.error('[cron] Daily report pre-generation failed:', error);
    }
  });

  console.log('[cron] Scheduled tasks initialized:');
  console.log('  - Overdue check: every hour at :00');
  console.log('  - Digest delivery: every minute (checks user digest_time)');
  console.log('  - Daily task snapshots: 00:00');
  console.log('  - Daily report generation: 00:05');
}

/**
 * Check if cron should be enabled based on environment.
 */
export function shouldEnableCron(): boolean {
  // Enable in production, or when explicitly set
  const enableCron = process.env.ENABLE_CRON;

  if (enableCron === 'true') return true;
  if (enableCron === 'false') return false;

  // Default: enable only in production
  return process.env.NODE_ENV === 'production';
}
