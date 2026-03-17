import { createBitrix24Client } from './client';
import type { BitrixUser } from '@/types';

/**
 * Convert a key to UPPER_SNAKE_CASE.
 */
function toUpperSnakeCase(str: string): string {
  if (/^[A-Z0-9_]+$/.test(str)) return str;
  return str.replace(/([A-Z])/g, '_$1').toUpperCase();
}

/**
 * Normalize user keys to UPPER_SNAKE_CASE.
 */
function normalizeUserKeys(obj: Record<string, unknown>): BitrixUser {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    normalized[toUpperSnakeCase(key)] = value;
  }
  return normalized as unknown as BitrixUser;
}

/**
 * Fetch all users from a Bitrix24 portal with pagination.
 * Uses user.get REST API method, paginated by 50 per page.
 *
 * @param portalId - Local portal ID
 * @returns Array of BitrixUser objects
 */
export async function fetchBitrixUsers(portalId: number): Promise<BitrixUser[]> {
  const client = createBitrix24Client(portalId);
  const allUsers: BitrixUser[] = [];
  let start = 0;
  const pageSize = 50;

  while (true) {
    const response = await client.call<BitrixUser[]>('user.get', {
      start,
    });

    const rawUsers = response.result || [];
    const pageUsers = rawUsers.map((u) => normalizeUserKeys(u as unknown as Record<string, unknown>));
    allUsers.push(...pageUsers);

    console.log(
      `[bitrix-users] Fetched ${pageUsers.length} users (offset ${start}) for portal ${portalId}`
    );

    // Check if there are more pages
    if (pageUsers.length < pageSize || !response.next) {
      break;
    }

    start = response.next;
  }

  return allUsers;
}

/**
 * Search Bitrix24 users by name or email.
 * Uses user.get with FIND filter parameter.
 *
 * @param portalId - Local portal ID
 * @param query - Search query string
 * @returns Array of matching BitrixUser objects
 */
export async function searchBitrixUsers(
  portalId: number,
  query: string
): Promise<BitrixUser[]> {
  const client = createBitrix24Client(portalId);

  const response = await client.call<BitrixUser[]>('user.get', {
    FILTER: { FIND: query },
  });

  const rawUsers = response.result || [];
  return rawUsers.map((u) => normalizeUserKeys(u as unknown as Record<string, unknown>));
}
