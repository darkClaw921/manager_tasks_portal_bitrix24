import { db } from '@/lib/db';
import { tasks, portals, taskComments, aiReports } from '@/lib/db/schema';
import { eq, and, gte, lte, count, sql } from 'drizzle-orm';
import { generateCompletion, isAIAvailable, AIError } from './client';

// ==================== Types ====================

export interface ReportStats {
  total: number;
  completed: number;
  inProgress: number;
  overdue: number;
  newTasks: number;
  commentsCount: number;
}

export interface ReportResult {
  id: number;
  type: 'daily' | 'weekly';
  periodStart: string;
  periodEnd: string;
  content: string;
  stats: ReportStats;
  createdAt: string;
}

interface TaskData {
  id: number;
  title: string;
  status: string;
  priority: string;
  deadline: string | null;
  portalName: string;
  portalDomain: string;
  createdDate: string | null;
  changedDate: string | null;
  closedDate: string | null;
  responsibleName: string | null;
}

// ==================== System Prompt ====================

const SYSTEM_PROMPT = `Ты TaskHub AI ассистент - помощник по управлению задачами из Bitrix24.
Ты анализируешь задачи пользователя и даёшь структурированные отчёты на русском языке.

Формат ответа - markdown:
1. Краткое резюме (2-3 предложения)
2. Выполненные задачи (если есть)
3. Задачи в работе
4. Просроченные задачи (если есть) - с рекомендациями
5. Новые задачи за период
6. Рекомендации по приоритетам

Будь конкретным, указывай названия задач и порталы. Используй emoji для наглядности.
Если задач нет - сообщи об этом кратко.`;

// ==================== Report Generation ====================

/**
 * Generate a daily report for a user for a specific date.
 * If a report already exists for the date, returns it.
 * Otherwise generates a new one via Claude AI.
 */
export async function generateDailyReport(
  userId: number,
  date?: string // YYYY-MM-DD format
): Promise<ReportResult> {
  const targetDate = date || new Date().toISOString().split('T')[0];
  const periodStart = `${targetDate}T00:00:00.000Z`;
  const periodEnd = `${targetDate}T23:59:59.999Z`;

  // Check for existing report
  const existing = db
    .select()
    .from(aiReports)
    .where(
      and(
        eq(aiReports.userId, userId),
        eq(aiReports.type, 'daily'),
        eq(aiReports.periodStart, periodStart)
      )
    )
    .get();

  if (existing) {
    return {
      id: existing.id,
      type: 'daily',
      periodStart: existing.periodStart,
      periodEnd: existing.periodEnd,
      content: existing.content,
      stats: existing.stats ? JSON.parse(existing.stats) : getEmptyStats(),
      createdAt: existing.createdAt,
    };
  }

  // Generate new report
  return generateReport(userId, 'daily', periodStart, periodEnd, targetDate);
}

/**
 * Generate a weekly report for a user.
 * week param: YYYY-WNN format (e.g., 2026-W12) or omit for current week.
 */
export async function generateWeeklyReport(
  userId: number,
  week?: string // YYYY-WNN format
): Promise<ReportResult> {
  const { start, end } = getWeekRange(week);
  const periodStart = `${start}T00:00:00.000Z`;
  const periodEnd = `${end}T23:59:59.999Z`;

  // Check for existing report
  const existing = db
    .select()
    .from(aiReports)
    .where(
      and(
        eq(aiReports.userId, userId),
        eq(aiReports.type, 'weekly'),
        eq(aiReports.periodStart, periodStart)
      )
    )
    .get();

  if (existing) {
    return {
      id: existing.id,
      type: 'weekly',
      periodStart: existing.periodStart,
      periodEnd: existing.periodEnd,
      content: existing.content,
      stats: existing.stats ? JSON.parse(existing.stats) : getEmptyStats(),
      createdAt: existing.createdAt,
    };
  }

  return generateReport(userId, 'weekly', periodStart, periodEnd, `${start} - ${end}`);
}

/**
 * Force-regenerate a report, ignoring cached version.
 */
