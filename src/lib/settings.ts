import { db } from './db';
import { appSettings } from './db/schema';
import { eq } from 'drizzle-orm';

/**
 * Get a single setting value by key.
 * Returns null if the key does not exist.
 */
export function getSetting(key: string): string | null {
  const row = db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .get();

  return row?.value ?? null;
}

/**
 * Set a setting value. Uses INSERT OR REPLACE (upsert) pattern.
 */
export function setSetting(key: string, value: string): void {
  db.insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: {
        value,
        updatedAt: new Date().toISOString(),
      },
    })
    .run();
}

/**
 * Get all settings as a key-value record.
 */
export function getAllSettings(): Record<string, string> {
  const rows = db.select().from(appSettings).all();
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

export interface WorkHours {
  start: number;
  end: number;
}

/**
 * Get work hours settings. Returns {start, end} as numbers.
 * Falls back to defaults (9, 18) if not set.
 */
export function getWorkHours(): WorkHours {
  const startStr = getSetting('work_hours_start');
  const endStr = getSetting('work_hours_end');

  return {
    start: startStr !== null ? parseInt(startStr, 10) : 9,
    end: endStr !== null ? parseInt(endStr, 10) : 18,
  };
}

/**
 * Set work hours. Updates both start and end in the database.
 */
export function setWorkHours(start: number, end: number): void {
  setSetting('work_hours_start', String(start));
  setSetting('work_hours_end', String(end));
}
