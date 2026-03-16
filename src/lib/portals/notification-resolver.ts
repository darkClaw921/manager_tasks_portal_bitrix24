import { db } from '@/lib/db';
import { portals, userPortalAccess, userBitrixMappings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUsersForBitrixUserIds } from '@/lib/portals/mappings';

/**
 * Minimal task shape needed for resolving notification recipients.
 * Matches the fields stored in the `tasks` table.
 */
interface TaskInfo {
  responsibleId?: string | null;
  creatorId?: string | null;
  accomplices?: string | null; // JSON array string, e.g. '["1","2"]'
  auditors?: string | null;    // JSON array string
}

/**
 * Parse a JSON array string (e.g. '["1","2"]') into a string array.
 * Returns an empty array for null/empty/invalid values.
 */
function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map(String).filter(Boolean);
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Collect all unique Bitrix24 user IDs involved in a task.
 * These are the users who are relevant to the task (responsible, creator, accomplices, auditors).
 */
function collectBitrixUserIds(task: TaskInfo): string[] {
  const ids = new Set<string>();

  if (task.responsibleId) ids.add(task.responsibleId);
  if (task.creatorId) ids.add(task.creatorId);

  for (const id of parseJsonArray(task.accomplices)) {
    ids.add(id);
  }

  for (const id of parseJsonArray(task.auditors)) {
    ids.add(id);
  }

  return Array.from(ids);
}

/**
 * Get the portal admin user ID (the user who connected the portal).
 * Used as a fallback when no user-bitrix mappings exist.
 */
function getPortalAdminUserId(portalId: number): number | null {
  const portal = db
    .select({ userId: portals.userId })
    .from(portals)
    .where(eq(portals.id, portalId))
    .get();

  return portal?.userId ?? null;
}

/**
 * Check whether any user-bitrix mappings exist for a portal.
 * If no mappings exist at all, we should fall back to the portal admin.
 */
function hasAnyMappings(portalId: number): boolean {
  const row = db
    .select({ id: userBitrixMappings.id })
    .from(userBitrixMappings)
    .where(eq(userBitrixMappings.portalId, portalId))
    .limit(1)
    .get();

  return !!row;
}

/**
 * Filter app user IDs to only those who have access to the portal
 * and whose permission settings would allow them to see the given task.
 *
 * A user passes the filter if:
 * - They have `can_see_all = true`, OR
 * - Any of their enabled can_see_* flags matches their role in the task
 *
 * @param portalId - The portal ID
 * @param userIds - Candidate app user IDs (from mapping lookup)
 * @param task - The task to check permissions against
 * @param bitrixUserIdToAppUserIds - Map of bitrixUserId -> appUserIds for reverse lookup
 */
function filterByPermissions(
  portalId: number,
  userIds: number[],
  task: TaskInfo,
  bitrixUserIdToAppUserIds: Map<string, number[]>
): number[] {
  if (userIds.length === 0) return [];

  // Get access entries for all candidate users on this portal
  const accessEntries = db
    .select({
      userId: userPortalAccess.userId,
      canSeeAll: userPortalAccess.canSeeAll,
      canSeeResponsible: userPortalAccess.canSeeResponsible,
      canSeeAccomplice: userPortalAccess.canSeeAccomplice,
      canSeeAuditor: userPortalAccess.canSeeAuditor,
      canSeeCreator: userPortalAccess.canSeeCreator,
    })
    .from(userPortalAccess)
    .where(eq(userPortalAccess.portalId, portalId))
    .all();

  const accessMap = new Map(
    accessEntries.map((e) => [e.userId, e])
  );

  // Build reverse lookup: appUserId -> bitrixUserId
  const appUserToBitrix = new Map<number, string>();
  for (const [bitrixId, appIds] of bitrixUserIdToAppUserIds) {
    for (const appId of appIds) {
      appUserToBitrix.set(appId, bitrixId);
    }
  }

  const accompliceIds = new Set(parseJsonArray(task.accomplices));
  const auditorIds = new Set(parseJsonArray(task.auditors));

  const filtered: number[] = [];

  for (const userId of userIds) {
    const access = accessMap.get(userId);
    if (!access) continue; // No portal access at all

    // can_see_all passes immediately
    if (access.canSeeAll) {
      filtered.push(userId);
      continue;
    }

    const bitrixId = appUserToBitrix.get(userId);
    if (!bitrixId) continue;

    let canSee = false;

    if (access.canSeeResponsible && task.responsibleId === bitrixId) {
      canSee = true;
    }
    if (!canSee && access.canSeeCreator && task.creatorId === bitrixId) {
      canSee = true;
    }
    if (!canSee && access.canSeeAccomplice && accompliceIds.has(bitrixId)) {
      canSee = true;
    }
    if (!canSee && access.canSeeAuditor && auditorIds.has(bitrixId)) {
      canSee = true;
    }

    if (canSee) {
      filtered.push(userId);
    }
  }

  return filtered;
}