export async function regenerateReport(
  userId: number,
  type: 'daily' | 'weekly',
  params?: { date?: string; week?: string }
): Promise<ReportResult> {
  if (type === 'daily') {
    const targetDate = params?.date || new Date().toISOString().split('T')[0];
    const periodStart = `${targetDate}T00:00:00.000Z`;
    const periodEnd = `${targetDate}T23:59:59.999Z`;

    // Delete existing report for this period
    db.delete(aiReports)
      .where(
        and(
          eq(aiReports.userId, userId),
          eq(aiReports.type, 'daily'),
          eq(aiReports.periodStart, periodStart)
        )
      )
      .run();

    return generateReport(userId, 'daily', periodStart, periodEnd, targetDate);
  } else {
    const { start, end } = getWeekRange(params?.week);
    const periodStart = `${start}T00:00:00.000Z`;
    const periodEnd = `${end}T23:59:59.999Z`;

    db.delete(aiReports)
      .where(
        and(
          eq(aiReports.userId, userId),
          eq(aiReports.type, 'weekly'),
          eq(aiReports.periodStart, periodStart)
        )
      )
      .run();

    return generateReport(userId, 'weekly', periodStart, periodEnd, `${start} - ${end}`);
  }
}

// ==================== Core Generation Logic ====================

async function generateReport(
  userId: number,
  type: 'daily' | 'weekly',
  periodStart: string,
  periodEnd: string,
  periodLabel: string
): Promise<ReportResult> {
  // Fetch user's tasks for the period
  const userPortals = db
    .select({ id: portals.id, name: portals.name, domain: portals.domain })
    .from(portals)
    .where(and(eq(portals.userId, userId), eq(portals.isActive, true)))
    .all();

  if (userPortals.length === 0) {
    const emptyReport = createEmptyReport(userId, type, periodStart, periodEnd);
    return emptyReport;
  }

  const portalIds = userPortals.map((p) => p.id);
  const portalMap = new Map(userPortals.map((p) => [p.id, p]));

  // Get all tasks that were active during the period
  // (created, changed, or have deadline within period, or are currently active)
  const allTasks = db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      deadline: tasks.deadline,
      portalId: tasks.portalId,
      createdDate: tasks.createdDate,
      changedDate: tasks.changedDate,
      closedDate: tasks.closedDate,
      responsibleName: tasks.responsibleName,
    })
    .from(tasks)
    .where(
      sql`${tasks.portalId} IN (${sql.raw(portalIds.join(','))})
        AND ${tasks.excludeFromAi} = 0
        AND (
          ${tasks.createdDate} BETWEEN ${periodStart} AND ${periodEnd}
          OR ${tasks.changedDate} BETWEEN ${periodStart} AND ${periodEnd}
          OR ${tasks.closedDate} BETWEEN ${periodStart} AND ${periodEnd}
          OR (${tasks.deadline} BETWEEN ${periodStart} AND ${periodEnd})
          OR (${tasks.status} NOT IN ('COMPLETED', 'DEFERRED'))
        )`
    )
    .all();

  // Calculate stats
  const now = new Date().toISOString();
  const stats: ReportStats = {
    total: allTasks.length,
    completed: allTasks.filter((t) => t.status === 'COMPLETED').length,
    inProgress: allTasks.filter((t) => t.status === 'IN_PROGRESS').length,
    overdue: allTasks.filter(
      (t) => t.deadline && t.deadline < now && t.status !== 'COMPLETED' && t.status !== 'DEFERRED'
    ).length,
    newTasks: allTasks.filter(
      (t) => t.createdDate && t.createdDate >= periodStart && t.createdDate <= periodEnd
    ).length,
    commentsCount: 0,
  };

  // Count comments in period
  if (allTasks.length > 0) {
    const taskIds = allTasks.map((t) => t.id);
    const commentsResult = db
      .select({ count: count() })
      .from(taskComments)
      .where(
        sql`${taskComments.taskId} IN (${sql.raw(taskIds.join(','))})
          AND ${taskComments.postDate} BETWEEN ${periodStart} AND ${periodEnd}`
      )
      .get();
    stats.commentsCount = commentsResult?.count || 0;
  }

  // Prepare task data for AI prompt
  const taskDataForAI: TaskData[] = allTasks.slice(0, 200).map((t) => {
    const portal = portalMap.get(t.portalId);
    return {
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      deadline: t.deadline,
      portalName: portal?.name || 'Unknown',
      portalDomain: portal?.domain || '',
      createdDate: t.createdDate,
      changedDate: t.changedDate,
      closedDate: t.closedDate,
      responsibleName: t.responsibleName,
    };
  });

  // Generate AI content or fallback
  let content: string;

  if (isAIAvailable() && allTasks.length > 0) {
    try {
      const periodType = type === 'daily' ? 'день' : 'неделю';
      const userPrompt = buildReportPrompt(taskDataForAI, stats, periodLabel, periodType);
      content = await generateCompletion(SYSTEM_PROMPT, userPrompt, {
        maxTokens: 2048,
        temperature: 0.4,
      });
    } catch (error) {
      console.error('[reports] AI generation failed, using fallback:', error);
      content = buildFallbackReport(taskDataForAI, stats, periodLabel, type);
    }
  } else {
    content = buildFallbackReport(taskDataForAI, stats, periodLabel, type);
  }

  // Save to database
  const result = db
    .insert(aiReports)
    .values({
      userId,
      type,
      periodStart,
      periodEnd,
      content,
      stats: JSON.stringify(stats),
      createdAt: new Date().toISOString(),
    })
    .run();

  return {
    id: Number(result.lastInsertRowid),
    type,
    periodStart,
    periodEnd,
    content,
    stats,
    createdAt: new Date().toISOString(),
  };
}

