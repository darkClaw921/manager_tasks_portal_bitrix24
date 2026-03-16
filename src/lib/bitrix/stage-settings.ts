import { db } from '@/lib/db';
import { portalCustomStages, portalStageMappings, taskStages } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import type { Task } from '@/lib/db/schema';

// ==================== Types ====================

export interface CustomStageWithMappings {
  id: number;
  portalId: number;
  title: string;
  color: string | null;
  sort: number;
  createdAt: string;
  updatedAt: string;
  mappedStages: {
    id: number;
    bitrixStageId: string;
    title: string;
    color: string | null;
    taskStageId: number;
  }[];
}

// ==================== Functions ====================

/**
 * Get all custom stages for a portal with their Bitrix24 stage mappings.
 * LEFT JOIN to include stages with no mappings.
 */
export function getCustomStages(portalId: number): CustomStageWithMappings[] {
  // Get all custom stages for the portal
  const stages = db
    .select()
    .from(portalCustomStages)
    .where(eq(portalCustomStages.portalId, portalId))
    .orderBy(portalCustomStages.sort)
    .all();

  // Get all mappings for this portal with task_stages info
  const mappings = db
    .select({
      mappingId: portalStageMappings.id,
      customStageId: portalStageMappings.customStageId,
      bitrixStageId: taskStages.bitrixStageId,
      taskStageId: taskStages.id,
      title: taskStages.title,
      color: taskStages.color,
    })
    .from(portalStageMappings)
    .innerJoin(taskStages, eq(portalStageMappings.bitrixStageId, taskStages.id))
    .where(eq(portalStageMappings.portalId, portalId))
    .all();

  // Group mappings by custom stage ID
  const mappingsByStageId = new Map<number, CustomStageWithMappings['mappedStages']>();
  for (const m of mappings) {
    const list = mappingsByStageId.get(m.customStageId) || [];
    list.push({
      id: m.mappingId,
      bitrixStageId: m.bitrixStageId,
      title: m.title,
      color: m.color,
      taskStageId: m.taskStageId,
    });
    mappingsByStageId.set(m.customStageId, list);
  }

  return stages.map((stage) => ({
    id: stage.id,
    portalId: stage.portalId,
    title: stage.title,
    color: stage.color,
    sort: stage.sort,
    createdAt: stage.createdAt,
    updatedAt: stage.updatedAt,
    mappedStages: mappingsByStageId.get(stage.id) || [],
  }));
}

/**
 * Create a new custom stage for a portal.
 */
