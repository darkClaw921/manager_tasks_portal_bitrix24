import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tasks, portals, userBitrixMappings, users, userPortalAccess } from '@/lib/db/schema';
import { eq, and, or, between, lte, gte, inArray, asc } from 'drizzle-orm';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { getAccessiblePortalIds } from '@/lib/portals/access';
import { buildTaskAccessFilter, buildPortalTaskFilter } from '@/lib/portals/task-filter';

/**
 * GET /api/calendar/team
 *
 * Fetch team members and their tasks for a specific day.
 * Used by the team-day calendar view.
 *
 * Query params:
 *   date (required) - ISO date string (YYYY-MM-DD)
 *   portalId (optional) - filter to a specific portal
 *
 * Returns: { members: TeamMember[], tasks: TaskWithPortal[] }
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { searchParams } = new URL(request.url);

    const date = searchParams.get('date');
    if (!date) {
      return NextResponse.json(
        { error: 'Validation', message: 'date is required' },
        { status: 400 }
      );
    }

    const portalId = searchParams.get('portalId')
      ? parseInt(searchParams.get('portalId')!, 10)
      : null;

    // Get accessible portal IDs for the user
    const accessiblePortalIds = getAccessiblePortalIds(auth.user.userId);

    if (accessiblePortalIds.length === 0) {
      return NextResponse.json({ members: [], tasks: [] });
    }

    // Filter to requested portal if specified
    const targetPortalIds = portalId
      ? accessiblePortalIds.filter((id) => id === portalId)
      : accessiblePortalIds;

    if (targetPortalIds.length === 0) {
      return NextResponse.json({ members: [], tasks: [] });
    }

    // ==================== Fetch team members ====================
    // Query user_bitrix_mappings JOIN users JOIN portals for accessible portals
    const memberRows = db
      .select({
        userId: users.id,
        bitrixUserId: userBitrixMappings.bitrixUserId,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        portalId: userBitrixMappings.portalId,
        portalName: portals.name,
        portalColor: portals.color,
        bitrixName: userBitrixMappings.bitrixName,
      })
      .from(userBitrixMappings)
      .innerJoin(users, eq(userBitrixMappings.userId, users.id))
      .innerJoin(portals, eq(userBitrixMappings.portalId, portals.id))
      .innerJoin(
        userPortalAccess,
        and(
          eq(userPortalAccess.userId, userBitrixMappings.userId),
          eq(userPortalAccess.portalId, userBitrixMappings.portalId)
        )
      )
      .where(inArray(userBitrixMappings.portalId, targetPortalIds))
      .all();

    const members = memberRows.map((row) => ({
      userId: row.userId,
      bitrixUserId: row.bitrixUserId,
      name: row.bitrixName || `${row.firstName} ${row.lastName}`,
      email: row.email,
      portalId: row.portalId,
      portalName: row.portalName,
      portalColor: row.portalColor,
      photo: null,
      position: null,
    }));

    // ==================== Fetch tasks for the day ====================
    // Use the same date logic as calendar/tasks but for a single day
    const dateFrom = date;
    const dateTo = date;

    // Build access filter
    let accessFilter;
    if (portalId) {
      accessFilter = buildPortalTaskFilter(auth.user.userId, portalId);
    } else {
      accessFilter = buildTaskAccessFilter(auth.user.userId);
    }

    if (!accessFilter) {
      return NextResponse.json({ members, tasks: [] });
    }

    const conditions = [accessFilter];

    // Date filter for a single day: any date field falls on this day
    // For a single day, dateFrom === dateTo, so the spanning condition simplifies
    const dateToEnd = `${dateTo}T23:59:59`;
    const dateRangeFilter = or(
      between(tasks.startDatePlan, dateFrom, dateToEnd),
      between(tasks.endDatePlan, dateFrom, dateToEnd),
      between(tasks.deadline, dateFrom, dateToEnd),
      and(lte(tasks.startDatePlan, dateFrom), gte(tasks.endDatePlan, dateTo))
    )!;
    conditions.push(dateRangeFilter);

    const whereClause = and(...conditions);

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
    const taskData = taskRows.map((row) => ({
      ...row,
      tags: row.tags ? JSON.parse(row.tags) : null,
      accomplices: row.accomplices ? JSON.parse(row.accomplices) : null,
      auditors: row.auditors ? JSON.parse(row.auditors) : null,
    }));

    return NextResponse.json({ members, tasks: taskData });
  } catch (error) {
    console.error('[calendar/team] GET error:', error);
    return NextResponse.json(
      { error: 'Internal', message: 'Failed to fetch team data' },
      { status: 500 }
    );
  }
}
