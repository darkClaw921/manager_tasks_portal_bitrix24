import { NextResponse } from 'next/server';

interface RateLimiterConfig {
  /** Time window in milliseconds */
  windowMs: number;
  /** Maximum number of requests allowed within the window */
  maxRequests: number;
}

interface CheckResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Milliseconds until the client can retry (only set when blocked) */
  retryAfterMs: number;
}

/**
 * In-memory sliding-window rate limiter.
 *
 * Stores an array of timestamps per key. On each check, only timestamps
 * within the current window are considered. Expired entries are cleaned
 * up periodically to prevent memory leaks.
 */
export class RateLimiter {
  private readonly store = new Map<string, number[]>();
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: RateLimiterConfig) {
    this.windowMs = config.windowMs;
    this.maxRequests = config.maxRequests;

    // Periodic cleanup of expired entries
    this.cleanupTimer = setInterval(() => this.cleanup(), this.windowMs);
    // Allow the process to exit even if the timer is still active
    if (this.cleanupTimer && typeof this.cleanupTimer === 'object' && 'unref' in this.cleanupTimer) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Check if a request for the given key is allowed without consuming a slot.
   */
  check(key: string): CheckResult {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    const timestamps = this.store.get(key);
    if (!timestamps) {
      return { allowed: true, retryAfterMs: 0 };
    }

    // Filter to only timestamps within the current window
    const recentTimestamps = timestamps.filter((ts) => ts > windowStart);

    if (recentTimestamps.length < this.maxRequests) {
      return { allowed: true, retryAfterMs: 0 };
    }

    // Blocked: calculate when the oldest request in the window expires
    const oldestInWindow = recentTimestamps[0];
    const retryAfterMs = oldestInWindow + this.windowMs - now;

    return {
      allowed: false,
      retryAfterMs: Math.max(retryAfterMs, 1),
    };
  }

  /**
   * Check and consume a request slot for the given key.
   * Returns true if the request is allowed, false if rate-limited.
   */
  consume(key: string): CheckResult {
    const result = this.check(key);

    if (result.allowed) {
      const now = Date.now();
      const timestamps = this.store.get(key);
      if (timestamps) {
        timestamps.push(now);
      } else {
        this.store.set(key, [now]);
      }
    }

    return result;
  }

  /**
   * Remove expired entries from all keys to prevent memory leaks.
   */
  private cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    for (const [key, timestamps] of this.store.entries()) {
      const recent = timestamps.filter((ts) => ts > windowStart);
      if (recent.length === 0) {
        this.store.delete(key);
      } else {
        this.store.set(key, recent);
      }
    }
  }

  /**
   * Destroy the limiter and clear the cleanup timer.
   * Call this when shutting down to prevent timer leaks in tests.
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.store.clear();
  }
}

// ---------------------------------------------------------------------------
// Pre-configured rate limiter instances
// ---------------------------------------------------------------------------

/** Login: 5 attempts per 15 minutes per IP */
export const loginLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5,
});

/** Webhook: 100 requests per minute per member_id */
export const webhookLimiter = new RateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100,
});

/** AI chat: 10 requests per minute per userId */
export const aiLimiter = new RateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10,
});

// ---------------------------------------------------------------------------
// Helper for building 429 responses
// ---------------------------------------------------------------------------

/**
 * Build a standardised 429 Too Many Requests response.
 *
 * @param retryAfterMs - Milliseconds until the client can retry
 * @param message - Optional human-readable message
 */
export function rateLimitResponse(
  retryAfterMs: number,
  message = 'Слишком много запросов. Попробуйте позже.'
): NextResponse {
  const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);

  return NextResponse.json(
    { error: 'Too Many Requests', message },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfterSeconds),
      },
    }
  );
}