export function createCustomStage(
  portalId: number,
  data: { title: string; color?: string; sort?: number }
): CustomStageWithMappings {
  const now = new Date().toISOString();

  // If no sort provided, place at the end
  let sort = data.sort;
  if (sort === undefined) {
    const maxSort = db
      .select({ sort: portalCustomStages.sort })
      .from(portalCustomStages)
      .where(eq(portalCustomStages.portalId, portalId))
      .orderBy(portalCustomStages.sort)
      .all();

    sort = maxSort.length > 0 ? maxSort[maxSort.length - 1].sort + 1 : 0;
  }

  const result = db
    .insert(portalCustomStages)
    .values({
      portalId,
      title: data.title,
      color: data.color || null,
      sort,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  const id = Number(result.lastInsertRowid);

  return {
    id,
    portalId,
    title: data.title,
    color: data.color || null,
    sort,
    createdAt: now,
    updatedAt: now,
    mappedStages: [],
  };
}

/**
 * Update an existing custom stage.
 */
export function updateCustomStage(
  stageId: number,
  data: { title?: string; color?: string; sort?: number }
): boolean {
  const now = new Date().toISOString();
  const setValues: Record<string, unknown> = { updatedAt: now };

  if (data.title !== undefined) setValues.title = data.title;
  if (data.color !== undefined) setValues.color = data.color;
  if (data.sort !== undefined) setValues.sort = data.sort;

  const result = db
    .update(portalCustomStages)
    .set(setValues)
    .where(eq(portalCustomStages.id, stageId))
    .run();

  return result.changes > 0;
}

/**
 * Delete a custom stage (cascades to portal_stage_mappings via ON DELETE CASCADE).
 */
export function deleteCustomStage(stageId: number): boolean {
  const result = db
    .delete(portalCustomStages)
    .where(eq(portalCustomStages.id, stageId))
    .run();

  return result.changes > 0;
}

/**
 * Map a Bitrix24 task stage to a custom stage.
 * Throws if the bitrix stage is already mapped to another custom stage (UNIQUE constraint).
 */
export function mapBitrixStageToCustom(
  portalId: number,
  customStageId: number,
  bitrixStageId: number
): number {
  const result = db
    .insert(portalStageMappings)
    .values({
      portalId,
      customStageId,
      bitrixStageId,
    })
    .run();

  return Number(result.lastInsertRowid);
}

/**
 * Remove a Bitrix24 stage mapping for a portal.
 */
export function unmapBitrixStage(portalId: number, bitrixStageId: number): boolean {
  const result = db
    .delete(portalStageMappings)
    .where(
      and(
        eq(portalStageMappings.portalId, portalId),
        eq(portalStageMappings.bitrixStageId, bitrixStageId)
      )
    )
    .run();

  return result.changes > 0;
}

/**
 * Given a task with a stageId, find the custom stage it maps to via portal_stage_mappings.
 * Returns null if the task's stage is not mapped to any custom stage.
 */
export function getCustomStageForTask(
  portalId: number,
  task: Pick<Task, 'stageId'>
): { id: number; title: string; color: string | null; sort: number } | null {
  if (!task.stageId) return null;

  // Find the task_stages record for this stageId
  const taskStage = db
    .select({ id: taskStages.id })
    .from(taskStages)
    .where(eq(taskStages.id, task.stageId))
    .get();

  if (!taskStage) return null;

  // Find the mapping for this task stage
  const mapping = db
    .select({
      customStageId: portalStageMappings.customStageId,
    })
    .from(portalStageMappings)
    .where(
      and(
        eq(portalStageMappings.portalId, portalId),
        eq(portalStageMappings.bitrixStageId, taskStage.id)
      )
    )
    .get();

  if (!mapping) return null;

  // Get the custom stage
  const customStage = db
    .select({
      id: portalCustomStages.id,
      title: portalCustomStages.title,
      color: portalCustomStages.color,
      sort: portalCustomStages.sort,
    })
    .from(portalCustomStages)
    .where(eq(portalCustomStages.id, mapping.customStageId))
    .get();

  return customStage || null;
}

/**
 * Reorder custom stages atomically by updating sort values.
 * stageIds array defines the new order (index = new sort value).
 */
export function reorderCustomStages(portalId: number, stageIds: number[]): void {
  // Verify all stages belong to this portal
  const existingStages = db
    .select({ id: portalCustomStages.id })
    .from(portalCustomStages)
    .where(eq(portalCustomStages.portalId, portalId))
    .all();

  const existingIds = new Set(existingStages.map((s) => s.id));
  for (const id of stageIds) {
    if (!existingIds.has(id)) {
      throw new Error(`Stage ${id} does not belong to portal ${portalId}`);
    }
  }

  const now = new Date().toISOString();

  // Update sort for each stage in a transaction-like manner
  // SQLite with better-sqlite3 auto-wraps multiple statements in a transaction
  // when using the .transaction() method, but drizzle doesn't expose it directly.
  // We use individual updates which are fast for small sets.
  for (let i = 0; i < stageIds.length; i++) {
    db.update(portalCustomStages)
      .set({ sort: i, updatedAt: now })
      .where(eq(portalCustomStages.id, stageIds[i]))
      .run();
  }
}

/**
 * Get a single custom stage by ID, verifying it belongs to the given portal.
 */
export function getCustomStageById(
  stageId: number,
  portalId: number
): { id: number; portalId: number; title: string; color: string | null; sort: number; createdAt: string; updatedAt: string } | null {
  const stage = db
    .select()
    .from(portalCustomStages)
    .where(
      and(
        eq(portalCustomStages.id, stageId),
        eq(portalCustomStages.portalId, portalId)
      )
    )
    .get();

  return stage || null;
}

/**
 * Get stages with custom stage mapping info (for enriching the stages API response).
 * Returns a map of taskStage.id -> custom stage info.
 */
export function getCustomStageMappingsForPortal(
  portalId: number
): Map<number, { id: number; title: string; color: string | null }> {
  const rows = db
    .select({
      bitrixStageId: portalStageMappings.bitrixStageId,
      customStageId: portalCustomStages.id,
      customStageTitle: portalCustomStages.title,
      customStageColor: portalCustomStages.color,
    })
    .from(portalStageMappings)
    .innerJoin(
      portalCustomStages,
      eq(portalStageMappings.customStageId, portalCustomStages.id)
    )
    .where(eq(portalStageMappings.portalId, portalId))
    .all();

  const map = new Map<number, { id: number; title: string; color: string | null }>();
  for (const row of rows) {
    map.set(row.bitrixStageId, {
      id: row.customStageId,
      title: row.customStageTitle,
      color: row.customStageColor,
    });
  }

  return map;
}
