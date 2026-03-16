import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tasks, portals } from '@/lib/db/schema';
import { eq, and, like, sql, lte, gte } from 'drizzle-orm';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { createBitrix24Client } from '@/lib/bitrix/client';
import { upsertTask } from '@/lib/bitrix/tasks';
import { buildTaskAccessFilter, buildPortalTaskFilter } from '@/lib/portals/task-filter';
import { hasPortalAccess } from '@/lib/portals/access';
import type { BitrixTask } from '@/types';

/**
 * GET /api/tasks
 *
 * List tasks for the current user with filtering and pagination.
 * Uses user_portal_access + user_bitrix_mappings for permission-based filtering.
 * Query params: portalId, status, priority, search, assignee, dateFrom, dateTo,
 *               sortBy, sortOrder, page, limit
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { searchParams } = new URL(request.url);

    // Parse query params
    const portalId = searchParams.get('portalId')
      ? parseInt(searchParams.get('portalId')!, 10)
      : null;
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const search = searchParams.get('search');
    const assignee = searchParams.get('assignee');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const sortBy = searchParams.get('sortBy') || 'changedDate';
    const sortOrder = searchParams.get('sortOrder') || 'desc';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));

    // Build access filter based on user permissions
    let accessFilter;
    if (portalId) {
      accessFilter = buildPortalTaskFilter(auth.user.userId, portalId);
    } else {
      accessFilter = buildTaskAccessFilter(auth.user.userId);
    }

    if (!accessFilter) {
      // User has no access to any portal tasks
      return NextResponse.json({
        data: [],
        total: 0,
        page,
        limit,
        totalPages: 0,
      });
    }

    // Build WHERE conditions
    const conditions = [accessFilter];

    // Status filter
    if (status) {
      conditions.push(eq(tasks.status, status));
    }

    // Priority filter
    if (priority) {
      conditions.push(eq(tasks.priority, priority));
    }

    // Search filter (LIKE on title)
    if (search && search.trim()) {
      conditions.push(like(tasks.title, `%${search.trim()}%`));
    }

    // Assignee filter (responsible_name LIKE)
    if (assignee && assignee.trim()) {
      conditions.push(like(tasks.responsibleName, `%${assignee.trim()}%`));
    }

    // Date range filter (on deadline)
    if (dateFrom) {
      conditions.push(gte(tasks.deadline, dateFrom));
    }
    if (dateTo) {
      conditions.push(lte(tasks.deadline, dateTo));
    }

    const whereClause = and(...conditions);

    // Map sortBy to SQL column name for ordering
    const sortColumnMap: Record<string, string> = {
      deadline: 'deadline',
      createdDate: 'created_date',
      changedDate: 'changed_date',
      priority: 'priority',
      title: 'title',
      status: 'status',
    };
    const sortColumnName = sortColumnMap[sortBy] || 'changed_date';

    // Count total
    const countResult = db
      .select({ count: sql<number>`count(*)` })
      .from(tasks)
      .where(whereClause)
      .get();

    const total = countResult?.count || 0;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;

    // Fetch tasks with portal join
    const taskRows = db
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
        creatorId: tasks.creatorId,
        creatorName: tasks.creatorName,
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
      })
      .from(tasks)
      .innerJoin(portals, eq(tasks.portalId, portals.id))
      .where(whereClause)
      .orderBy(sql.raw(`tasks.${sortColumnName} ${sortOrder === 'asc' ? 'ASC' : 'DESC'}`))
      .limit(limit)
      .offset(offset)
      .all();

    // Parse JSON fields and convert integer booleans
    const data = taskRows.map((row) => ({
      ...row,
      tags: row.tags ? JSON.parse(row.tags) : null,
      accomplices: row.accomplices ? JSON.parse(row.accomplices) : null,
      auditors: row.auditors ? JSON.parse(row.auditors) : null,
      excludeFromAi: !!row.excludeFromAi,
    }));

    return NextResponse.json({
      data,
      total,
      page,
      limit,
      totalPages,
    });
  } catch (error) {
    console.error('[tasks] GET error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to fetch tasks' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tasks
 *
 * Create a new task on Bitrix24 and save to local DB.
 * Verifies portal access via user_portal_access.
 * Body: { portalId, title, description?, responsibleId?, priority?, deadline?, tags?, groupId? }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const body = await request.json();
    const { portalId, title, description, responsibleId, priority, deadline, tags, groupId } = body;

    // Validate required fields
    if (!portalId || !title) {
      return NextResponse.json(
        { error: 'Validation', message: 'portalId and title are required' },
        { status: 400 }
      );
    }

    // Verify user has access to the portal
    if (!auth.user.isAdmin && !hasPortalAccess(auth.user.userId, portalId)) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Portal not found' },
        { status: 404 }
      );
    }

    // Get portal (must be active)
    const portal = db
      .select()
      .from(portals)
      .where(
        and(
          eq(portals.id, portalId),
          eq(portals.isActive, true)
        )
      )
      .get();

    if (!portal) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Portal not found or inactive' },
        { status: 404 }
      );
    }

    // Build Bitrix24 task fields
    const fields: Record<string, unknown> = {
      TITLE: title,
    };
    if (description) fields.DESCRIPTION = description;
    if (responsibleId) fields.RESPONSIBLE_ID = responsibleId;
    if (priority) fields.PRIORITY = priority;
    if (deadline) fields.DEADLINE = deadline;
    if (tags && Array.isArray(tags)) fields.TAGS = tags;
    if (groupId) fields.GROUP_ID = groupId;

    // Create task on Bitrix24
    const client = createBitrix24Client(portalId);
    const response = await client.call<{ task: BitrixTask }>('tasks.task.add', {
      fields,
    });

    const createdTask = response.result?.task;
    if (!createdTask) {
      return NextResponse.json(
        { error: 'Bitrix24', message: 'Failed to create task on Bitrix24' },
        { status: 502 }
      );
    }

    // Save to local DB
    const localTaskId = upsertTask(createdTask, portalId, portal.domain);

    // Return the created task with portal info
    const taskRow = db
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
        creatorId: tasks.creatorId,
        creatorName: tasks.creatorName,
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
        createdAt: tasks.createdAt,
        updatedAt: tasks.updatedAt,
        portalName: portals.name,
        portalColor: portals.color,
        portalDomain: portals.domain,
      })
      .from(tasks)
      .innerJoin(portals, eq(tasks.portalId, portals.id))
      .where(eq(tasks.id, localTaskId))
      .get();

    if (!taskRow) {
      return NextResponse.json(
        { error: 'Internal', message: 'Task created but could not be retrieved' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: {
        ...taskRow,
        tags: taskRow.tags ? JSON.parse(taskRow.tags) : null,
        accomplices: taskRow.accomplices ? JSON.parse(taskRow.accomplices) : null,
        auditors: taskRow.auditors ? JSON.parse(taskRow.auditors) : null,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('[tasks] POST error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to create task' },
      { status: 500 }
    );
  }
}
