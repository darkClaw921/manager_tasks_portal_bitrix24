import { db } from '@/lib/db';
import { taskChecklistItems } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { createBitrix24Client } from './client';
import type { BitrixChecklistItem } from '@/types';

/**
 * Convert a key to UPPER_SNAKE_CASE.
 */
function toUpperSnakeCase(str: string): string {
  if (/^[A-Z0-9_]+$/.test(str)) return str;
  return str.replace(/([A-Z])/g, '_$1').toUpperCase();
}

/**
 * Normalize keys to UPPER_SNAKE_CASE (Bitrix24 may return camelCase or UPPER_SNAKE_CASE).
 */
function normalizeKeys(obj: Record<string, unknown>): BitrixChecklistItem {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    normalized[toUpperSnakeCase(key)] = value;
  }
  return normalized as unknown as BitrixChecklistItem;
}

/**
 * Map a Bitrix24 checklist item to local DB fields.
 */
export function mapBitrixChecklistItemToLocal(
  raw: BitrixChecklistItem,
  taskId: number
) {
  const item = normalizeKeys(raw as unknown as Record<string, unknown>);
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

    const result = response.result;
    // Bitrix24 may return object instead of array
    if (result && !Array.isArray(result) && typeof result === 'object') {
      return Object.values(result) as BitrixChecklistItem[];
    }
    return (result as BitrixChecklistItem[]) || [];
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
 * Find the root checklist ID for a task.
 * Returns the ID of the first root checklist (PARENT_ID=0), or null if none exists.
 */
async function findRootChecklistId(
  portalId: number,
  bitrixTaskId: number
): Promise<number | null> {
  const items = await fetchChecklist(portalId, bitrixTaskId);

  for (const raw of items) {
    const item = normalizeKeys(raw as unknown as Record<string, unknown>);
    const parentId = parseInt(String(item.PARENT_ID), 10);
    if (parentId === 0 || isNaN(parentId)) {
      return parseInt(String(item.ID), 10);
    }
  }

  return null;
}

/**
 * Add a checklist item to a task on Bitrix24.
 * Finds or creates a root checklist, then adds the item under it.
 * Returns the new item ID.
 */
export async function addChecklistItem(
  portalId: number,
  bitrixTaskId: number,
  title: string
): Promise<number> {
  const client = createBitrix24Client(portalId);

  // Find existing root checklist
  let parentId = await findRootChecklistId(portalId, bitrixTaskId);

  // If no root checklist exists, create one first
  if (!parentId) {
    const createResponse = await client.call<number>('task.checklistitem.add', {
      TASKID: bitrixTaskId,
      FIELDS: { TITLE: 'Чек-лист', PARENT_ID: 0 },
    });
    parentId = createResponse.result;
  }

  // Add the actual item under the root checklist
  const response = await client.call<number>('task.checklistitem.add', {
    TASKID: bitrixTaskId,
    FIELDS: { TITLE: title, PARENT_ID: parentId },
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
