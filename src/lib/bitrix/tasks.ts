import { db } from '@/lib/db';
import { tasks, portals } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { createBitrix24Client } from './client';
import type { BitrixTask } from '@/types';

/**
 * Select fields for tasks.task.list / tasks.task.get
 */
export const TASK_SELECT_FIELDS = [
  'ID',
  'TITLE',
  'DESCRIPTION',
  'STATUS',
  'PRIORITY',
  'MARK',
  'RESPONSIBLE_ID',
  'RESPONSIBLE_NAME',
  'CREATED_BY',
  'CREATED_BY_NAME',
  'GROUP_ID',
  'STAGE_ID',
  'DEADLINE',
  'START_DATE_PLAN',
  'END_DATE_PLAN',
  'CREATED_DATE',
  'CHANGED_DATE',
  'CLOSED_DATE',
  'TIME_ESTIMATE',
  'TIME_SPENT_IN_LOGS',
  'TAGS',
  'ACCOMPLICES',
  'AUDITORS',
  'UF_TASK_WEBDAV_FILES',
];

/**
 * Map Bitrix24 status code to internal status string.
 * Bitrix24 statuses: 1=NEW, 2=PENDING, 3=IN_PROGRESS, 4=SUPPOSEDLY_COMPLETED, 5=COMPLETED, 6=DEFERRED
 */
export function mapBitrixStatus(status: string): string {
  const statusMap: Record<string, string> = {
    '1': 'NEW',
    '2': 'PENDING',
    '3': 'IN_PROGRESS',
    '4': 'SUPPOSEDLY_COMPLETED',
    '5': 'COMPLETED',
    '6': 'DEFERRED',
  };
  return statusMap[status] || status;
}

/**
 * Map internal status string back to Bitrix24 status code.
 */
export function mapStatusToBitrix(status: string): string {
  const statusMap: Record<string, string> = {
    'NEW': '1',
    'PENDING': '2',
    'IN_PROGRESS': '3',
    'SUPPOSEDLY_COMPLETED': '4',
    'COMPLETED': '5',
    'DEFERRED': '6',
  };
  return statusMap[status] || status;
}

/**
 * Generate Bitrix24 direct URL for a task.
 */
export function generateBitrixUrl(
  domain: string,
  bitrixTaskId: number,
  groupId: number | null,
  responsibleId: string | null
): string {
  if (groupId && groupId > 0) {
    return `https://${domain}/workgroups/group/${groupId}/tasks/task/view/${bitrixTaskId}/`;
  }
  const userId = responsibleId || '0';
  return `https://${domain}/company/personal/user/${userId}/tasks/task/view/${bitrixTaskId}/`;
}

/**
 * Convert a key to UPPER_SNAKE_CASE.
 * Handles both camelCase (responsibleId → RESPONSIBLE_ID)
 * and already UPPER_SNAKE_CASE (RESPONSIBLE_ID stays RESPONSIBLE_ID).
 */
function toUpperSnakeCase(str: string): string {
  // Already UPPER_SNAKE_CASE or simple uppercase — keep as-is
  if (/^[A-Z0-9_]+$/.test(str)) return str;
  // Convert camelCase to UPPER_SNAKE_CASE
  return str.replace(/([A-Z])/g, '_$1').toUpperCase();
}

/**
 * Normalize Bitrix24 task keys to UPPER_SNAKE_CASE.
 * Bitrix24 API returns camelCase (responsibleId) or UPPER_SNAKE_CASE (RESPONSIBLE_ID).
 */
function normalizeTaskKeys(task: Record<string, unknown>): BitrixTask {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(task)) {
    normalized[toUpperSnakeCase(key)] = value;
  }
  return normalized as unknown as BitrixTask;
}

/**
 * Extract a name from a Bitrix24 sub-object (e.g. responsible, creator).
 * Bitrix24 returns: { id, name, link, icon, workPosition }
 */
function extractSubName(obj: unknown): string | null {
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  const name = o.NAME || o.name;
  if (name && typeof name === 'string') return name;
  const first = o.FIRST_NAME || o.firstName || '';
  const last = o.LAST_NAME || o.lastName || '';
  if (first || last) return `${first} ${last}`.trim() || null;
  return null;
}

/**
 * Extract a photo URL from a Bitrix24 sub-object.
 */
