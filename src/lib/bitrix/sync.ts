import { db } from '@/lib/db';
import { portals, taskChecklistItems, taskFiles } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { createBitrix24Client } from './client';
import { fetchAllTasks, upsertTask, getPortalDomain, isTaskRelevantToUsers } from './tasks';
import { syncComments } from './comments';
import { syncChecklist } from './checklist';
import { syncFiles } from './files';
import { mapBitrixChecklistItemToLocal } from './checklist';
import { mapBitrixFileToLocal, fetchFilesByDiskIds } from './files';
import { fetchStages } from './stages';
import { getMappedBitrixUserIds } from '@/lib/portals/mappings';
import type { BitrixChecklistItem, BitrixTask } from '@/types';

interface TaskEntry {
  bitrixTaskId: number;
  localTaskId: number;
  bitrixTask: BitrixTask;
}

/**
 * Run async tasks with concurrency limit.
 */
async function parallelLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  const executing = new Set<Promise<void>>();
  for (const item of items) {
    const p = fn(item).then(
      () => { executing.delete(p); },
      () => { executing.delete(p); }
    );
    executing.add(p);
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
}

/**
 * Batch sync checklists for multiple tasks using Bitrix24 batch API.
 * Fetches checklists for up to 50 tasks per batch call.
 */
