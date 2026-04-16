import { db } from './index';
import { users, appSettings, portals } from './schema';
import { eq } from 'drizzle-orm';
import { hashPassword } from '../auth/password';
import {
  LOCAL_PORTAL_MEMBER_ID,
  invalidateLocalPortalCache,
} from '../portals/local';
import { grantPortalAccess, hasPortalAccess } from '../portals/access';
import { createMapping, getBitrixUserIdForUser } from '../portals/mappings';

/**
 * Seed the admin user from environment variables.
 * Uses insertOrIgnore pattern to avoid duplicates.
 * Should be called once at application startup.
 */
export async function seedAdmin(): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminFirstName = process.env.ADMIN_FIRST_NAME || 'Admin';
  const adminLastName = process.env.ADMIN_LAST_NAME || 'User';

  if (!adminEmail || !adminPassword) {
    console.warn(
      '[seed] ADMIN_EMAIL and ADMIN_PASSWORD not set in environment variables. ' +
      'Skipping admin seed. Set these variables to create the initial admin user.'
    );
    return;
  }

  try {
    // Check if admin already exists
    const existingAdmin = db
      .select()
      .from(users)
      .where(eq(users.email, adminEmail.toLowerCase().trim()))
      .get();

    if (existingAdmin) {
      console.log(`[seed] Admin user "${adminEmail}" already exists. Skipping.`);
      return;
    }

    // Hash password
    const passwordHash = await hashPassword(adminPassword);

    // Create admin user (use try/catch for race condition during parallel builds)
    try {
      db.insert(users).values({
        email: adminEmail.toLowerCase().trim(),
        passwordHash,
        firstName: adminFirstName,
        lastName: adminLastName,
        isAdmin: true,
      }).run();

      console.log(`[seed] Admin user "${adminEmail}" created successfully.`);
    } catch (insertError: unknown) {
      // Handle UNIQUE constraint (race condition with multiple workers)
      if (insertError instanceof Error && insertError.message.includes('UNIQUE constraint')) {
        console.log(`[seed] Admin user "${adminEmail}" already exists (concurrent insert). Skipping.`);
      } else {
        throw insertError;
      }
    }
  } catch (error) {
    console.error('[seed] Error seeding admin user:', error);
  }

  // Seed default app settings
  seedDefaultSettings();
}

/**
 * Seed default application settings.
 * Uses INSERT OR IGNORE to avoid overwriting existing values.
 */
function seedDefaultSettings(): void {
  const defaults: { key: string; value: string }[] = [
    { key: 'work_hours_start', value: '9' },
    { key: 'work_hours_end', value: '18' },
  ];

  for (const { key, value } of defaults) {
    try {
      db.insert(appSettings)
        .values({ key, value })
        .onConflictDoNothing({ target: appSettings.key })
        .run();
    } catch (err) {
      console.error(`[seed] Error seeding setting "${key}":`, err);
    }
  }

  console.log('[seed] Default app settings seeded.');
}

/**
 * Seed the synthetic "local" portal used to host tasks that exist only inside
 * this app (no Bitrix24 sync, no OAuth tokens).
 *
 * Idempotent: if a portal with memberId=LOCAL_PORTAL_MEMBER_ID already exists,
 * its id is returned unchanged. Otherwise a new row is inserted with
 * placeholder 'LOCAL' tokens (not encrypted — guards in the token manager and
 * sync pipeline never let those values reach the network).
 *
 * The first admin user is used as the owner (portals.userId). If no admin
 * exists yet, seeding is skipped and the function returns null.
 *
 * @returns portal id, or null when no admin user exists yet
 */