function extractSubIcon(obj: unknown): string | null {
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  const icon = o.ICON || o.icon;
  if (icon && typeof icon === 'string' && icon.startsWith('http')) return icon;
  return null;
}

/**
 * Map a Bitrix24 task to local DB fields.
 */
export function mapBitrixTaskToLocal(
  bitrixTask: BitrixTask,
  portalId: number,
  domain: string
) {
  // Access raw normalized data for sub-object lookups
  const raw = bitrixTask as unknown as Record<string, unknown>;

  const bitrixTaskId = parseInt(String(bitrixTask.ID), 10);
  const groupId = parseInt(String(bitrixTask.GROUP_ID), 10) || null;
  const responsibleId = bitrixTask.RESPONSIBLE_ID || null;

  // Handle tags: Bitrix24 returns tags as string[], {id,title}[], or Record<string, string>
  let tags: string | null = null;
  if (bitrixTask.TAGS) {
    let tagArray: unknown[];
    if (Array.isArray(bitrixTask.TAGS)) {
      tagArray = bitrixTask.TAGS;
    } else if (typeof bitrixTask.TAGS === 'object') {
      tagArray = Object.values(bitrixTask.TAGS);
    } else {
      tagArray = [];
    }
    // Normalize: extract title from objects, keep strings as-is
    const normalized = tagArray.map((t) =>
      typeof t === 'object' && t !== null && 'title' in (t as Record<string, unknown>)
        ? (t as { title: string }).title
        : String(t)
    );
    if (normalized.length > 0) {
      tags = JSON.stringify(normalized);
    }
  }

  // Handle accomplices and auditors
  const accomplices = bitrixTask.ACCOMPLICES
    ? JSON.stringify(Array.isArray(bitrixTask.ACCOMPLICES) ? bitrixTask.ACCOMPLICES : [])
    : null;
  const auditors = bitrixTask.AUDITORS
    ? JSON.stringify(Array.isArray(bitrixTask.AUDITORS) ? bitrixTask.AUDITORS : [])
    : null;

  return {
    portalId,
    bitrixTaskId,
    title: bitrixTask.TITLE || 'Untitled',
    description: bitrixTask.DESCRIPTION || null,
    descriptionHtml: bitrixTask.DESCRIPTION || null,
    status: mapBitrixStatus(bitrixTask.STATUS),
    priority: bitrixTask.PRIORITY || '1',
    mark: bitrixTask.MARK || null,
    responsibleId,
    responsibleName: bitrixTask.RESPONSIBLE_NAME
      || extractSubName(raw.RESPONSIBLE)
      || null,
    responsiblePhoto: extractSubIcon(raw.RESPONSIBLE) || null,
    creatorId: bitrixTask.CREATED_BY || null,
    creatorName: bitrixTask.CREATED_BY_NAME
      || extractSubName(raw.CREATOR)
      || null,
    creatorPhoto: extractSubIcon(raw.CREATOR) || null,
    groupId,
    stageId: parseInt(String(bitrixTask.STAGE_ID), 10) || null,
    deadline: bitrixTask.DEADLINE || null,
    startDatePlan: bitrixTask.START_DATE_PLAN || null,
    endDatePlan: bitrixTask.END_DATE_PLAN || null,
    createdDate: bitrixTask.CREATED_DATE || null,
    changedDate: bitrixTask.CHANGED_DATE || null,
    closedDate: bitrixTask.CLOSED_DATE || null,
    timeEstimate: parseInt(String(bitrixTask.TIME_ESTIMATE), 10) || null,
    timeSpent: parseInt(String(bitrixTask.TIME_SPENT_IN_LOGS), 10) || null,
    tags,
    accomplices,
    auditors,
    bitrixUrl: generateBitrixUrl(domain, bitrixTaskId, groupId, responsibleId),
  };
}

/**
 * Check whether a Bitrix24 task is relevant to the given set of mapped user IDs.
 * A task is relevant if any of its roles (responsible, creator, accomplice, auditor)
 * belong to the mapped users.
 *
 * If mappedUserIds is empty (no mappings configured), returns true — no filtering applied.
 */
