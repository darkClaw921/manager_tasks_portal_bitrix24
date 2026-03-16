import { db } from '@/lib/db';
import { userPortalAccess, userBitrixMappings, portals } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

/**
 * Access info for a single portal: what the user can see + their Bitrix user ID.
 */
interface PortalAccessInfo {
  portalId: number;
  canSeeAll: boolean;
  canSeeResponsible: boolean;
  canSeeAccomplice: boolean;
  canSeeAuditor: boolean;
  canSeeCreator: boolean;
  bitrixUserId: string | null;
}

/**
 * Get access info for all portals a user has access to.
 */
function getUserPortalAccessInfo(userId: number): PortalAccessInfo[] {
  const rows = db
    .select({
      portalId: userPortalAccess.portalId,
      canSeeAll: userPortalAccess.canSeeAll,
      canSeeResponsible: userPortalAccess.canSeeResponsible,
      canSeeAccomplice: userPortalAccess.canSeeAccomplice,
      canSeeAuditor: userPortalAccess.canSeeAuditor,
      canSeeCreator: userPortalAccess.canSeeCreator,
      bitrixUserId: userBitrixMappings.bitrixUserId,
    })
    .from(userPortalAccess)
    .innerJoin(portals, eq(userPortalAccess.portalId, portals.id))
    .leftJoin(
      userBitrixMappings,
      and(
        eq(userBitrixMappings.userId, userPortalAccess.userId),
        eq(userBitrixMappings.portalId, userPortalAccess.portalId)
      )
    )
    .where(
      and(
        eq(userPortalAccess.userId, userId),
        eq(portals.isActive, true)
      )
    )
    .all();

  return rows.map((r) => ({
    portalId: r.portalId,
    canSeeAll: Boolean(r.canSeeAll),
    canSeeResponsible: Boolean(r.canSeeResponsible),
    canSeeAccomplice: Boolean(r.canSeeAccomplice),
    canSeeAuditor: Boolean(r.canSeeAuditor),
    canSeeCreator: Boolean(r.canSeeCreator),
    bitrixUserId: r.bitrixUserId ?? null,
  }));
}

/**
 * Escape a string for use in SQL LIKE pattern (prevent SQL injection via LIKE).
 */
function escapeLikeValue(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Build a SQL WHERE condition that filters tasks based on user's access permissions.
 *
 * Logic per portal:
 * - can_see_all: all tasks for that portal
 * - can_see_responsible: tasks.responsible_id = bitrixUserId
 * - can_see_accomplice: bitrixUserId IN tasks.accomplices (JSON array)
 * - can_see_auditor: bitrixUserId IN tasks.auditors (JSON array)
 * - can_see_creator: tasks.creator_id = bitrixUserId
 * - Conditions are OR'd within a portal
 *
 * Returns a raw SQL fragment or null if user has no access.
 */
export function buildTaskAccessFilter(userId: number): ReturnType<typeof sql> | null {
  const accessInfo = getUserPortalAccessInfo(userId);

  if (accessInfo.length === 0) {
    return null; // No access to any portal
  }

  const portalConditions: string[] = [];

  for (const info of accessInfo) {
    const conditions: string[] = [];

    if (info.canSeeAll) {
      // User can see all tasks for this portal
      conditions.push(`tasks.portal_id = ${info.portalId}`);
    } else if (info.bitrixUserId) {
      const buid = escapeLikeValue(info.bitrixUserId);

      if (info.canSeeResponsible) {
        conditions.push(
          `(tasks.portal_id = ${info.portalId} AND tasks.responsible_id = '${buid}')`
        );
      }
      if (info.canSeeAccomplice) {
        // accomplices is a JSON array stored as TEXT, e.g. '["1","2","3"]'
        // Use LIKE to check if bitrixUserId is in the array
        conditions.push(
          `(tasks.portal_id = ${info.portalId} AND tasks.accomplices LIKE '%"${buid}"%')`
        );
      }
      if (info.canSeeAuditor) {
        // auditors is a JSON array stored as TEXT
        conditions.push(
          `(tasks.portal_id = ${info.portalId} AND tasks.auditors LIKE '%"${buid}"%')`
        );
      }
      if (info.canSeeCreator) {
        conditions.push(
          `(tasks.portal_id = ${info.portalId} AND tasks.creator_id = '${buid}')`
        );
      }
    }
    // If no bitrixUserId and not can_see_all, user sees nothing for this portal

    if (conditions.length > 0) {
      portalConditions.push(`(${conditions.join(' OR ')})`);
    }
  }

  if (portalConditions.length === 0) {
    return null; // User has access entries but no permissions or no mappings
  }

  // Combine all portal conditions with OR
  const combinedSql = portalConditions.join(' OR ');
  return sql.raw(`(${combinedSql})`);
}

/**
 * Get accessible portal IDs for a user, considering only active portals.
 * Used when we just need the portal list (without task-level filtering).
 */
export function getAccessiblePortalIds(userId: number): number[] {
  const accessInfo = getUserPortalAccessInfo(userId);
  return accessInfo.map((a) => a.portalId);
}

/**
 * Build a SQL WHERE condition for a specific portal + user combination.
 * Useful when filtering tasks for a single portal.
 */
export function buildPortalTaskFilter(
  userId: number,
  portalId: number
): ReturnType<typeof sql> | null {
  const row = db
    .select({
      canSeeAll: userPortalAccess.canSeeAll,
      canSeeResponsible: userPortalAccess.canSeeResponsible,
      canSeeAccomplice: userPortalAccess.canSeeAccomplice,
      canSeeAuditor: userPortalAccess.canSeeAuditor,
      canSeeCreator: userPortalAccess.canSeeCreator,
      bitrixUserId: userBitrixMappings.bitrixUserId,
    })
    .from(userPortalAccess)
    .leftJoin(
      userBitrixMappings,
      and(
        eq(userBitrixMappings.userId, userPortalAccess.userId),
        eq(userBitrixMappings.portalId, userPortalAccess.portalId)
      )
    )
    .where(
      and(
        eq(userPortalAccess.userId, userId),
        eq(userPortalAccess.portalId, portalId)
      )
    )
    .get();

  if (!row) {
    return null; // No access to this portal
  }

  if (row.canSeeAll) {
    return sql.raw(`tasks.portal_id = ${portalId}`);
  }

  if (!row.bitrixUserId) {
    return null; // No mapping, can't see tasks (unless can_see_all)
  }

  const buid = escapeLikeValue(row.bitrixUserId);
  const conditions: string[] = [];

  if (row.canSeeResponsible) {
    conditions.push(`tasks.responsible_id = '${buid}'`);
  }
  if (row.canSeeAccomplice) {
    conditions.push(`tasks.accomplices LIKE '%"${buid}"%'`);
  }
  if (row.canSeeAuditor) {
    conditions.push(`tasks.auditors LIKE '%"${buid}"%'`);
  }
  if (row.canSeeCreator) {
    conditions.push(`tasks.creator_id = '${buid}'`);
  }

  if (conditions.length === 0) {
    return null;
  }

  return sql.raw(`(tasks.portal_id = ${portalId} AND (${conditions.join(' OR ')}))`);
}
