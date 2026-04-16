import { db } from '@/lib/db';
import { portals } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Synthetic memberId used to identify the single "local" portal
 * (not connected to any Bitrix24 account).
 *
 * Local portal is used to host tasks that exist only inside this app,
 * with no Bitrix24 sync or OAuth tokens.
 */
export const LOCAL_PORTAL_MEMBER_ID = '__local__';

/**
 * Module-level cache for local portal id.
 *   undefined — not looked up yet (initial state)
 *   null      — looked up, no row in DB yet
 *   number    — looked up, row exists with this id
 */
let cachedId: number | null | undefined = undefined;

/**
 * Return id of the local portal row, or null if it has not been seeded yet.
 * The result is cached at module level — call {@link invalidateLocalPortalCache}
 * after creating/deleting the local portal row (e.g. from seedLocalPortal).
 */
export async function getLocalPortalId(): Promise<number | null> {
  if (cachedId !== undefined) {
    return cachedId;
  }

  const row = db
    .select({ id: portals.id })
    .from(portals)
    .where(eq(portals.memberId, LOCAL_PORTAL_MEMBER_ID))
    .get();

  cachedId = row ? row.id : null;
  return cachedId;
}

/**
 * Invalidate the cached local portal id.
 * Call after seedLocalPortal or any other change to the local portal row.
 */
export function invalidateLocalPortalCache(): void {
  cachedId = undefined;
}

/**
 * Strict check: does the given portal-like object represent the local portal?
 */
export function isLocalPortal(portal: { memberId: string }): boolean {
  return portal.memberId === LOCAL_PORTAL_MEMBER_ID;
}

/**
 * Async check: is the given portalId the id of the local portal?
 * Returns false when local portal has not been seeded yet.
 */
export async function isLocalPortalId(portalId: number): Promise<boolean> {
  const localId = await getLocalPortalId();
  return localId !== null && localId === portalId;
}