export function isTaskRelevantToUsers(
  task: BitrixTask,
  mappedUserIds: Set<string>
): boolean {
  if (mappedUserIds.size === 0) return true;

  if (task.RESPONSIBLE_ID && mappedUserIds.has(String(task.RESPONSIBLE_ID))) return true;
  if (task.CREATED_BY && mappedUserIds.has(String(task.CREATED_BY))) return true;

  if (Array.isArray(task.ACCOMPLICES)) {
    for (const id of task.ACCOMPLICES) {
      if (mappedUserIds.has(String(id))) return true;
    }
  }

  if (Array.isArray(task.AUDITORS)) {
    for (const id of task.AUDITORS) {
      if (mappedUserIds.has(String(id))) return true;
    }
  }

  return false;
}

/**
 * Upsert a task in the local database.
 * Returns the local task ID.
 */
export function upsertTask(
  bitrixTask: BitrixTask,
  portalId: number,
  domain: string
): number {
  const mapped = mapBitrixTaskToLocal(bitrixTask, portalId, domain);
  const now = new Date().toISOString();

  // Check if task already exists
  const existing = db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.portalId, portalId),
        eq(tasks.bitrixTaskId, mapped.bitrixTaskId)
      )
    )
    .get();

  if (existing) {
    db.update(tasks)
      .set({ ...mapped, updatedAt: now })
      .where(eq(tasks.id, existing.id))
      .run();
    return existing.id;
  } else {
    const result = db
      .insert(tasks)
      .values({ ...mapped, createdAt: now, updatedAt: now })
      .run();
    return Number(result.lastInsertRowid);
  }
}

/**
 * Fetch all tasks from a Bitrix24 portal with pagination.
 * Returns array of BitrixTask objects.
 */
export async function fetchAllTasks(portalId: number): Promise<BitrixTask[]> {
  const client = createBitrix24Client(portalId);
  const allTasks: BitrixTask[] = [];
  let start = 0;
  const pageSize = 50;

  while (true) {
    const response = await client.call<{ tasks?: BitrixTask[]; items?: BitrixTask[] }>('tasks.task.list', {
      order: { ID: 'asc' },
      select: TASK_SELECT_FIELDS,
      start,
    });

    // Bitrix24 returns result.tasks (old format) or result.items (new format)
    const rawTasks = response.result?.tasks || response.result?.items || [];

    // Log first task keys to debug field mapping
    if (start === 0 && rawTasks.length > 0) {
      const firstRaw = rawTasks[0] as unknown as Record<string, unknown>;
      console.log(`[tasks] First task raw keys for portal ${portalId}:`, Object.keys(firstRaw).join(', '));
      console.log(`[tasks] First task responsibleId/Name:`, firstRaw.responsibleId ?? firstRaw.RESPONSIBLE_ID ?? 'MISSING', '/', firstRaw.responsibleName ?? firstRaw.RESPONSIBLE_NAME ?? firstRaw.responsible ?? 'MISSING');
      console.log(`[tasks] First task createdBy/Name:`, firstRaw.createdBy ?? firstRaw.CREATED_BY ?? 'MISSING', '/', firstRaw.createdByName ?? firstRaw.CREATED_BY_NAME ?? firstRaw.creator ?? 'MISSING');
    }

    const pageTasks = rawTasks.map((t) => normalizeTaskKeys(t as unknown as Record<string, unknown>));
    allTasks.push(...pageTasks);

    console.log(`[tasks] Fetched ${pageTasks.length} tasks (offset ${start}) for portal ${portalId}`);

    // Check if there are more pages
    if (pageTasks.length < pageSize || !response.next) {
      break;
    }

    start = response.next;
  }

  return allTasks;
}

/**
 * Fetch a single task from Bitrix24.
 */
export async function fetchSingleTask(
  portalId: number,
  bitrixTaskId: number
): Promise<BitrixTask | null> {
  const client = createBitrix24Client(portalId);

  try {
    const response = await client.call<{ task?: BitrixTask; item?: BitrixTask }>('tasks.task.get', {
      taskId: bitrixTaskId,
      select: TASK_SELECT_FIELDS,
    });

    // Bitrix24 returns result.task (old format) or result.item (new format)
    const raw = response.result?.task || response.result?.item;
    return raw ? normalizeTaskKeys(raw as unknown as Record<string, unknown>) : null;
  } catch (error) {
    console.error(`[tasks] Failed to fetch task ${bitrixTaskId} from portal ${portalId}:`, error);
    return null;
  }
}

/**
 * Get portal domain by ID.
 */
export function getPortalDomain(portalId: number): string {
  const portal = db
    .select({ domain: portals.domain })
    .from(portals)
    .where(eq(portals.id, portalId))
    .get();
  return portal?.domain || '';
}
