import { db } from '@/lib/db';
import { portals } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getValidToken, Bitrix24Error } from './token-manager';
import type { BitrixResponse } from '@/types';

/**
 * Bitrix24 REST API client.
 * Handles API calls with automatic token management and retry on expired_token.
 */
export class Bitrix24Client {
  private portalId: number;

  constructor(portalId: number) {
    this.portalId = portalId;
  }

  /**
   * Get the portal's REST API endpoint URL.
   */
  private getEndpoint(): string {
    const portal = db
      .select({ clientEndpoint: portals.clientEndpoint })
      .from(portals)
      .where(eq(portals.id, this.portalId))
      .get();

    if (!portal) {
      throw new Bitrix24Error('PORTAL_NOT_FOUND', `Portal ${this.portalId} not found`);
    }

    return portal.clientEndpoint;
  }

  /**
   * Call a Bitrix24 REST API method.
   * Automatically attaches access_token and retries once on expired_token.
   *
   * @param method - REST API method name (e.g., 'tasks.task.list')
   * @param params - Method parameters
   * @returns The parsed response result
   */
  async call<T = unknown>(
    method: string,
    params: Record<string, unknown> = {}
  ): Promise<BitrixResponse<T>> {
    return this.executeCall<T>(method, params, true);
  }

  /**
   * Execute a batch of up to 50 API calls in a single request.
   *
   * @param commands - Map of command names to [method, params] pairs
   * @returns Object with results keyed by command name
   */
  async callBatch(
    commands: Record<string, { method: string; params?: Record<string, unknown> }>
  ): Promise<Record<string, unknown>> {
    const cmdEntries = Object.entries(commands);
    if (cmdEntries.length > 50) {
      throw new Bitrix24Error(
        'BATCH_TOO_LARGE',
        `Batch contains ${cmdEntries.length} commands, maximum is 50`
      );
    }

    // Build batch command map: { cmd_name: "method?param1=val1&param2=val2" }
    const cmd: Record<string, string> = {};
    for (const [name, { method, params }] of cmdEntries) {
      if (params && Object.keys(params).length > 0) {
        const searchParams = new URLSearchParams();
        for (const [k, v] of Object.entries(params)) {
          searchParams.set(k, String(v));
        }
        cmd[name] = `${method}?${searchParams.toString()}`;
      } else {
        cmd[name] = method;
      }
    }

    const response = await this.call<{
      result: Record<string, unknown>;
      result_error: Record<string, unknown>;
      result_total: Record<string, number>;
      result_next: Record<string, number>;
    }>('batch', { halt: 0, cmd });

    return response.result as unknown as Record<string, unknown>;
  }

  /**
   * Internal method execution with optional retry on expired_token.
   */
  private async executeCall<T>(
    method: string,
    params: Record<string, unknown>,
    canRetry: boolean
  ): Promise<BitrixResponse<T>> {
    const endpoint = this.getEndpoint();
    const accessToken = await getValidToken(this.portalId);

    const url = `${endpoint}${method}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        ...params,
        auth: accessToken,
      }),
    });

    const data = await response.json();

    // Check for Bitrix24 error in response body
    if (data.error) {
      const errorCode = String(data.error);
      const errorMessage = data.error_description || data.error_message || 'Unknown Bitrix24 error';

      // Retry once on expired_token
      if (errorCode === 'expired_token' && canRetry) {
        console.log(
          `[bitrix-client] Token expired for portal ${this.portalId}, refreshing and retrying...`
        );
        // Force token refresh by calling with retry disabled
        return this.executeCall<T>(method, params, false);
      }

      throw new Bitrix24Error(errorCode, errorMessage);
    }

    if (!response.ok) {
      throw new Bitrix24Error(
        'HTTP_ERROR',
        `HTTP ${response.status}: ${response.statusText}`
      );
    }

    return data as BitrixResponse<T>;
  }
}

/**
 * Create a new Bitrix24Client for a given portal.
 */
export function createBitrix24Client(portalId: number): Bitrix24Client {
  return new Bitrix24Client(portalId);
}

// Re-export error class for convenience
export { Bitrix24Error } from './token-manager';