// ==================== Prompt Builder ====================

function buildReportPrompt(
  taskData: TaskData[],
  stats: ReportStats,
  periodLabel: string,
  periodType: string
): string {
  const taskList = taskData.map((t) => {
    const deadline = t.deadline
      ? `deadline: ${t.deadline.split('T')[0]}`
      : 'no deadline';
    const responsible = t.responsibleName ? `(${t.responsibleName})` : '';
    return `- [${t.status}] "${t.title}" ${responsible} | Portal: ${t.portalName} | Priority: ${t.priority} | ${deadline}`;
  }).join('\n');

  return `Проанализируй задачи за ${periodType} (${periodLabel}).

Статистика:
- Всего задач: ${stats.total}
- Выполнено: ${stats.completed}
- В работе: ${stats.inProgress}
- Просрочено: ${stats.overdue}
- Новых: ${stats.newTasks}
- Комментариев: ${stats.commentsCount}

Список задач:
${taskList}

Дай структурированный отчёт с рекомендациями.`;
}

// ==================== Fallback Report ====================

function buildFallbackReport(
  taskData: TaskData[],
  stats: ReportStats,
  periodLabel: string,
  type: 'daily' | 'weekly'
): string {
  const title = type === 'daily' ? 'Дневной отчёт' : 'Недельный отчёт';

  const lines: string[] = [
    `## ${title}: ${periodLabel}`,
    '',
    `### Статистика`,
    `- Всего задач: **${stats.total}**`,
    `- Выполнено: **${stats.completed}**`,
    `- В работе: **${stats.inProgress}**`,
    `- Просрочено: **${stats.overdue}**`,
    `- Новых задач: **${stats.newTasks}**`,
    `- Комментариев: **${stats.commentsCount}**`,
  ];

  if (stats.overdue > 0) {
    lines.push('', '### Просроченные задачи');
    const overdueTasks = taskData.filter(
      (t) => t.deadline && t.deadline < new Date().toISOString() && t.status !== 'COMPLETED' && t.status !== 'DEFERRED'
    );
    overdueTasks.forEach((t) => {
      lines.push(`- **${t.title}** (${t.portalName}) - deadline: ${t.deadline?.split('T')[0]}`);
    });
  }

  const completedTasks = taskData.filter((t) => t.status === 'COMPLETED');
  if (completedTasks.length > 0) {
    lines.push('', '### Выполненные задачи');
    completedTasks.slice(0, 20).forEach((t) => {
      lines.push(`- ${t.title} (${t.portalName})`);
    });
  }

  const inProgressTasks = taskData.filter((t) => t.status === 'IN_PROGRESS');
  if (inProgressTasks.length > 0) {
    lines.push('', '### Задачи в работе');
    inProgressTasks.slice(0, 20).forEach((t) => {
      const deadline = t.deadline ? ` - deadline: ${t.deadline.split('T')[0]}` : '';
      lines.push(`- ${t.title} (${t.portalName})${deadline}`);
    });
  }

  if (!isAIAvailable()) {
    lines.push('', '---', '*AI-анализ недоступен. Настройте OPENROUTER_API_KEY для получения AI-рекомендаций.*');
  }

  return lines.join('\n');
}

