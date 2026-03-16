import { db } from '@/lib/db';
import { userPortalAccess, portals, users } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import type { PortalAccessRole, PortalAccessPermissions } from '@/types';

// ==================== Types ====================

export interface PortalAccessEntry {
  id: number;
  userId: number;
  portalId: number;
  role: PortalAccessRole;
  canSeeResponsible: boolean;
  canSeeAccomplice: boolean;
  canSeeAuditor: boolean;
  canSeeCreator: boolean;
  canSeeAll: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PortalWithAccess {
  id: number;
  domain: string;
  name: string;
  color: string;
  memberId: string;
  isActive: boolean;
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
  role: PortalAccessRole;
  canSeeResponsible: boolean;
  canSeeAccomplice: boolean;
  canSeeAuditor: boolean;
  canSeeCreator: boolean;
  canSeeAll: boolean;
}

export interface PortalUserEntry {
  userId: number;
  email: string;
  firstName: string;
  lastName: string;
  role: PortalAccessRole;
  canSeeResponsible: boolean;
  canSeeAccomplice: boolean;
  canSeeAuditor: boolean;
  canSeeCreator: boolean;
  canSeeAll: boolean;
  accessCreatedAt: string;
}

// ==================== Functions ====================

/**
 * Get all portals a user has access to, including access permissions.
 * Replaces the old portals.userId-based query.
 */
export function getUserPortals(userId: number): PortalWithAccess[] {
  const rows = db
    .select({
      id: portals.id,
      domain: portals.domain,
      name: portals.name,
      color: portals.color,
      memberId: portals.memberId,
      isActive: portals.isActive,
      lastSyncAt: portals.lastSyncAt,
      createdAt: portals.createdAt,
      updatedAt: portals.updatedAt,
      role: userPortalAccess.role,
      canSeeResponsible: userPortalAccess.canSeeResponsible,
      canSeeAccomplice: userPortalAccess.canSeeAccomplice,
      canSeeAuditor: userPortalAccess.canSeeAuditor,
      canSeeCreator: userPortalAccess.canSeeCreator,
      canSeeAll: userPortalAccess.canSeeAll,
    })
    .from(userPortalAccess)
    .innerJoin(portals, eq(userPortalAccess.portalId, portals.id))
    .where(eq(userPortalAccess.userId, userId))
    .all();

  return rows as PortalWithAccess[];
}

/**
 * Get all users with access to a specific portal.
 */
export function getPortalUsers(portalId: number): PortalUserEntry[] {
  const rows = db
    .select({
      userId: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: userPortalAccess.role,
      canSeeResponsible: userPortalAccess.canSeeResponsible,
      canSeeAccomplice: userPortalAccess.canSeeAccomplice,
      canSeeAuditor: userPortalAccess.canSeeAuditor,
      canSeeCreator: userPortalAccess.canSeeCreator,
      canSeeAll: userPortalAccess.canSeeAll,
      accessCreatedAt: userPortalAccess.createdAt,
    })
    .from(userPortalAccess)
    .innerJoin(users, eq(userPortalAccess.userId, users.id))
    .where(eq(userPortalAccess.portalId, portalId))
    .all();

  return rows as PortalUserEntry[];
}

/**
 * Check if a user has any access to a portal.
 */
export function hasPortalAccess(userId: number, portalId: number): boolean {
  const row = db
    .select({ id: userPortalAccess.id })
    .from(userPortalAccess)
    .where(
      and(
        eq(userPortalAccess.userId, userId),
        eq(userPortalAccess.portalId, portalId)
      )
    )
    .get();

  return !!row;
}

/**
 * Check if a user is an admin for a specific portal.
 */
export function isPortalAdmin(userId: number, portalId: number): boolean {
  const row = db
    .select({ role: userPortalAccess.role })
    .from(userPortalAccess)
    .where(
      and(
        eq(userPortalAccess.userId, userId),
        eq(userPortalAccess.portalId, portalId)
      )
    )
    .get();

  return row?.role === 'admin';
}

/**
 * Get the full access record for a user on a portal.
 */
export function getPortalAccess(userId: number, portalId: number): PortalAccessEntry | null {
  const row = db
    .select()
    .from(userPortalAccess)
    .where(
      and(
        eq(userPortalAccess.userId, userId),
        eq(userPortalAccess.portalId, portalId)
      )
    )
    .get();

  return (row as PortalAccessEntry) || null;
}

/**
 * Grant access to a portal for a user.
 * If access already exists, it will fail silently due to UNIQUE constraint.
 */
export function grantPortalAccess(
  userId: number,
  portalId: number,
  options?: {
    role?: PortalAccessRole;
    permissions?: Partial<PortalAccessPermissions>;
  }
): number {
  const now = new Date().toISOString();
  const role = options?.role || 'viewer';
  const perms = options?.permissions || {};

  const result = db
    .insert(userPortalAccess)
    .values({
      userId,
      portalId,
      role,
      canSeeResponsible: perms.canSeeResponsible ?? true,
      canSeeAccomplice: perms.canSeeAccomplice ?? false,
      canSeeAuditor: perms.canSeeAuditor ?? false,
      canSeeCreator: perms.canSeeCreator ?? false,
      canSeeAll: perms.canSeeAll ?? false,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return Number(result.lastInsertRowid);
}

/**
 * Update access permissions for a user on a portal.
 */
export function updatePortalAccess(
  userId: number,
  portalId: number,
  updates: {
    role?: PortalAccessRole;
    permissions?: Partial<PortalAccessPermissions>;
  }
): boolean {
  const now = new Date().toISOString();
  const setValues: Record<string, unknown> = { updatedAt: now };

  if (updates.role !== undefined) {
    setValues.role = updates.role;
  }
  if (updates.permissions) {
    const p = updates.permissions;
    if (p.canSeeResponsible !== undefined) setValues.canSeeResponsible = p.canSeeResponsible;
    if (p.canSeeAccomplice !== undefined) setValues.canSeeAccomplice = p.canSeeAccomplice;
    if (p.canSeeAuditor !== undefined) setValues.canSeeAuditor = p.canSeeAuditor;
    if (p.canSeeCreator !== undefined) setValues.canSeeCreator = p.canSeeCreator;
    if (p.canSeeAll !== undefined) setValues.canSeeAll = p.canSeeAll;
  }

  const result = db
    .update(userPortalAccess)
    .set(setValues)
    .where(
      and(
        eq(userPortalAccess.userId, userId),
        eq(userPortalAccess.portalId, portalId)
      )
    )
    .run();

  return result.changes > 0;
}

/**
 * Revoke a user's access to a portal.
 * Returns false if trying to remove the last admin.
 */
export function revokePortalAccess(userId: number, portalId: number): boolean {
  // Check if this is the last admin
  const access = getPortalAccess(userId, portalId);
  if (access?.role === 'admin') {
    const adminCount = db
      .select({ id: userPortalAccess.id })
      .from(userPortalAccess)
      .where(
        and(
          eq(userPortalAccess.portalId, portalId),
          eq(userPortalAccess.role, 'admin')
        )
      )
      .all();

    if (adminCount.length <= 1) {
      return false; // Cannot remove the last admin
    }
  }

  const result = db
    .delete(userPortalAccess)
    .where(
      and(
        eq(userPortalAccess.userId, userId),
        eq(userPortalAccess.portalId, portalId)
      )
    )
    .run();

  return result.changes > 0;
}

/**
 * Get accessible portal IDs for a user (only active portals).
 */
export function getAccessiblePortalIds(userId: number): number[] {
  const rows = db
    .select({ portalId: userPortalAccess.portalId })
    .from(userPortalAccess)
    .innerJoin(portals, eq(userPortalAccess.portalId, portals.id))
    .where(
      and(
        eq(userPortalAccess.userId, userId),
        eq(portals.isActive, true)
      )
    )
    .all();

  return rows.map((r) => r.portalId);
}
