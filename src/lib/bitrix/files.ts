import { db } from '@/lib/db';
import { taskFiles } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { createBitrix24Client } from './client';
import type { BitrixFile } from '@/types';

/**
 * Map a Bitrix24 file to local DB fields.
 */
export function mapBitrixFileToLocal(
  file: BitrixFile,
  taskId: number
) {
  return {
    taskId,
    bitrixFileId: parseInt(String(file.ID), 10),
    name: file.NAME || 'unknown',
    size: parseInt(String(file.SIZE), 10) || null,
    downloadUrl: file.DOWNLOAD_URL || null,
    contentType: file.CONTENT_TYPE || null,
  };
}

/**
 * Fetch files for a task from Bitrix24.
 */
export async function fetchFiles(
  portalId: number,
  bitrixTaskId: number
): Promise<BitrixFile[]> {
  const client = createBitrix24Client(portalId);

  try {
    const response = await client.call<BitrixFile[]>('task.item.getfiles', {
      TASKID: bitrixTaskId,
    });

    // task.item.getfiles returns result as array or object
    const result = response.result;
    if (Array.isArray(result)) {
      return result;
    }
    if (result && typeof result === 'object') {
      return Object.values(result);
    }
    return [];
  } catch (error) {
    console.error(
      `[files] Failed to fetch files for task ${bitrixTaskId}, portal ${portalId}:`,
      error
    );
    return [];
  }
}

/**
 * Sync files for a task: fetch from Bitrix24 and upsert into local DB.
 */
export async function syncFiles(
  portalId: number,
  bitrixTaskId: number,
  localTaskId: number
): Promise<void> {
  const files = await fetchFiles(portalId, bitrixTaskId);

  const now = new Date().toISOString();

  // Get existing local files for this task
  const existingFiles = db
    .select()
    .from(taskFiles)
    .where(eq(taskFiles.taskId, localTaskId))
    .all();

  const existingByBitrixId = new Map(
    existingFiles
      .filter((f) => f.bitrixFileId !== null)
      .map((f) => [f.bitrixFileId!, f])
  );

  const processedBitrixIds = new Set<number>();

  for (const file of files) {
    const mapped = mapBitrixFileToLocal(file, localTaskId);
    processedBitrixIds.add(mapped.bitrixFileId!);

    const existing = existingByBitrixId.get(mapped.bitrixFileId!);

    if (existing) {
      db.update(taskFiles)
        .set({
          name: mapped.name,
          size: mapped.size,
          downloadUrl: mapped.downloadUrl,
          contentType: mapped.contentType,
        })
        .where(eq(taskFiles.id, existing.id))
        .run();
    } else {
      db.insert(taskFiles)
        .values({ ...mapped, createdAt: now })
        .run();
    }
  }

  // Delete local files that no longer exist on Bitrix24
  for (const existing of existingFiles) {
    if (existing.bitrixFileId && !processedBitrixIds.has(existing.bitrixFileId)) {
      db.delete(taskFiles)
        .where(eq(taskFiles.id, existing.id))
        .run();
    }
  }
}