// ==================== Helpers ====================

function getWeekRange(week?: string): { start: string; end: string } {
  if (week) {
    // Parse YYYY-WNN format
    const match = week.match(/^(\d{4})-W(\d{2})$/);
    if (match) {
      const year = parseInt(match[1], 10);
      const weekNum = parseInt(match[2], 10);
      const date = getDateOfISOWeek(weekNum, year);
      const start = date.toISOString().split('T')[0];
      const endDate = new Date(date);
      endDate.setDate(endDate.getDate() + 6);
      const end = endDate.toISOString().split('T')[0];
      return { start, end };
    }
  }

  // Default: current week (Monday to Sunday)
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    start: monday.toISOString().split('T')[0],
    end: sunday.toISOString().split('T')[0],
  };
}

function getDateOfISOWeek(week: number, year: number): Date {
  const simple = new Date(year, 0, 1 + (week - 1) * 7);
  const dayOfWeek = simple.getDay();
  const ISOWeekStart = simple;

  if (dayOfWeek <= 4) {
    ISOWeekStart.setDate(simple.getDate() - simple.getDay() + 1);
  } else {
    ISOWeekStart.setDate(simple.getDate() + 8 - simple.getDay());
  }

  return ISOWeekStart;
}

function getEmptyStats(): ReportStats {
  return { total: 0, completed: 0, inProgress: 0, overdue: 0, newTasks: 0, commentsCount: 0 };
}

function createEmptyReport(
  userId: number,
  type: 'daily' | 'weekly',
  periodStart: string,
  periodEnd: string
): ReportResult {
  const content = '## Нет данных\n\nУ вас пока нет подключённых порталов. Подключите портал Bitrix24 в разделе **Порталы** для начала работы.';

  const result = db
    .insert(aiReports)
    .values({
      userId,
      type,
      periodStart,
      periodEnd,
      content,
      stats: JSON.stringify(getEmptyStats()),
      createdAt: new Date().toISOString(),
    })
    .run();

  return {
    id: Number(result.lastInsertRowid),
    type,
    periodStart,
    periodEnd,
    content,
    stats: getEmptyStats(),
    createdAt: new Date().toISOString(),
  };
}

/**
 * Get list of user's reports with pagination.
 */
export function getUserReports(
  userId: number,
  options?: { type?: 'daily' | 'weekly'; page?: number; limit?: number }
): { data: ReportResult[]; total: number; page: number; limit: number; totalPages: number } {
  const page = options?.page || 1;
  const limit = Math.min(options?.limit || 20, 50);
  const offset = (page - 1) * limit;

  const conditions = [eq(aiReports.userId, userId)];
  if (options?.type) {
    conditions.push(eq(aiReports.type, options.type));
  }

  const where = conditions.length === 1 ? conditions[0] : and(...conditions);

  const totalResult = db
    .select({ count: count() })
    .from(aiReports)
    .where(where)
    .get();

  const total = totalResult?.count || 0;

  const items = db
    .select()
    .from(aiReports)
    .where(where)
    .orderBy(sql`${aiReports.createdAt} DESC`)
    .limit(limit)
    .offset(offset)
    .all();

  const data: ReportResult[] = items.map((item) => ({
    id: item.id,
    type: item.type as 'daily' | 'weekly',
    periodStart: item.periodStart,
    periodEnd: item.periodEnd,
    content: item.content,
    stats: item.stats ? JSON.parse(item.stats) : getEmptyStats(),
    createdAt: item.createdAt,
  }));

  return {
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}
