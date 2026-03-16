import { db } from '@/lib/db';
import { userBitrixMappings, users } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';

// ==================== Types ====================

export interface MappingWithUser {
  id: number;
  userId: number;
  portalId: number;
  bitrixUserId: string;
  bitrixName: string | null;
  createdAt: string;
  updatedAt: string;
  email: string;
  firstName: string;
  lastName: string;
}

// ==================== Functions ====================

/**
 * Get the Bitrix24 user ID mapped to a given app user on a portal.
 *
 * @returns bitrixUserId or null if no mapping exists
 */
export function getBitrixUserIdForUser(
  userId: number,
  portalId: number
): string | null {
  const row = db
    .select({ bitrixUserId: userBitrixMappings.bitrixUserId })
    .from(userBitrixMappings)
    .where(
      and(
        eq(userBitrixMappings.userId, userId),
        eq(userBitrixMappings.portalId, portalId)
      )
    )
    .get();

  return row?.bitrixUserId ?? null;
}

/**
 * Get the app user ID mapped to a given Bitrix24 user on a portal.
 *
 * @returns userId or null if no mapping exists
 */
export function getUserForBitrixUserId(
  bitrixUserId: string,
  portalId: number
): number | null {
  const row = db
    .select({ userId: userBitrixMappings.userId })
    .from(userBitrixMappings)
    .where(
      and(
        eq(userBitrixMappings.bitrixUserId, bitrixUserId),
        eq(userBitrixMappings.portalId, portalId)
      )
    )
    .get();

  return row?.userId ?? null;
}

/**
 * Bulk reverse lookup: given an array of Bitrix24 user IDs,
 * return the corresponding app user IDs.
 *
 * @returns Array of app user IDs (may be shorter than input if some have no mapping)
 */
export function getUsersForBitrixUserIds(
  bitrixUserIds: string[],
  portalId: number
): number[] {
  if (bitrixUserIds.length === 0) {
    return [];
  }

  const rows = db
    .select({ userId: userBitrixMappings.userId })
    .from(userBitrixMappings)
    .where(
      and(
        eq(userBitrixMappings.portalId, portalId),
        inArray(userBitrixMappings.bitrixUserId, bitrixUserIds)
      )
    )
    .all();

  return rows.map((r) => r.userId);
}

/**
 * Get all user-to-Bitrix24 mappings for a portal, including user info.
 */
export function getAllMappingsForPortal(portalId: number): MappingWithUser[] {
  const rows = db
    .select({
      id: userBitrixMappings.id,
      userId: userBitrixMappings.userId,
      portalId: userBitrixMappings.portalId,
      bitrixUserId: userBitrixMappings.bitrixUserId,
      bitrixName: userBitrixMappings.bitrixName,
      createdAt: userBitrixMappings.createdAt,
      updatedAt: userBitrixMappings.updatedAt,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(userBitrixMappings)
    .innerJoin(users, eq(userBitrixMappings.userId, users.id))
    .where(eq(userBitrixMappings.portalId, portalId))
    .all();

  return rows as MappingWithUser[];
}

/**
 * Create a user-to-Bitrix24 mapping.
 * Enforces unique (userId, portalId) and (portalId, bitrixUserId) constraints.
 *
 * @returns The created mapping row
 * @throws Error on duplicate mapping (SQLite UNIQUE constraint)
 */
export function createMapping(
  userId: number,
  portalId: number,
  bitrixUserId: string,
  bitrixName?: string
) {
  const now = new Date().toISOString();

  const result = db
    .insert(userBitrixMappings)
    .values({
      userId,
      portalId,
      bitrixUserId,
      bitrixName: bitrixName ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return {
    id: Number(result.lastInsertRowid),
    userId,
    portalId,
    bitrixUserId,
    bitrixName: bitrixName ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Delete a user-to-Bitrix24 mapping for a specific user on a portal.
 *
 * @returns true if a mapping was deleted, false if none existed
 */
export function deleteMapping(userId: number, portalId: number): boolean {
  const result = db
    .delete(userBitrixMappings)
    .where(
      and(
        eq(userBitrixMappings.userId, userId),
        eq(userBitrixMappings.portalId, portalId)
      )
    )
    .run();

  return result.changes > 0;
}

/**
 * Update an existing user-to-Bitrix24 mapping.
 *
 * @returns true if updated, false if no mapping existed
 */
export function updateMapping(
  userId: number,
  portalId: number,
  bitrixUserId: string,
  bitrixName?: string
): boolean {
  const now = new Date().toISOString();

  const result = db
    .update(userBitrixMappings)
    .set({
      bitrixUserId,
      bitrixName: bitrixName ?? null,
      updatedAt: now,
    })
    .where(
      and(
        eq(userBitrixMappings.userId, userId),
        eq(userBitrixMappings.portalId, portalId)
      )
    )
    .run();

  return result.changes > 0;
}
