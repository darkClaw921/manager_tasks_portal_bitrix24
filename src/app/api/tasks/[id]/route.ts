import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tasks, portals, taskComments, taskChecklistItems, taskFiles, users } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { createBitrix24Client } from '@/lib/bitrix/client';
import { mapBitrixStatus } from '@/lib/bitrix/tasks';
import { isLocalPortal } from '@/lib/portals/local';
import { hasPortalAccess } from '@/lib/portals/access';
import { buildTaskAccessFilter } from '@/lib/portals/task-filter';
import type { BitrixTask } from '@/types';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Get a task with ownership validation.
 * Returns the task with portal info or null if not found/not owned.
 */
function getTaskWithOwnership(taskId: number, userId: number) {
  return db
    .select({
      id: tasks.id,
      portalId: tasks.portalId,
      bitrixTaskId: tasks.bitrixTaskId,
      title: tasks.title,
      description: tasks.description,
      descriptionHtml: tasks.descriptionHtml,
      status: tasks.status,
      priority: tasks.priority,
      mark: tasks.mark,
      responsibleId: tasks.responsibleId,
      responsibleName: tasks.responsibleName,
      responsiblePhoto: tasks.responsiblePhoto,
      creatorId: tasks.creatorId,
      creatorName: tasks.creatorName,
      creatorPhoto: tasks.creatorPhoto,
      groupId: tasks.groupId,
      stageId: tasks.stageId,
      deadline: tasks.deadline,
      startDatePlan: tasks.startDatePlan,
      endDatePlan: tasks.endDatePlan,
      createdDate: tasks.createdDate,
      changedDate: tasks.changedDate,
      closedDate: tasks.closedDate,
      timeEstimate: tasks.timeEstimate,
      timeSpent: tasks.timeSpent,
      tags: tasks.tags,
      accomplices: tasks.accomplices,
      auditors: tasks.auditors,
      bitrixUrl: tasks.bitrixUrl,
      excludeFromAi: tasks.excludeFromAi,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
      portalName: portals.name,
      portalColor: portals.color,
      portalDomain: portals.domain,
      portalUserId: portals.userId,
      portalMemberId: portals.memberId,
    })
    .from(tasks)
    .innerJoin(portals, eq(tasks.portalId, portals.id))
    .where(
      and(
        eq(tasks.id, taskId),
        eq(portals.userId, userId)
      )
    )
    .get();
}

/**
 * Get a task with portal join (no ownership filter).
 * Used to detect local portal before deciding access strategy.
 * Returns the same shape as getTaskWithOwnership.
 */
function getTaskForAccess(taskId: number) {
  return db
    .select({
      id: tasks.id,
      portalId: tasks.portalId,
      bitrixTaskId: tasks.bitrixTaskId,
      title: tasks.title,
      description: tasks.description,
      descriptionHtml: tasks.descriptionHtml,
      status: tasks.status,
      priority: tasks.priority,
      mark: tasks.mark,
      responsibleId: tasks.responsibleId,
      responsibleName: tasks.responsibleName,
      responsiblePhoto: tasks.responsiblePhoto,
      creatorId: tasks.creatorId,
      creatorName: tasks.creatorName,
      creatorPhoto: tasks.creatorPhoto,
      groupId: tasks.groupId,
      stageId: tasks.stageId,
      deadline: tasks.deadline,
      startDatePlan: tasks.startDatePlan,
      endDatePlan: tasks.endDatePlan,
      createdDate: tasks.createdDate,
      changedDate: tasks.changedDate,
      closedDate: tasks.closedDate,
      timeEstimate: tasks.timeEstimate,
      timeSpent: tasks.timeSpent,
      tags: tasks.tags,
      accomplices: tasks.accomplices,
      auditors: tasks.auditors,
      bitrixUrl: tasks.bitrixUrl,
      excludeFromAi: tasks.excludeFromAi,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
      portalName: portals.name,
      portalColor: portals.color,
      portalDomain: portals.domain,
      portalUserId: portals.userId,
      portalMemberId: portals.memberId,
    })
    .from(tasks)
    .innerJoin(portals, eq(tasks.portalId, portals.id))
    .where(eq(tasks.id, taskId))
    .get();
}

