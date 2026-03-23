import { db } from '@/lib/db';
import { taskRates, tasks, portals, users, userBitrixMappings, timeTrackingEntries } from '@/lib/db/schema';
import { eq, and, sql, inArray, gte, lte } from 'drizzle-orm';
import type {
  TaskRateWithTask,
  UpsertTaskRateInput,
  PaymentFilters,
  PaymentSummary,
} from '@/types/payment';
import type { TaskRate } from '@/lib/db/schema';

// ==================== Single Rate ====================

/**
 * Get a single task rate for a user on a specific task.
 */
export function getTaskRateForUser(userId: number, taskId: number): TaskRate | undefined {
  return db
    .select()
    .from(taskRates)
    .where(
      and(
        eq(taskRates.userId, userId),
        eq(taskRates.taskId, taskId)
      )
    )
    .get();
}

// ==================== Helpers ====================

function buildFilters(userId: number | null, filters: PaymentFilters) {
  const conditions = [];

  if (userId !== null) {
    conditions.push(eq(taskRates.userId, userId));
  }

  if (filters.portalId !== undefined) {
    conditions.push(eq(tasks.portalId, filters.portalId));
  }

  if (filters.dateFrom) {
    conditions.push(gte(taskRates.createdAt, filters.dateFrom));
  }

  if (filters.dateTo) {
    conditions.push(lte(taskRates.createdAt, filters.dateTo));
  }

  if (filters.isPaid !== undefined) {
    conditions.push(eq(taskRates.isPaid, filters.isPaid));
  }

  if (filters.taskStatus) {
    conditions.push(eq(tasks.status, filters.taskStatus));
  }

  if (filters.userId !== undefined && userId === null) {
    // Admin filtering by specific user
    conditions.push(eq(taskRates.userId, filters.userId));
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

function mapRowToTaskRateWithTask(row: {
  id: number;
  userId: number;
  taskId: number;
  rateType: string;
  amount: number;
  hoursOverride: number | null;
  isPaid: boolean;
  paidAt: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  taskTitle: string;
  taskStatus: string;
  portalId: number;
  portalName: string;
  portalColor: string;
  portalDomain: string;
  timeSpent: number | null;
  trackedTime: number | null;
  closedDate: string | null;
  deadline: string | null;
  responsibleName: string | null;
  userName?: string | null;
  userEmail?: string | null;
}): TaskRateWithTask {
  return {
    id: row.id,
    userId: row.userId,
    taskId: row.taskId,
    rateType: row.rateType as 'hourly' | 'fixed',
    amount: row.amount,
    hoursOverride: row.hoursOverride,
    isPaid: row.isPaid,
    paidAt: row.paidAt,
    note: row.note,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    taskTitle: row.taskTitle,
    taskStatus: row.taskStatus,
    portalId: row.portalId,
    portalName: row.portalName,
    portalColor: row.portalColor,
    portalDomain: row.portalDomain,
    timeSpent: row.timeSpent,
    trackedTime: row.trackedTime,
    closedDate: row.closedDate,
    deadline: row.deadline,
    responsibleName: row.responsibleName,
    userName: row.userName ?? undefined,
    userEmail: row.userEmail ?? undefined,
  };
}

const rateWithTaskSelect = {
  id: taskRates.id,
  userId: taskRates.userId,
  taskId: taskRates.taskId,
  rateType: taskRates.rateType,
  amount: taskRates.amount,
  hoursOverride: taskRates.hoursOverride,
  isPaid: taskRates.isPaid,
  paidAt: taskRates.paidAt,
  note: taskRates.note,
  createdAt: taskRates.createdAt,
  updatedAt: taskRates.updatedAt,
  taskTitle: tasks.title,
  taskStatus: tasks.status,
  portalId: tasks.portalId,
  portalName: portals.name,
  portalColor: portals.color,
  portalDomain: portals.domain,
  timeSpent: tasks.timeSpent,
  trackedTime: sql<number | null>`(SELECT SUM(${timeTrackingEntries.duration}) FROM ${timeTrackingEntries} WHERE ${timeTrackingEntries.taskId} = ${tasks.id} AND ${timeTrackingEntries.userId} = ${taskRates.userId} AND ${timeTrackingEntries.stoppedAt} IS NOT NULL)`,
  closedDate: tasks.closedDate,
  deadline: tasks.deadline,
  responsibleName: tasks.responsibleName,
};

// ==================== User Rates List ====================

/**
 * Get task rates for a specific user with JOIN on tasks and portals.
 * Supports pagination and filtering.
 */
export function getTaskRatesForUser(
  userId: number,
  filters: PaymentFilters
): { data: TaskRateWithTask[]; total: number } {
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 20;
  const offset = (page - 1) * limit;

  const whereClause = buildFilters(userId, filters);

  const totalRow = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(taskRates)
    .innerJoin(tasks, eq(taskRates.taskId, tasks.id))
    .innerJoin(portals, eq(tasks.portalId, portals.id))
    .where(whereClause)
    .get();

  const total = totalRow?.count ?? 0;

  const rows = db
    .select(rateWithTaskSelect)
    .from(taskRates)
    .innerJoin(tasks, eq(taskRates.taskId, tasks.id))
    .innerJoin(portals, eq(tasks.portalId, portals.id))
    .where(whereClause)
    .orderBy(sql`${taskRates.createdAt} DESC`)
    .limit(limit)
    .offset(offset)
    .all();

  return {
    data: rows.map(mapRowToTaskRateWithTask),
    total,
  };
}

// ==================== Admin: All Rates ====================

/**
 * Get all task rates (admin view) with JOIN on tasks, portals, and users.
 * Supports pagination and filtering.
 */
export function getAllTaskRates(
  filters: PaymentFilters
): { data: TaskRateWithTask[]; total: number } {
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 20;
  const offset = (page - 1) * limit;

  const whereClause = buildFilters(null, filters);

  const totalRow = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(taskRates)
    .innerJoin(tasks, eq(taskRates.taskId, tasks.id))
    .innerJoin(portals, eq(tasks.portalId, portals.id))
    .innerJoin(users, eq(taskRates.userId, users.id))
    .where(whereClause)
    .get();

  const total = totalRow?.count ?? 0;

  const rows = db
    .select({
      ...rateWithTaskSelect,
      userName: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
      userEmail: users.email,
    })
    .from(taskRates)
    .innerJoin(tasks, eq(taskRates.taskId, tasks.id))
    .innerJoin(portals, eq(tasks.portalId, portals.id))
    .innerJoin(users, eq(taskRates.userId, users.id))
    .where(whereClause)
    .orderBy(sql`${taskRates.createdAt} DESC`)
    .limit(limit)
    .offset(offset)
    .all();

  return {
    data: rows.map(mapRowToTaskRateWithTask),
    total,
  };
}

// ==================== Upsert ====================

/**
 * Insert or update a task rate (unique on user_id + task_id).
 */
export function upsertTaskRate(userId: number, input: UpsertTaskRateInput): TaskRate {
  const now = new Date().toISOString();

  db.insert(taskRates)
    .values({
      userId,
      taskId: input.taskId,
      rateType: input.rateType,
      amount: input.amount,
      hoursOverride: input.hoursOverride ?? null,
      note: input.note ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [taskRates.userId, taskRates.taskId],
      set: {
        rateType: input.rateType,
        amount: input.amount,
        hoursOverride: input.hoursOverride ?? null,
        note: input.note ?? null,
        updatedAt: now,
      },
    })
    .run();

  // Return the upserted row
  return db
    .select()
    .from(taskRates)
    .where(
      and(
        eq(taskRates.userId, userId),
        eq(taskRates.taskId, input.taskId)
      )
    )
    .get()!;
}

// ==================== Payment Status ====================

/**
 * Update payment status for a single rate.
 * Sets paidAt when isPaid=true, clears it when false.
 */
export function updatePaymentStatus(
  userId: number,
  rateId: number,
  isPaid: boolean
): TaskRate | undefined {
  const now = new Date().toISOString();

  const result = db
    .update(taskRates)
    .set({
      isPaid,
      paidAt: isPaid ? now : null,
      updatedAt: now,
    })
    .where(
      and(
        eq(taskRates.id, rateId),
        eq(taskRates.userId, userId)
      )
    )
    .run();

  if (result.changes === 0) return undefined;

  return db
    .select()
    .from(taskRates)
    .where(eq(taskRates.id, rateId))
    .get();
}

/**
 * Batch update payment status for multiple rates.
 * Returns the number of updated rows.
 */
export function batchUpdatePaymentStatus(
  userId: number,
  rateIds: number[],
  isPaid: boolean
): number {
  if (rateIds.length === 0) return 0;

  const now = new Date().toISOString();

  const result = db
    .update(taskRates)
    .set({
      isPaid,
      paidAt: isPaid ? now : null,
      updatedAt: now,
    })
    .where(
      and(
        inArray(taskRates.id, rateIds),
        eq(taskRates.userId, userId)
      )
    )
    .run();

  return result.changes;
}

// ==================== Payment Summary ====================

/**
 * Calculate payment summary with aggregation.
 * For hourly rates: amount * (hoursOverride ?? timeSpent/3600)
 * For fixed rates: amount
 * Calculated in JS because SQLite can't do conditional with nullable hoursOverride/timeSpent easily.
 */
export function getPaymentSummary(
  userId: number | null,
  filters: PaymentFilters
): PaymentSummary {
  const whereClause = buildFilters(userId, filters);

  const rows = db
    .select({
      rateType: taskRates.rateType,
      amount: taskRates.amount,
      hoursOverride: taskRates.hoursOverride,
      isPaid: taskRates.isPaid,
      timeSpent: tasks.timeSpent,
      trackedTime: sql<number | null>`(SELECT SUM(${timeTrackingEntries.duration}) FROM ${timeTrackingEntries} WHERE ${timeTrackingEntries.taskId} = ${tasks.id} AND ${timeTrackingEntries.userId} = ${taskRates.userId} AND ${timeTrackingEntries.stoppedAt} IS NOT NULL)`,
    })
    .from(taskRates)
    .innerJoin(tasks, eq(taskRates.taskId, tasks.id))
    .innerJoin(portals, eq(tasks.portalId, portals.id))
    .where(whereClause)
    .all();

  let totalEarned = 0;
  let totalPaid = 0;
  let totalUnpaid = 0;

  for (const row of rows) {
    let earned: number;
    if (row.rateType === 'hourly') {
      const hours = row.hoursOverride ?? (row.trackedTime ? row.trackedTime / 3600 : (row.timeSpent ? row.timeSpent / 3600 : 0));
      earned = row.amount * hours;
    } else {
      earned = row.amount;
    }

    totalEarned += earned;
    if (row.isPaid) {
      totalPaid += earned;
    } else {
      totalUnpaid += earned;
    }
  }

  return {
    totalEarned: Math.round(totalEarned * 100) / 100,
    totalPaid: Math.round(totalPaid * 100) / 100,
    totalUnpaid: Math.round(totalUnpaid * 100) / 100,
    taskCount: rows.length,
  };
}

// ==================== Delete ====================

/**
 * Delete a task rate for a user on a specific task.
 * Returns true if deleted, false if not found.
 */
export function deleteTaskRate(userId: number, taskId: number): boolean {
  const result = db
    .delete(taskRates)
    .where(
      and(
        eq(taskRates.userId, userId),
        eq(taskRates.taskId, taskId)
      )
    )
    .run();

  return result.changes > 0;
}

// ==================== Participant Check ====================

/**
 * Check if a user is a participant in a task.
 * Looks up the user's bitrixUserId via userBitrixMappings for the task's portal,
 * then checks if that bitrixUserId matches responsibleId, creatorId, accomplices, or auditors.
 */
export function isUserParticipant(userId: number, taskId: number): boolean {
  // Get the task with its portalId
  const task = db
    .select({
      portalId: tasks.portalId,
      responsibleId: tasks.responsibleId,
      creatorId: tasks.creatorId,
      accomplices: tasks.accomplices,
      auditors: tasks.auditors,
    })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .get();

  if (!task) return false;

  // Get the user's bitrixUserId for this portal
  const mapping = db
    .select({ bitrixUserId: userBitrixMappings.bitrixUserId })
    .from(userBitrixMappings)
    .where(
      and(
        eq(userBitrixMappings.userId, userId),
        eq(userBitrixMappings.portalId, task.portalId)
      )
    )
    .get();

  if (!mapping) return false;

  const bitrixUserId = mapping.bitrixUserId;

  // Check direct role matches
  if (task.responsibleId === bitrixUserId) return true;
  if (task.creatorId === bitrixUserId) return true;

  // Check accomplices (JSON array string)
  if (task.accomplices) {
    try {
      const accomplices: string[] = JSON.parse(task.accomplices);
      if (accomplices.includes(bitrixUserId)) return true;
    } catch {
      // Invalid JSON, skip
    }
  }

  // Check auditors (JSON array string)
  if (task.auditors) {
    try {
      const auditors: string[] = JSON.parse(task.auditors);
      if (auditors.includes(bitrixUserId)) return true;
    } catch {
      // Invalid JSON, skip
    }
  }

  return false;
}

// ==================== Get Rate by ID ====================

/**
 * Get a task rate by its ID.
 */
export function getTaskRateById(rateId: number): TaskRate | undefined {
  return db
    .select()
    .from(taskRates)
    .where(eq(taskRates.id, rateId))
    .get();
}

/**
 * Admin version of updatePaymentStatus that doesn't check userId ownership.
 */
export function updatePaymentStatusAdmin(
  rateId: number,
  isPaid: boolean
): TaskRate | undefined {
  const now = new Date().toISOString();

  const result = db
    .update(taskRates)
    .set({
      isPaid,
      paidAt: isPaid ? now : null,
      updatedAt: now,
    })
    .where(eq(taskRates.id, rateId))
    .run();

  if (result.changes === 0) return undefined;

  return db
    .select()
    .from(taskRates)
    .where(eq(taskRates.id, rateId))
    .get();
}

/**
 * Admin version of batchUpdatePaymentStatus that doesn't check userId ownership.
 */
export function batchUpdatePaymentStatusAdmin(
  rateIds: number[],
  isPaid: boolean
): number {
  if (rateIds.length === 0) return 0;

  const now = new Date().toISOString();

  const result = db
    .update(taskRates)
    .set({
      isPaid,
      paidAt: isPaid ? now : null,
      updatedAt: now,
    })
    .where(inArray(taskRates.id, rateIds))
    .run();

  return result.changes;
}
