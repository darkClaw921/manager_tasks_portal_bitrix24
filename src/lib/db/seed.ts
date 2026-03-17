import { db } from './index';
import { users, appSettings } from './schema';
import { eq } from 'drizzle-orm';
import { hashPassword } from '../auth/password';

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
