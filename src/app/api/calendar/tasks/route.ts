import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tasks, portals } from '@/lib/db/schema';
import { eq, and, or, between, lte, gte, inArray, asc } from 'drizzle-orm';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { buildTaskAccessFilter, buildPortalTaskFilter } from '@/lib/portals/task-filter';

/**
 * GET /api/calendar/tasks
 *
 * Fetch tasks for calendar view within a date range.
 * Returns ALL matching tasks (no pagination, capped at 500).
 *
 * Query params:
 *   dateFrom (required) - ISO date string, start of range
 *   dateTo (required) - ISO date string, end of range
 *   portalId (optional) - filter by specific portal
 *   responsibleIds (optional) - comma-separated Bitrix user IDs
 *
 * A task matches if ANY of its date fields fall within the range:
 *   - startDatePlan between dateFrom and dateTo
 *   - endDatePlan between dateFrom and dateTo
 *   - deadline between dateFrom and dateTo
 *   - task spans the entire range (startDatePlan <= dateFrom AND endDatePlan >= dateTo)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { searchParams } = new URL(request.url);

    // Parse required params
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    if (!dateFrom || !dateTo) {
      return NextResponse.json(
        { error: 'Validation', message: 'dateFrom and dateTo are required' },
        { status: 400 }
      );
    }

    // Parse optional params
    const portalId = searchParams.get('portalId')
      ? parseInt(searchParams.get('portalId')!, 10)
      : null;
    const responsibleIds = searchParams.get('responsibleIds')
      ? searchParams.get('responsibleIds')!.split(',').map((id) => id.trim()).filter(Boolean)
      : null;

    // Build access filter based on user permissions
    let accessFilter;
    if (portalId) {
      accessFilter = buildPortalTaskFilter(auth.user.userId, portalId);
    } else {
      accessFilter = buildTaskAccessFilter(auth.user.userId);
    }

    if (!accessFilter) {
      // User has no access to any portal tasks
      return NextResponse.json({ data: [] });
    }

    // Build WHERE conditions
    const conditions = [accessFilter];

    // Date range filter: task has any date field overlapping with [dateFrom, dateTo]
    const dateRangeFilter = or(
      between(tasks.startDatePlan, dateFrom, dateTo),
      between(tasks.endDatePlan, dateFrom, dateTo),
      between(tasks.deadline, dateFrom, dateTo),
      and(lte(tasks.startDatePlan, dateFrom), gte(tasks.endDatePlan, dateTo))
    )!;
    conditions.push(dateRangeFilter);

    // Responsible IDs filter
    if (responsibleIds && responsibleIds.length > 0) {
      conditions.push(inArray(tasks.responsibleId, responsibleIds));
    }

    const whereClause = and(...conditions);

    // Fetch tasks with portal join (no pagination, cap at 500)
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
        createdAt: tasks.createdAt,
        updatedAt: tasks.updatedAt,
        portalName: portals.name,
        portalColor: portals.color,
        portalDomain: portals.domain,
      })
      .from(tasks)
      .innerJoin(portals, eq(tasks.portalId, portals.id))
      .where(whereClause)
      .orderBy(asc(tasks.deadline))
      .limit(500)
      .all();

    // Parse JSON fields
    const data = taskRows.map((row) => ({
      ...row,
      tags: row.tags ? JSON.parse(row.tags) : null,
      accomplices: row.accomplices ? JSON.parse(row.accomplices) : null,
      auditors: row.auditors ? JSON.parse(row.auditors) : null,
    }));

    return NextResponse.json({ data });
  } catch (error) {
    console.error('[calendar/tasks] GET error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to fetch calendar tasks' },
      { status: 500 }
    );
  }
}