export async function seedLocalPortal(): Promise<number | null> {
  let portalId: number | null = null;

  try {
    // 1. Already seeded?
    const existing = db
      .select({ id: portals.id })
      .from(portals)
      .where(eq(portals.memberId, LOCAL_PORTAL_MEMBER_ID))
      .get();

    if (existing) {
      // Make sure cache picks up the existing id on next read
      invalidateLocalPortalCache();
      portalId = existing.id;
    } else {
      // 2. Find first admin user as owner
      const adminUser = db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.isAdmin, true))
        .get();

      if (!adminUser) {
        console.warn(
          '[seed] Skipping local portal seed — no admin user found. ' +
          'seedAdmin() must run (and succeed) before seedLocalPortal().'
        );
        return null;
      }

      // 3. Insert local portal row with placeholder tokens
      try {
        const inserted = db
          .insert(portals)
          .values({
            userId: adminUser.id,
            domain: 'local',
            name: 'Локальные задачи',
            color: '#6B7280',
            memberId: LOCAL_PORTAL_MEMBER_ID,
            clientId: 'LOCAL',
            clientSecret: 'LOCAL',
            clientEndpoint: 'LOCAL',
            accessToken: 'LOCAL',
            refreshToken: 'LOCAL',
            isActive: true,
          })
          .returning({ id: portals.id })
          .get();

        invalidateLocalPortalCache();
        console.log(
          `[seed] Local portal created (id=${inserted.id}, memberId='${LOCAL_PORTAL_MEMBER_ID}').`
        );
        portalId = inserted.id;
      } catch (insertError: unknown) {
        // Race condition with a concurrent seed — fall back to reading the row.
        if (
          insertError instanceof Error &&
          insertError.message.includes('UNIQUE constraint')
        ) {
          const raced = db
            .select({ id: portals.id })
            .from(portals)
            .where(eq(portals.memberId, LOCAL_PORTAL_MEMBER_ID))
            .get();
          invalidateLocalPortalCache();
          portalId = raced ? raced.id : null;
        } else {
          throw insertError;
        }
      }
    }
  } catch (error) {
    console.error('[seed] Error seeding local portal:', error);
    return null;
  }

  // 4. Backfill local portal access + bitrix mapping for every existing user.
  //    Idempotent: skip when a row already exists. Per-user errors are logged
  //    but never abort the seed loop.
  if (portalId !== null) {
    backfillLocalPortalAccessForAllUsers(portalId);
  }

  return portalId;
}

/**
 * Backfill `user_portal_access` and `user_bitrix_mappings` rows for every
 * existing user against the local portal. Idempotent — safe to re-run on
 * every boot (skips rows that already exist; swallows per-user failures).
 *
 * Called from {@link seedLocalPortal} after the local portal row is known.
 */
function backfillLocalPortalAccessForAllUsers(localPortalId: number): void {
  let userRows: { id: number }[] = [];
  try {
    userRows = db.select({ id: users.id }).from(users).all();
  } catch (error) {
    console.error('[seed] Failed to enumerate users for local portal backfill:', error);
    return;
  }

  let grantedCount = 0;
  let mappedCount = 0;

  for (const { id: userId } of userRows) {
    // Grant local portal access if absent.
    try {
      if (!hasPortalAccess(userId, localPortalId)) {
        grantPortalAccess(userId, localPortalId, {
          role: 'viewer',
          permissions: {
            canSeeAll: false,
            canSeeResponsible: true,
            canSeeCreator: true,
            canSeeAccomplice: true,
            canSeeAuditor: true,
          },
        });
        grantedCount++;
      }
    } catch (error) {
      // UNIQUE constraint races are expected when multiple workers run seed
      // simultaneously — log & move on.
      if (error instanceof Error && error.message.includes('UNIQUE constraint')) {
        // Access already granted concurrently; nothing to do.
      } else {
        console.error(
          `[seed] Failed to grant local portal access to user ${userId}:`,
          error
        );
      }
    }

    // Create bitrix mapping if absent (bitrixUserId = String(userId)).
    try {
      if (getBitrixUserIdForUser(userId, localPortalId) === null) {
        createMapping(userId, localPortalId, String(userId));
        mappedCount++;
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint')) {
        // Mapping already created concurrently; ignore.
      } else {
        console.error(
          `[seed] Failed to create local portal mapping for user ${userId}:`,
          error
        );
      }
    }
  }

  if (grantedCount > 0 || mappedCount > 0) {
    console.log(
      `[seed] Local portal backfill: granted access to ${grantedCount} user(s), ` +
      `created ${mappedCount} mapping(s) of ${userRows.length} total user(s).`
    );
  }
}
