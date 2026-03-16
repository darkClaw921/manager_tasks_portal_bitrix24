import { db } from '@/lib/db';
import { taskChecklistItems } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { createBitrix24Client } from './client';
import type { BitrixChecklistItem } from '@/types';

/**
 * Map a Bitrix24 checklist item to local DB fields.
 */
export function mapBitrixChecklistItemToLocal(
  item: BitrixChecklistItem,
  taskId: number
) {
  return {
    taskId,
    bitrixItemId: parseInt(String(item.ID), 10),
    title: item.TITLE || '',
    sortIndex: parseInt(String(item.SORT_INDEX), 10) || 0,
    isComplete: item.IS_COMPLETE === 'Y' || item.IS_COMPLETE === '1',
  };
}

/**
 * Fetch checklist items for a task from Bitrix24.
 */
export async function fetchChecklist(
  portalId: number,
  bitrixTaskId: number
): Promise<BitrixChecklistItem[]> {
  const client = createBitrix24Client(portalId);

  try {
    const response = await client.call<BitrixChecklistItem[]>(
      'task.checklistitem.getlist',
      {
        TASKID: bitrixTaskId,
        ORDER: { SORT_INDEX: 'ASC' },
      }
    );

    return response.result || [];
  } catch (error) {
    console.error(
      `[checklist] Failed to fetch checklist for task ${bitrixTaskId}, portal ${portalId}:`,
      error
    );
    return [];
  }
}

/**
 * Sync checklist items for a task: fetch from Bitrix24 and upsert into local DB.
 */
export async function syncChecklist(
  portalId: number,
  bitrixTaskId: number,
  localTaskId: number
): Promise<void> {
  const items = await fetchChecklist(portalId, bitrixTaskId);

  const now = new Date().toISOString();

  // Get existing local checklist items for this task
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
        .set({
          title: mapped.title,
          sortIndex: mapped.sortIndex,
          isComplete: mapped.isComplete,
        })
        .where(eq(taskChecklistItems.id, existing.id))
        .run();
    } else {
      db.insert(taskChecklistItems)
        .values({ ...mapped, createdAt: now })
        .run();
    }
  }

  // Delete local items that no longer exist on Bitrix24
  for (const existing of existingItems) {
    if (existing.bitrixItemId && !processedBitrixIds.has(existing.bitrixItemId)) {
      db.delete(taskChecklistItems)
        .where(eq(taskChecklistItems.id, existing.id))
        .run();
    }
  }
}

/**
 * Add a checklist item to a task on Bitrix24.
 * Returns the new item ID.
 */
export async function addChecklistItem(
  portalId: number,
  bitrixTaskId: number,
  title: string
): Promise<number> {
  const client = createBitrix24Client(portalId);

  const response = await client.call<number>('task.checklistitem.add', {
    TASKID: bitrixTaskId,
    FIELDS: { TITLE: title },
  });

  return response.result;
}

/**
 * Toggle a checklist item complete/incomplete on Bitrix24.
 */
export async function toggleChecklistItem(
  portalId: number,
  bitrixTaskId: number,
  bitrixItemId: number,
  complete: boolean
): Promise<void> {
  const client = createBitrix24Client(portalId);
  const method = complete
    ? 'task.checklistitem.complete'
    : 'task.checklistitem.renew';

  await client.call(method, {
    TASKID: bitrixTaskId,
    ITEMID: bitrixItemId,
  });
}

/**
 * Delete a checklist item from a task on Bitrix24.
 */
export async function deleteChecklistItem(
  portalId: number,
  bitrixTaskId: number,
  bitrixItemId: number
): Promise<void> {
  const client = createBitrix24Client(portalId);

  await client.call('task.checklistitem.delete', {
    TASKID: bitrixTaskId,
    ITEMID: bitrixItemId,
  });
}
