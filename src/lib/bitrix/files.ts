import { db } from '@/lib/db';
import { taskFiles, portals } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { createBitrix24Client } from './client';
import type { BitrixFile } from '@/types';

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
function normalizeKeys(obj: Record<string, unknown>): BitrixFile {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    normalized[toUpperSnakeCase(key)] = value;
  }
  return normalized as unknown as BitrixFile;
}

/**
 * Get the portal domain for constructing absolute URLs.
 */
function getPortalDomain(portalId: number): string {
  const portal = db
    .select({ domain: portals.domain })
    .from(portals)
    .where(eq(portals.id, portalId))
    .get();
  return portal?.domain || '';
}

/**
 * Make a download URL absolute by prepending portal domain if needed.
 */
function makeAbsoluteUrl(url: string | null, domain: string): string | null {
  if (!url) return null;
  // Already absolute
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  // Relative URL — prepend portal domain
  if (domain) {
    const cleanDomain = domain.replace(/\/$/, '');
    const prefix = cleanDomain.startsWith('http') ? cleanDomain : `https://${cleanDomain}`;
    return `${prefix}${url.startsWith('/') ? '' : '/'}${url}`;
  }
  return url;
}

/**
 * Map a Bitrix24 file to local DB fields.
 */
export function mapBitrixFileToLocal(
  raw: BitrixFile,
  taskId: number,
  portalDomain: string = ''
) {
  const file = normalizeKeys(raw as unknown as Record<string, unknown>);
  const bitrixFileId = parseInt(String(file.ID), 10);

  return {
    taskId,
    bitrixFileId: isNaN(bitrixFileId) ? null : bitrixFileId,
    name: file.NAME || 'unknown',
    size: parseInt(String(file.SIZE), 10) || null,
    downloadUrl: makeAbsoluteUrl(file.DOWNLOAD_URL || null, portalDomain),
    contentType: file.CONTENT_TYPE || null,
  };
}

/**
 * Fetch file details from Bitrix24 Disk by file IDs.
 * Uses batch API to fetch up to 50 files at once.
 */
export async function fetchFilesByDiskIds(
  portalId: number,
  fileIds: number[]
): Promise<BitrixFile[]> {
  if (fileIds.length === 0) return [];

  const client = createBitrix24Client(portalId);
  const files: BitrixFile[] = [];

  // Process in batches of 50 (Bitrix24 batch limit)
  for (let i = 0; i < fileIds.length; i += 50) {
    const batch = fileIds.slice(i, i + 50);
    const commands: Record<string, { method: string; params: Record<string, unknown> }> = {};

    for (const fileId of batch) {
      commands[`file_${fileId}`] = {
        method: 'disk.file.get',
        params: { id: fileId },
      };
    }

    try {
      const batchResult = await client.callBatch(commands);
      // batchResult = { result: { file_X: {...} }, result_error: {...}, ... }
      const resultData = (batchResult as Record<string, unknown>).result || batchResult;

      for (const fileId of batch) {
        const fileData = (resultData as Record<string, unknown>)?.[`file_${fileId}`] as Record<string, unknown> | undefined;
        if (fileData && (fileData.ID || fileData.id)) {
          files.push(normalizeKeys(fileData));
        }
      }
    } catch (error) {
      console.error(`[files] Batch disk.file.get failed for portal ${portalId}:`, error instanceof Error ? error.message : error);
      // Fallback: fetch one by one
      for (const fileId of batch) {
        try {
          const response = await client.call<Record<string, unknown>>('disk.file.get', { id: fileId });
          if (response.result && (response.result.ID || response.result.id)) {
            files.push(normalizeKeys(response.result));
          }
        } catch {
          // Skip individual file errors
        }
      }
    }
  }

  return files;
}

/**
 * Fetch files for a task from Bitrix24.
 *
 * Strategy:
 * 1. Get file IDs from UF_TASK_WEBDAV_FILES via tasks.task.get
 * 2. Fetch file details via disk.file.get (batch)
 * 3. Fallback to deprecated task.item.getfiles if needed
 */
export async function fetchFiles(
  portalId: number,
  bitrixTaskId: number
): Promise<BitrixFile[]> {
  const client = createBitrix24Client(portalId);

  try {
    // Get file IDs from task's UF_TASK_WEBDAV_FILES field
    const taskResponse = await client.call<{ task?: Record<string, unknown>; item?: Record<string, unknown> }>('tasks.task.get', {
      taskId: bitrixTaskId,
      select: ['ID', 'UF_TASK_WEBDAV_FILES'],
    });

    const task = taskResponse.result?.task || taskResponse.result?.item;
    // Bitrix24 may return camelCase (ufTaskWebdavFiles) or UPPER_SNAKE_CASE (UF_TASK_WEBDAV_FILES)
    const webdavFiles = task?.UF_TASK_WEBDAV_FILES ?? task?.ufTaskWebdavFiles;

    if (webdavFiles && Array.isArray(webdavFiles) && webdavFiles.length > 0) {
      // Parse file IDs: can be numbers, strings, or "nXXX" format
      const fileIds = webdavFiles
        .map((f: unknown) => {
          const s = String(f);
          // Remove 'n' prefix if present (Bitrix24 disk file reference format)
          const cleaned = s.startsWith('n') ? s.slice(1) : s;
          return parseInt(cleaned, 10);
        })
        .filter((id: number) => !isNaN(id) && id > 0);

      if (fileIds.length > 0) {
        const files = await fetchFilesByDiskIds(portalId, fileIds);
        if (files.length > 0) {
          return files;
        }
      }
    }

    // Fallback: try deprecated task.item.getfiles (works on older Bitrix24)
    try {
      const response = await client.call<BitrixFile[]>('task.item.getfiles', {
        TASKID: bitrixTaskId,
      });

      const result = response.result;
      if (Array.isArray(result) && result.length > 0) return result;
      if (result && typeof result === 'object') {
        const values = Object.values(result);
        if (values.length > 0) return values as BitrixFile[];
      }
    } catch {
      // Deprecated method may not be available
    }

    return [];
  } catch (error) {
    console.error(
      `[files] Failed to fetch files for task ${bitrixTaskId}, portal ${portalId}:`,
      error instanceof Error ? error.message : error
    );
    return [];
  }
}

/**
 * Sync files for a task: fetch from Bitrix24 and replace in local DB.
 * Uses delete-then-insert strategy to avoid dedup issues with unstable file IDs.
 */
export async function syncFiles(
  portalId: number,
  bitrixTaskId: number,
  localTaskId: number
): Promise<void> {
  const files = await fetchFiles(portalId, bitrixTaskId);
  const domain = getPortalDomain(portalId);

  console.log(`[files] Syncing ${files.length} files for task ${bitrixTaskId} (local ${localTaskId})`);

  const now = new Date().toISOString();

  // Delete all existing files for this task, then re-insert fresh data.
  // This avoids dedup issues when bitrixFileId is null/NaN or changes across syncs.
  db.delete(taskFiles)
    .where(eq(taskFiles.taskId, localTaskId))
    .run();

  for (const file of files) {
    const mapped = mapBitrixFileToLocal(file, localTaskId, domain);
    db.insert(taskFiles)
      .values({ ...mapped, createdAt: now })
      .run();
  }
}