function parseJsonField(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * GET /api/tasks/[id]
 *
 * Get a single task with optional includes (comments, checklist, files).
 * Access rules:
 *  - admin: any task
 *  - portal owner (portals.userId === auth.userId): any of its tasks
 *  - user with user_portal_access + matching role visibility flags (via
 *    buildTaskAccessFilter): task only if the access filter selects it.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { id } = await context.params;
    const taskId = parseInt(id, 10);
    if (isNaN(taskId)) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid task ID' },
        { status: 400 }
      );
    }

    let task = getTaskWithOwnership(taskId, auth.user.userId);

    if (!task) {
      if (auth.user.isAdmin) {
        task = getTaskForAccess(taskId) || undefined;
      } else {
        // Local portal fast-path: any user with portal access can view local tasks
        // (mirrors PATCH branch).
        const probe = getTaskForAccess(taskId);
        if (
          probe &&
          isLocalPortal({ memberId: probe.portalMemberId }) &&
          hasPortalAccess(auth.user.userId, probe.portalId)
        ) {
          task = probe;
        }
      }
    }

    if (!task && !auth.user.isAdmin) {
      const accessFilter = buildTaskAccessFilter(auth.user.userId);
        if (accessFilter) {
          task = db
            .select({
              id: tasks.id,
              portalId: tasks.portalId,
              bitrixTaskId: tasks.bitrixTaskId,
              title: tasks.title,
              description: tasks.description,
              descriptionHtml: tasks.descriptionHtml,
              status: tasks.status,
              priority: tasks.priority,
              mark: tasks.mark,
              responsibleId: tasks.responsibleId,
              responsibleName: tasks.responsibleName,
              responsiblePhoto: tasks.responsiblePhoto,
              creatorId: tasks.creatorId,
              creatorName: tasks.creatorName,
              creatorPhoto: tasks.creatorPhoto,
              groupId: tasks.groupId,
              stageId: tasks.stageId,
              deadline: tasks.deadline,
              startDatePlan: tasks.startDatePlan,
              endDatePlan: tasks.endDatePlan,
              createdDate: tasks.createdDate,
              changedDate: tasks.changedDate,
              closedDate: tasks.closedDate,
              timeEstimate: tasks.timeEstimate,
              timeSpent: tasks.timeSpent,
              tags: tasks.tags,
              accomplices: tasks.accomplices,
              auditors: tasks.auditors,
              bitrixUrl: tasks.bitrixUrl,
              excludeFromAi: tasks.excludeFromAi,
              createdAt: tasks.createdAt,
              updatedAt: tasks.updatedAt,
              portalName: portals.name,
              portalColor: portals.color,
              portalDomain: portals.domain,
              portalUserId: portals.userId,
              portalMemberId: portals.memberId,
            })
            .from(tasks)
            .innerJoin(portals, eq(tasks.portalId, portals.id))
            .where(and(eq(tasks.id, taskId), accessFilter))
            .get();
      }
    }

    if (!task) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Task not found' },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const includes = (searchParams.get('include') || '').split(',').filter(Boolean);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: Record<string, any> = {
      ...task,
      tags: parseJsonField(task.tags),
      accomplices: parseJsonField(task.accomplices),
      auditors: parseJsonField(task.auditors),
      excludeFromAi: !!task.excludeFromAi,
    };
    delete result.portalUserId;
    delete result.portalMemberId;

    if (includes.includes('comments')) {
      const rawComments = db
        .select()
        .from(taskComments)
        .where(eq(taskComments.taskId, taskId))
        .all();
      result.comments = rawComments.map(c => ({
        ...c,
        attachedFiles: c.attachedFiles ? parseJsonField(c.attachedFiles) : null,
      }));
    }

    if (includes.includes('checklist')) {
      result.checklist = db
        .select()
        .from(taskChecklistItems)
        .where(eq(taskChecklistItems.taskId, taskId))
        .all()
        .sort((a, b) => a.sortIndex - b.sortIndex);
    }

    if (includes.includes('files')) {
      result.files = db
        .select()
        .from(taskFiles)
        .where(eq(taskFiles.taskId, taskId))
        .all();
    }

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error('[tasks/[id]] GET error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to fetch task' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/tasks/[id]
 *
 * Update a task on Bitrix24 and in local DB.
 * Body: { title?, description?, priority?, deadline?, status?, responsibleId?, stageId? }
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { id } = await context.params;
    const taskId = parseInt(id, 10);
    if (isNaN(taskId)) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid task ID' },
        { status: 400 }
      );
    }

    // Look up task with portal info (no ownership filter yet) to detect local
    const taskAccess = getTaskForAccess(taskId);
    if (!taskAccess) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Task not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { title, description, priority, deadline, status, responsibleId, tags, excludeFromAi, accomplices, auditors } = body;

    // ===== LOCAL PORTAL BRANCH =====
    if (isLocalPortal({ memberId: taskAccess.portalMemberId })) {
      // Access check: admin OR has portal access
      if (!auth.user.isAdmin && !hasPortalAccess(auth.user.userId, taskAccess.portalId)) {
        return NextResponse.json(
          { error: 'Not Found', message: 'Task not found' },
          { status: 404 }
        );
      }

      const localUpdates: Record<string, unknown> = {};
      const nowIsoL = new Date().toISOString();

      if (title !== undefined) localUpdates.title = title;
      if (description !== undefined) localUpdates.description = description;
      if (priority !== undefined) localUpdates.priority = priority;
      if (deadline !== undefined) localUpdates.deadline = deadline || null;
      if (status !== undefined) localUpdates.status = mapBitrixStatus(status);
      if (tags !== undefined) localUpdates.tags = JSON.stringify(tags);
      if (accomplices !== undefined) localUpdates.accomplices = JSON.stringify(accomplices);
      if (auditors !== undefined) localUpdates.auditors = JSON.stringify(auditors);
      if (excludeFromAi !== undefined) localUpdates.excludeFromAi = excludeFromAi ? 1 : 0;

      // Re-snapshot responsibleName when responsibleId changes
      if (responsibleId !== undefined) {
        const coerced = responsibleId !== null ? String(responsibleId) : null;
        localUpdates.responsibleId = coerced;
        let respName: string | null = null;
        if (coerced) {
          const respIdNum = parseInt(coerced, 10);
          if (!isNaN(respIdNum)) {
            const respRow = db
              .select({ firstName: users.firstName, lastName: users.lastName })
              .from(users)
              .where(eq(users.id, respIdNum))
              .get();
            if (respRow) {
              respName = `${respRow.firstName} ${respRow.lastName}`.trim();
            }
          }
        }
        localUpdates.responsibleName = respName;
      }

      if (Object.keys(localUpdates).length === 0) {
        return NextResponse.json(
          { error: 'Validation', message: 'No fields to update' },
          { status: 400 }
        );
      }

      localUpdates.changedDate = nowIsoL;
      localUpdates.updatedAt = nowIsoL;

      db.update(tasks)
        .set(localUpdates)
        .where(eq(tasks.id, taskId))
        .run();

      const updatedL = getTaskForAccess(taskId);
      if (!updatedL) {
        return NextResponse.json(
          { error: 'Internal', message: 'Task updated but could not be retrieved' },
          { status: 500 }
        );
      }
      const resultL: Record<string, unknown> = {
        ...updatedL,
        tags: parseJsonField(updatedL.tags),
        accomplices: parseJsonField(updatedL.accomplices),
        auditors: parseJsonField(updatedL.auditors),
        excludeFromAi: !!updatedL.excludeFromAi,
      };
      delete resultL.portalUserId;
      delete resultL.portalMemberId;

      return NextResponse.json({ data: resultL });
    }
    // ===== END LOCAL PORTAL BRANCH =====

    const task = getTaskWithOwnership(taskId, auth.user.userId);
    if (!task) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Task not found' },
        { status: 404 }
      );
    }

    // Build Bitrix24 fields (only fields that sync to Bitrix24)
    const fields: Record<string, unknown> = {};
    if (title !== undefined) fields.TITLE = title;
    if (description !== undefined) fields.DESCRIPTION = description;
    if (priority !== undefined) fields.PRIORITY = priority;
    if (deadline !== undefined) fields.DEADLINE = deadline || '';
    if (status !== undefined) fields.STATUS = status;
    if (responsibleId !== undefined) fields.RESPONSIBLE_ID = responsibleId;
    if (tags !== undefined) fields.TAGS = tags;
    if (accomplices !== undefined) fields.ACCOMPLICES = accomplices;
    if (auditors !== undefined) fields.AUDITORS = auditors;

    // Local-only fields don't need Bitrix24 sync
    const hasLocalOnlyFields = excludeFromAi !== undefined;

    if (Object.keys(fields).length === 0 && !hasLocalOnlyFields) {
      return NextResponse.json(
        { error: 'Validation', message: 'No fields to update' },
        { status: 400 }
      );
    }

    // Update on Bitrix24 first (only if there are Bitrix24 fields)
    if (Object.keys(fields).length > 0) {
      const client = createBitrix24Client(task.portalId);
      await client.call('tasks.task.update', {
        taskId: task.bitrixTaskId,
        fields,
      });
    }

    // Then update in local DB
    const now = new Date().toISOString();
    const localUpdates: Record<string, unknown> = { updatedAt: now };

    if (title !== undefined) localUpdates.title = title;
    if (description !== undefined) localUpdates.description = description;
    if (priority !== undefined) localUpdates.priority = priority;
    if (deadline !== undefined) localUpdates.deadline = deadline || null;
    if (status !== undefined) localUpdates.status = mapBitrixStatus(status);
    if (responsibleId !== undefined) localUpdates.responsibleId = responsibleId;
    if (tags !== undefined) localUpdates.tags = JSON.stringify(tags);
    if (accomplices !== undefined) localUpdates.accomplices = JSON.stringify(accomplices);
    if (auditors !== undefined) localUpdates.auditors = JSON.stringify(auditors);
    if (excludeFromAi !== undefined) localUpdates.excludeFromAi = excludeFromAi ? 1 : 0;

    db.update(tasks)
      .set(localUpdates)
      .where(eq(tasks.id, taskId))
      .run();

    // Return updated task
    const updated = getTaskWithOwnership(taskId, auth.user.userId);
    return NextResponse.json({
      data: updated ? {
        ...updated,
        tags: parseJsonField(updated.tags),
        accomplices: parseJsonField(updated.accomplices),
        auditors: parseJsonField(updated.auditors),
        excludeFromAi: !!updated.excludeFromAi,
      } : null,
    });
  } catch (error) {
    console.error('[tasks/[id]] PATCH error:', error);
    const message = error instanceof Error ? error.message : 'Failed to update task';
    return NextResponse.json(
      { error: 'Internal', message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/tasks/[id]
 *
 * Delete a task from Bitrix24 and local DB.
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { id } = await context.params;
    const taskId = parseInt(id, 10);
    if (isNaN(taskId)) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid task ID' },
        { status: 400 }
      );
    }

    // Look up task with portal info (no ownership filter) to detect local
    const taskAccess = getTaskForAccess(taskId);
    if (!taskAccess) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Task not found' },
        { status: 404 }
      );
    }

    // ===== LOCAL PORTAL BRANCH =====
    if (isLocalPortal({ memberId: taskAccess.portalMemberId })) {
      if (!auth.user.isAdmin && !hasPortalAccess(auth.user.userId, taskAccess.portalId)) {
        return NextResponse.json(
          { error: 'Not Found', message: 'Task not found' },
          { status: 404 }
        );
      }

      db.delete(tasks)
        .where(eq(tasks.id, taskId))
        .run();

      return NextResponse.json({
        data: { message: 'Task deleted successfully' },
      });
    }
    // ===== END LOCAL PORTAL BRANCH =====

    const task = getTaskWithOwnership(taskId, auth.user.userId);
    if (!task) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Task not found' },
        { status: 404 }
      );
    }

    // Delete on Bitrix24 first
    const client = createBitrix24Client(task.portalId);
    await client.call('tasks.task.delete', {
      taskId: task.bitrixTaskId,
    });

    // Then delete from local DB (cascades to comments, checklist, files)
    db.delete(tasks)
      .where(eq(tasks.id, taskId))
      .run();

    return NextResponse.json({
      data: { message: 'Task deleted successfully' },
    });
  } catch (error) {
    console.error('[tasks/[id]] DELETE error:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete task';
    return NextResponse.json(
      { error: 'Internal', message },
      { status: 500 }
    );
  }
}
