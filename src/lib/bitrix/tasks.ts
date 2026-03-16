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
 * Map a Bitrix24 task to local DB fields.
 */
export function mapBitrixTaskToLocal(
  bitrixTask: BitrixTask,
  portalId: number,
  domain: string
) {
  const bitrixTaskId = parseInt(String(bitrixTask.ID), 10);
  const groupId = parseInt(String(bitrixTask.GROUP_ID), 10) || null;
  const responsibleId = bitrixTask.RESPONSIBLE_ID || null;

  // Handle tags: Bitrix24 returns tags as Record<string, string> or array
  let tags: string | null = null;
  if (bitrixTask.TAGS) {
    if (Array.isArray(bitrixTask.TAGS)) {
      tags = JSON.stringify(bitrixTask.TAGS);
    } else if (typeof bitrixTask.TAGS === 'object') {
      tags = JSON.stringify(Object.values(bitrixTask.TAGS));
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
    descriptionHtml: bitrixTask.DESCRIPTION_IN_BBCODE || null,
    status: mapBitrixStatus(bitrixTask.STATUS),
    priority: bitrixTask.PRIORITY || '1',
    mark: bitrixTask.MARK || null,
    responsibleId,
    responsibleName: bitrixTask.RESPONSIBLE_NAME || null,
    creatorId: bitrixTask.CREATED_BY || null,
    creatorName: bitrixTask.CREATED_BY_NAME || null,
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
    const response = await client.call<{ tasks: BitrixTask[] }>('tasks.task.list', {
      order: { ID: 'asc' },
      select: TASK_SELECT_FIELDS,
      start,
    });

    const pageTasks = response.result?.tasks || [];
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
    const response = await client.call<{ task: BitrixTask }>('tasks.task.get', {
      taskId: bitrixTaskId,
      select: TASK_SELECT_FIELDS,
    });

    return response.result?.task || null;
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
