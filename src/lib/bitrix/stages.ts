import { db } from '@/lib/db';
import { taskStages } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { createBitrix24Client } from './client';
import type { BitrixStage } from '@/types';

/**
 * Convert a key to UPPER_SNAKE_CASE.
 */
function toUpperSnakeCase(str: string): string {
  if (/^[A-Z0-9_]+$/.test(str)) return str;
  return str.replace(/([A-Z])/g, '_$1').toUpperCase();
}

/**
 * Normalize stage keys to UPPER_SNAKE_CASE.
 */
function normalizeStageKeys(obj: Record<string, unknown>): BitrixStage {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    normalized[toUpperSnakeCase(key)] = value;
  }
  return normalized as unknown as BitrixStage;
}

/**
 * Fetch stages from a Bitrix24 portal and save/update them in the database.
 * Fetches "My Plan" stages (entityId=0) by default.
 *
 * @param portalId - The local portal ID
 * @param entityId - Bitrix24 entity ID (0 for "My Plan", group ID for project kanban)
 */
export async function fetchStages(
  portalId: number,
  entityId: number = 0
): Promise<void> {
  const client = createBitrix24Client(portalId);

  try {
    const response = await client.call<Record<string, BitrixStage>>('task.stages.get', {
      entityId,
    });

    if (!response.result) {
      console.log(`[stages] No stages returned for portal ${portalId}, entityId=${entityId}`);
      return;
    }

    const rawStages = Object.values(response.result);
    const stages = rawStages.map((s) => normalizeStageKeys(s as unknown as Record<string, unknown>));

    console.log(`[stages] Fetched ${stages.length} stages for portal ${portalId}, entityId=${entityId}`);

    const now = new Date().toISOString();

    for (const stage of stages) {
      const bitrixStageId = String(stage.ID);
      const stageEntityId = parseInt(String(stage.ENTITY_ID), 10) || 0;
      const entityType = stage.ENTITY_TYPE || (stageEntityId === 0 ? 'U' : 'G');

      // Map entity_type: 'U' -> 'USER', 'G' -> 'GROUP'
      const normalizedEntityType = entityType === 'G' ? 'GROUP' : 'USER';

      // Check if stage already exists for this portal + bitrix_stage_id
      const existing = db
        .select({ id: taskStages.id })
        .from(taskStages)
        .where(
          and(
            eq(taskStages.portalId, portalId),
            eq(taskStages.bitrixStageId, bitrixStageId)
          )
        )
        .get();

      if (existing) {
        // Update existing stage
        db.update(taskStages)
          .set({
            entityId: stageEntityId,
            entityType: normalizedEntityType,
            title: stage.TITLE,
            sort: parseInt(String(stage.SORT), 10) || 0,
            color: stage.COLOR || null,
            systemType: stage.SYSTEM_TYPE || null,
            updatedAt: now,
          })
          .where(eq(taskStages.id, existing.id))
          .run();
      } else {
        // Insert new stage
        db.insert(taskStages)
          .values({
            portalId,
            bitrixStageId,
            entityId: stageEntityId,
            entityType: normalizedEntityType,
            title: stage.TITLE,
            sort: parseInt(String(stage.SORT), 10) || 0,
            color: stage.COLOR || null,
            systemType: stage.SYSTEM_TYPE || null,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }
    }

    console.log(`[stages] Saved ${stages.length} stages for portal ${portalId}`);
  } catch (error) {
    console.error(`[stages] Failed to fetch stages for portal ${portalId}:`, error);
    throw error;
  }
}

/**
 * Get all stages for a portal from the local database.
 *
 * @param portalId - The local portal ID
 * @param entityId - Optional filter by entity ID
 */
export function getStagesForPortal(portalId: number, entityId?: number) {
  let stages = db
    .select()
    .from(taskStages)
    .where(eq(taskStages.portalId, portalId))
    .all();

  if (entityId !== undefined) {
    stages = stages.filter((s) => s.entityId === entityId);
  }

  // Sort by sort field
  return stages.sort((a, b) => a.sort - b.sort);
}