async function batchSyncChecklists(
  portalId: number,
  entries: TaskEntry[]
): Promise<string[]> {
  if (entries.length === 0) return [];
  const errors: string[] = [];
  const client = createBitrix24Client(portalId);

  for (let i = 0; i < entries.length; i += 50) {
    const batch = entries.slice(i, i + 50);
    const commands: Record<string, { method: string; params: Record<string, unknown> }> = {};

    for (const { bitrixTaskId } of batch) {
      commands[`cl_${bitrixTaskId}`] = {
        method: 'task.checklistitem.getlist',
        params: { TASKID: bitrixTaskId },
      };
    }

    try {
      const batchResult = await client.callBatch(commands);
      const innerResults = (batchResult as Record<string, unknown>).result || batchResult;

      for (const { bitrixTaskId, localTaskId } of batch) {
        try {
          const raw = (innerResults as Record<string, unknown>)[`cl_${bitrixTaskId}`];
          let items: BitrixChecklistItem[];
          if (raw && !Array.isArray(raw) && typeof raw === 'object') {
            items = Object.values(raw) as BitrixChecklistItem[];
          } else {
            items = (raw as BitrixChecklistItem[]) || [];
          }
          upsertChecklistItems(localTaskId, items);
        } catch (error) {
          errors.push(`Checklist for task ${bitrixTaskId}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } catch (error) {
      console.error(`[sync] Batch checklist fetch failed, falling back to individual:`, error instanceof Error ? error.message : error);
      for (const { bitrixTaskId, localTaskId } of batch) {
        try {
          await syncChecklist(portalId, bitrixTaskId, localTaskId);
        } catch (e) {
          errors.push(`Checklist for task ${bitrixTaskId}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
  }

  console.log(`[sync] Checklists synced for ${entries.length} tasks via batch`);
  return errors;
}

/**
 * Upsert checklist items for a task from batch results.
 */
function upsertChecklistItems(localTaskId: number, items: BitrixChecklistItem[]): void {
  const now = new Date().toISOString();

  const existingItems = db
    .select()
    .from(taskChecklistItems)
    .where(eq(taskChecklistItems.taskId, localTaskId))
    .all();

  const existingByBitrixId = new Map(
    existingItems
      .filter((i) => i.bitrixItemId !== null)
      .map((i) => [i.bitrixItemId!, i])
  );

  const processedBitrixIds = new Set<number>();

  for (const item of items) {
    const mapped = mapBitrixChecklistItemToLocal(item, localTaskId);
    processedBitrixIds.add(mapped.bitrixItemId!);

    const existing = existingByBitrixId.get(mapped.bitrixItemId!);
    if (existing) {
      db.update(taskChecklistItems)
        .set({ title: mapped.title, sortIndex: mapped.sortIndex, isComplete: mapped.isComplete })
        .where(eq(taskChecklistItems.id, existing.id))
        .run();
    } else {
      db.insert(taskChecklistItems)
        .values({ ...mapped, createdAt: now })
        .run();
    }
  }

  for (const existing of existingItems) {
    if (existing.bitrixItemId && !processedBitrixIds.has(existing.bitrixItemId)) {
      db.delete(taskChecklistItems).where(eq(taskChecklistItems.id, existing.id)).run();
    }
  }
}

/**
 * Batch sync files for multiple tasks.
 * Extracts file IDs from already-fetched task data (UF_TASK_WEBDAV_FILES),
 * then batch-fetches file details via disk.file.get.
 */
async function batchSyncFiles(
  portalId: number,
  entries: TaskEntry[],
  domain: string
): Promise<string[]> {
  if (entries.length === 0) return [];
  const errors: string[] = [];

  // Step 1: Extract file IDs from already-fetched task data
  const taskFileMap = new Map<number, { localTaskId: number; fileIds: number[] }>();
  const allFileIds: number[] = [];

  for (const { bitrixTaskId, localTaskId, bitrixTask } of entries) {
    const raw = bitrixTask as unknown as Record<string, unknown>;
    const webdavFiles = raw.UF_TASK_WEBDAV_FILES ?? raw.ufTaskWebdavFiles;

    if (webdavFiles && Array.isArray(webdavFiles) && webdavFiles.length > 0) {
      const fileIds = webdavFiles
        .map((f: unknown) => {
          const s = String(f);
          const cleaned = s.startsWith('n') ? s.slice(1) : s;
          return parseInt(cleaned, 10);
        })
        .filter((id: number) => !isNaN(id) && id > 0);

      if (fileIds.length > 0) {
        taskFileMap.set(bitrixTaskId, { localTaskId, fileIds });
        allFileIds.push(...fileIds);
      }
    }
  }

  // Step 2: Batch fetch all file details at once
  if (allFileIds.length > 0) {
    try {
      const allFiles = await fetchFilesByDiskIds(portalId, allFileIds);

      // Index files by ID for quick lookup
      const fileById = new Map<number, (typeof allFiles)[0]>();
      for (const f of allFiles) {
        const normalized = f as unknown as Record<string, unknown>;
        const id = parseInt(String(normalized.ID || normalized.id), 10);
        if (!isNaN(id)) fileById.set(id, f);
      }

      // Step 3: Upsert files per task
      const now = new Date().toISOString();
      for (const [bitrixTaskId, { localTaskId, fileIds }] of taskFileMap) {
        try {
          db.delete(taskFiles).where(eq(taskFiles.taskId, localTaskId)).run();
          for (const fileId of fileIds) {
            const file = fileById.get(fileId);
            if (file) {
              const mapped = mapBitrixFileToLocal(file, localTaskId, domain);
              db.insert(taskFiles).values({ ...mapped, createdAt: now }).run();
            }
          }
        } catch (error) {
          errors.push(`Files for task ${bitrixTaskId}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } catch (error) {
      console.error(`[sync] Batch file fetch failed, falling back to individual:`, error instanceof Error ? error.message : error);
      for (const { bitrixTaskId, localTaskId } of entries) {
        try {
          await syncFiles(portalId, bitrixTaskId, localTaskId);
        } catch (e) {
          errors.push(`Files for task ${bitrixTaskId}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      return errors;
    }
  }

  // Clear files for tasks that had no file IDs
  for (const { bitrixTaskId, localTaskId } of entries) {
    if (!taskFileMap.has(bitrixTaskId)) {
      db.delete(taskFiles).where(eq(taskFiles.taskId, localTaskId)).run();
    }
  }

  console.log(`[sync] Files: ${allFileIds.length} files from ${taskFileMap.size}/${entries.length} tasks via batch`);
  return errors;
}

/**
 * Parallel sync comments with concurrency limit.
 */
async function parallelSyncComments(
  portalId: number,
  entries: TaskEntry[]
): Promise<string[]> {
  const errors: string[] = [];

  await parallelLimit(entries, 5, async ({ bitrixTaskId, localTaskId }) => {
    try {
      await syncComments(portalId, bitrixTaskId, localTaskId);
    } catch (error) {
      errors.push(`Comments for task ${bitrixTaskId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  console.log(`[sync] Comments synced for ${entries.length} tasks (parallel, limit 5)`);
  return errors;
}

/**
 * Full synchronization of tasks from a Bitrix24 portal.
 *
 * Optimized strategy:
 * 1. Fetch stages
 * 2. Fetch all tasks with pagination (50 per page)
 * 3. Filter by mapped users, upsert all tasks
 * 4. Batch sync checklists (1 batch API call per 50 tasks)
 * 5. Batch sync files (extract IDs from tasks, 1 batch API call for all file details)
 * 6. Parallel sync comments (concurrency limit 5)
 * 7. Update portal's last_sync_at
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

  // Step 2: Check user mappings — skip task sync if none exist
  const mappedUserIds = getMappedBitrixUserIds(portalId);
  if (mappedUserIds.size === 0) {
    console.log(`[sync] Portal ${portalId} has no user mappings, skipping task sync`);
    db.update(portals).set({ lastSyncAt: new Date().toISOString() }).where(eq(portals.id, portalId)).run();
    return { tasksCount: 0, errors };
  }

  // Step 3: Fetch all tasks with pagination
  const bitrixTasks = await fetchAllTasks(portalId);
  console.log(`[sync] Fetched ${bitrixTasks.length} total tasks from portal ${portalId}`);

  // Step 4: Filter tasks by mapped users
  const relevantTasks = bitrixTasks.filter(t => isTaskRelevantToUsers(t, mappedUserIds));
  console.log(`[sync] Filtered to ${relevantTasks.length} relevant tasks (${bitrixTasks.length - relevantTasks.length} skipped)`);

  // Step 4: Upsert all tasks and collect entries
  const taskEntries: TaskEntry[] = [];
  for (const bitrixTask of relevantTasks) {
    try {
      const localTaskId = upsertTask(bitrixTask, portalId, domain);
      const bitrixTaskId = parseInt(String(bitrixTask.ID), 10);
      taskEntries.push({ bitrixTaskId, localTaskId, bitrixTask });
    } catch (error) {
      const msg = `Failed to sync task ${bitrixTask.ID}: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`[sync] ${msg}`);
      errors.push(msg);
    }
  }

  // Step 5: Batch checklists + batch files + parallel comments — all at once
  const [checklistErrors, fileErrors, commentErrors] = await Promise.all([
    batchSyncChecklists(portalId, taskEntries),
    batchSyncFiles(portalId, taskEntries, domain),
    parallelSyncComments(portalId, taskEntries),
  ]);
  errors.push(...checklistErrors, ...fileErrors, ...commentErrors);

  // Step 6: Update last_sync_at
  const now = new Date().toISOString();
  db.update(portals)
    .set({ lastSyncAt: now, updatedAt: now })
    .where(eq(portals.id, portalId))
    .run();

  console.log(`[sync] Full sync completed for portal ${portalId}: ${taskEntries.length} tasks synced, ${errors.length} errors`);

  return { tasksCount: taskEntries.length, errors };
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

  // Sync related data in parallel
  await Promise.all([
    syncComments(portalId, bitrixTaskId, localTaskId),
    syncChecklist(portalId, bitrixTaskId, localTaskId),
    syncFiles(portalId, bitrixTaskId, localTaskId),
  ]);

  return localTaskId;
}
