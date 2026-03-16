/**
 * Next.js Instrumentation Hook
 *
 * This file is automatically loaded by Next.js when the app starts.
 * It initializes background services like cron jobs.
 *
 * Note: This runs only on the server side (Node.js runtime).
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  // Only run on the server (not in Edge Runtime)
  if (typeof globalThis.process !== 'undefined' && process.env.NEXT_RUNTIME === 'nodejs') {
    const { initializeCron, shouldEnableCron } = await import(
      '@/lib/cron/scheduler'
    );

    if (shouldEnableCron()) {
      initializeCron();
    } else {
      console.log(
        '[instrumentation] Cron disabled (set ENABLE_CRON=true to enable in development)'
      );
    }
  }
}
