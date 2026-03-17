import { db } from '@/lib/db';
import { portals } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { fetchAllTasks, upsertTask, getPortalDomain, isTaskRelevantToUsers } from './tasks';
import { syncComments } from './comments';
import { syncChecklist } from './checklist';
import { syncFiles } from './files';
import { fetchStages } from './stages';
import { getMappedBitrixUserIds } from '@/lib/portals/mappings';

/**
 * Full synchronization of tasks from a Bitrix24 portal.
 *
 * Steps:
 * 1. Fetch stages (both "My Plan" and project-specific if applicable)
 * 2. Fetch all tasks with pagination (50 per page)
 * 3. Upsert each task into SQLite
 * 4. For each task, sync comments, checklist items, and files
 * 5. Update portal's last_sync_at
 */
export async function fullSync(portalId: number): Promise<{
  tasksCount: number;
  errors: string[];
}> {
  const errors: string[] = [];
  const domain = getPortalDomain(portalId);

  if (!domain) {
    throw new Error(`Portal ${portalId} not found`);
  }

  console.log(`[sync] Starting full sync for portal ${portalId} (${domain})`);

  // Step 1: Sync stages
  try {
    await fetchStages(portalId, 0);
  } catch (error) {
    const msg = `Failed to sync stages: ${error instanceof Error ? error.message : String(error)}`;
    console.error(`[sync] ${msg}`);
    errors.push(msg);
  }

  // Step 2: Fetch all tasks with pagination
  const bitrixTasks = await fetchAllTasks(portalId);
  console.log(`[sync] Fetched ${bitrixTasks.length} total tasks from portal ${portalId}`);

  // Step 2.5: Filter tasks by mapped users
  const mappedUserIds = getMappedBitrixUserIds(portalId);
  const relevantTasks = bitrixTasks.filter(t => isTaskRelevantToUsers(t, mappedUserIds));
  console.log(`[sync] Filtered to ${relevantTasks.length} relevant tasks (${bitrixTasks.length - relevantTasks.length} skipped)`);

  // Step 3 & 4: Upsert each task and sync related data
  let tasksCount = 0;
  for (const bitrixTask of relevantTasks) {
    try {
      const localTaskId = upsertTask(bitrixTask, portalId, domain);
      const bitrixTaskId = parseInt(String(bitrixTask.ID), 10);
      tasksCount++;

      // Sync comments, checklist, and files for each task
      // We do these sequentially to avoid rate limiting
      try {
        await syncComments(portalId, bitrixTaskId, localTaskId);
      } catch (error) {
        const msg = `Failed to sync comments for task ${bitrixTaskId}: ${error instanceof Error ? error.message : String(error)}`;
        console.error(`[sync] ${msg}`);
        errors.push(msg);
      }

      try {
        await syncChecklist(portalId, bitrixTaskId, localTaskId);
      } catch (error) {
        const msg = `Failed to sync checklist for task ${bitrixTaskId}: ${error instanceof Error ? error.message : String(error)}`;
        console.error(`[sync] ${msg}`);
        errors.push(msg);
      }

      try {
        await syncFiles(portalId, bitrixTaskId, localTaskId);
      } catch (error) {
        const msg = `Failed to sync files for task ${bitrixTaskId}: ${error instanceof Error ? error.message : String(error)}`;
        console.error(`[sync] ${msg}`);
        errors.push(msg);
      }
    } catch (error) {
      const msg = `Failed to sync task ${bitrixTask.ID}: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`[sync] ${msg}`);
      errors.push(msg);
    }
  }

  // Step 5: Update last_sync_at
  const now = new Date().toISOString();
  db.update(portals)
    .set({ lastSyncAt: now, updatedAt: now })
    .where(eq(portals.id, portalId))
    .run();

  console.log(`[sync] Full sync completed for portal ${portalId}: ${tasksCount} tasks synced, ${errors.length} errors`);

  return { tasksCount, errors };
}

/**
 * Sync a single task from Bitrix24 (for webhook/incremental updates).
 */
export async function syncSingleTask(
  portalId: number,
  bitrixTaskId: number
): Promise<number | null> {
  const domain = getPortalDomain(portalId);
  if (!domain) return null;

  const { fetchSingleTask } = await import('./tasks');
  const bitrixTask = await fetchSingleTask(portalId, bitrixTaskId);

  if (!bitrixTask) return null;

  const mappedUserIds = getMappedBitrixUserIds(portalId);
  if (!isTaskRelevantToUsers(bitrixTask, mappedUserIds)) {
    console.log(`[sync] Task ${bitrixTaskId} not relevant to mapped users, skipping`);
    return null;
  }

  const localTaskId = upsertTask(bitrixTask, portalId, domain);

  // Sync related data
  await syncComments(portalId, bitrixTaskId, localTaskId);
  await syncChecklist(portalId, bitrixTaskId, localTaskId);
  await syncFiles(portalId, bitrixTaskId, localTaskId);

  return localTaskId;
}