/**
 * Resolve which app users should receive a notification about a task event.
 *
 * Logic:
 * 1. Collect all Bitrix24 user IDs involved in the task (responsible, creator, accomplices, auditors)
 * 2. Look up corresponding app users via user_bitrix_mappings
 * 3. Filter by portal access permissions (can_see_* flags)
 * 4. Fallback: if no mappings exist for this portal at all, return the portal admin (who connected it)
 *
 * @returns Array of unique app user IDs who should be notified
 */
export function resolveNotificationRecipients(
  portalId: number,
  task: TaskInfo
): number[] {
  const bitrixUserIds = collectBitrixUserIds(task);

  // Fallback: if no mappings exist at all for this portal, notify the portal admin
  if (!hasAnyMappings(portalId)) {
    const adminUserId = getPortalAdminUserId(portalId);
    if (adminUserId) {
      console.log(
        `[notification-resolver] No mappings for portal ${portalId}, falling back to admin user ${adminUserId}`
      );
      return [adminUserId];
    }
    return [];
  }

  if (bitrixUserIds.length === 0) {
    // Task has no user IDs at all — unlikely but handle gracefully
    const adminUserId = getPortalAdminUserId(portalId);
    return adminUserId ? [adminUserId] : [];
  }

  // Look up app users for all involved Bitrix24 user IDs
  const appUserIds = getUsersForBitrixUserIds(bitrixUserIds, portalId);

  if (appUserIds.length === 0) {
    // Mappings exist but none matched — notify portal admin as fallback
    const adminUserId = getPortalAdminUserId(portalId);
    if (adminUserId) {
      console.log(
        `[notification-resolver] No mapped users for task's bitrix IDs on portal ${portalId}, falling back to admin user ${adminUserId}`
      );
      return [adminUserId];
    }
    return [];
  }

  // Build the bitrixUserId -> appUserIds map for permission filtering
  const bitrixToAppMap = new Map<string, number[]>();
  for (const bitrixId of bitrixUserIds) {
    const mapped = getUsersForBitrixUserIds([bitrixId], portalId);
    if (mapped.length > 0) {
      bitrixToAppMap.set(bitrixId, mapped);
    }
  }

  // Filter by permissions
  const filtered = filterByPermissions(portalId, appUserIds, task, bitrixToAppMap);

  // Deduplicate
  const unique = [...new Set(filtered)];

  if (unique.length === 0) {
    // All users filtered out by permissions — fallback to portal admin
    const adminUserId = getPortalAdminUserId(portalId);
    if (adminUserId) {
      console.log(
        `[notification-resolver] All users filtered by permissions for portal ${portalId}, falling back to admin user ${adminUserId}`
      );
      return [adminUserId];
    }
  }

  return unique;
}

/**
 * Resolve which app users should receive a mention notification.
 *
 * Given a list of mentioned Bitrix24 user IDs (from [user=ID] BBCode),
 * find the corresponding app users via user_bitrix_mappings.
 *
 * Unlike resolveNotificationRecipients, this does NOT filter by can_see_* permissions
 * because a mention is a direct reference to a user — they should be notified
 * regardless of their general task visibility settings.
 *
 * @returns Array of unique app user IDs who were mentioned and have mappings
 */
export function resolveRecipientsForMention(
  portalId: number,
  bitrixUserIds: string[]
): number[] {
  if (bitrixUserIds.length === 0) return [];

  // Fallback: if no mappings exist at all, return the portal admin
  if (!hasAnyMappings(portalId)) {
    const adminUserId = getPortalAdminUserId(portalId);
    if (adminUserId) {
      console.log(
        `[notification-resolver] No mappings for mention on portal ${portalId}, falling back to admin user ${adminUserId}`
      );
      return [adminUserId];
    }
    return [];
  }

  const stringIds = bitrixUserIds.map(String);
  const appUserIds = getUsersForBitrixUserIds(stringIds, portalId);

  // Deduplicate
  return [...new Set(appUserIds)];
}
