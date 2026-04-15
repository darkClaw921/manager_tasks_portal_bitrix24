/**
 * Payment request service layer.
 *
 * All mutating functions run inside db.transaction() to ensure atomicity.
 * - createPaymentRequest: admin proposes a payment to a user. Inserts request,
 *   items, and an in-app notification in a single transaction.
 * - acceptPaymentRequest: user accepts (with optional per-item overrides).
 *   appliedAmount is accumulated onto taskRates.paidAmount (does NOT overwrite
 *   — historical partial payments are preserved). isPaid is recomputed from
 *   paidAmount >= expectedAmount.
 * - rejectPaymentRequest: user rejects a pending request.
 *
 * IMPORTANT: Overpayment is allowed at the backend layer; the UI should warn
 * but not block. expectedAmount is computed via the shared helper
 * computeExpectedAmount in src/lib/payments/calc.ts so /payments and /wallet
 * stay consistent.
 */

import { db } from '@/lib/db';
import {
  paymentRequests,
  paymentRequestItems,
  taskRates,
  tasks,
  users,
  notifications,
  timeTrackingEntries,
} from '@/lib/db/schema';
import { and, eq, desc, inArray, sql } from 'drizzle-orm';
import { computeExpectedAmount } from '@/lib/payments/calc';
import type {
  PaymentRequest,
  PaymentRequestItem,
  PaymentRequestStatus,
  CreatePaymentRequestInput,
} from '@/types/payment-request';

// ==================== Error Classes ====================

export class PaymentRequestError extends Error {
  code:
    | 'NOT_FOUND'
    | 'FORBIDDEN'
    | 'CONFLICT'
    | 'VALIDATION';
  constructor(
    code: 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT' | 'VALIDATION',
    message: string
  ) {
    super(message);
    this.name = 'PaymentRequestError';
    this.code = code;
  }
}

// ==================== Helpers ====================

function buildUserName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}

/**
 * Load full PaymentRequest (with items, joined user names, taskTitle, expectedAmount)
 * for a given request id. Returns undefined if the request does not exist.
 *
 * expectedAmount per item is computed from the rate + task + trackedTime using
 * the shared helper, so it is consistent with /payments.
 */
function loadPaymentRequestById(requestId: number): PaymentRequest | undefined {
  const fromUsers = { id: users.id, firstName: users.firstName, lastName: users.lastName };
  const toUsers = { id: users.id, firstName: users.firstName, lastName: users.lastName };

  // Load the request header with both user names via two queries (simpler than aliasing).
  const header = db
    .select({
      id: paymentRequests.id,
      fromUserId: paymentRequests.fromUserId,
      toUserId: paymentRequests.toUserId,
      totalAmount: paymentRequests.totalAmount,
      note: paymentRequests.note,
      status: paymentRequests.status,
      respondedAt: paymentRequests.respondedAt,
      createdAt: paymentRequests.createdAt,
    })
    .from(paymentRequests)
    .where(eq(paymentRequests.id, requestId))
    .get();

  if (!header) return undefined;

  const fromUser = db
    .select(fromUsers)
    .from(users)
    .where(eq(users.id, header.fromUserId))
    .get();
  const toUser = db
    .select(toUsers)
    .from(users)
    .where(eq(users.id, header.toUserId))
    .get();

  const itemRows = db
    .select({
      id: paymentRequestItems.id,
      taskRateId: paymentRequestItems.taskRateId,
      proposedAmount: paymentRequestItems.proposedAmount,
      appliedAmount: paymentRequestItems.appliedAmount,
      rateType: taskRates.rateType,
      rateAmount: taskRates.amount,
      hoursOverride: taskRates.hoursOverride,
      userId: taskRates.userId,
      taskId: taskRates.taskId,
      taskTitle: tasks.title,
      timeSpent: tasks.timeSpent,
      trackedTime: sql<number | null>`(SELECT SUM(${timeTrackingEntries.duration}) FROM ${timeTrackingEntries} WHERE ${timeTrackingEntries.taskId} = ${tasks.id} AND ${timeTrackingEntries.userId} = ${taskRates.userId} AND ${timeTrackingEntries.stoppedAt} IS NOT NULL)`,
    })
    .from(paymentRequestItems)
    .innerJoin(taskRates, eq(paymentRequestItems.taskRateId, taskRates.id))
    .innerJoin(tasks, eq(taskRates.taskId, tasks.id))
    .where(eq(paymentRequestItems.requestId, requestId))
    .all();

  const items: PaymentRequestItem[] = itemRows.map((row) => {
    const expected = computeExpectedAmount(
      {
        rateType: row.rateType,
        amount: row.rateAmount,
        hoursOverride: row.hoursOverride,
      },
      { timeSpent: row.timeSpent },
      row.trackedTime
    );
    return {
      id: row.id,
      taskRateId: row.taskRateId,
      taskTitle: row.taskTitle,
      proposedAmount: row.proposedAmount,
      appliedAmount: row.appliedAmount ?? undefined,
      expectedAmount: Math.round(expected * 100) / 100,
    };
  });

  return {
    id: header.id,
    fromUserId: header.fromUserId,
    fromUserName: fromUser
      ? buildUserName(fromUser.firstName, fromUser.lastName)
      : '',
    toUserId: header.toUserId,
    toUserName: toUser ? buildUserName(toUser.firstName, toUser.lastName) : '',
    totalAmount: header.totalAmount,
    note: header.note,
    status: header.status as PaymentRequestStatus,
    respondedAt: header.respondedAt,
    createdAt: header.createdAt,
    items,
  };
}

/**
 * Bulk version of loadPaymentRequestById for lists. Avoids per-row round trips
 * by batching the item query and the user-name lookups.
 */
function loadPaymentRequestsByIds(requestIds: number[]): PaymentRequest[] {
  if (requestIds.length === 0) return [];

  const headers = db
    .select({
      id: paymentRequests.id,
      fromUserId: paymentRequests.fromUserId,
      toUserId: paymentRequests.toUserId,
      totalAmount: paymentRequests.totalAmount,
      note: paymentRequests.note,
      status: paymentRequests.status,
      respondedAt: paymentRequests.respondedAt,
      createdAt: paymentRequests.createdAt,
    })
    .from(paymentRequests)
    .where(inArray(paymentRequests.id, requestIds))
    .all();

  if (headers.length === 0) return [];

  const userIds = Array.from(
    new Set(headers.flatMap((h) => [h.fromUserId, h.toUserId]))
  );

  const userRows = db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(users)
    .where(inArray(users.id, userIds))
    .all();

  const userNameById = new Map<number, string>(
    userRows.map((u) => [u.id, buildUserName(u.firstName, u.lastName)])
  );

  const itemRows = db
    .select({
      id: paymentRequestItems.id,
      requestId: paymentRequestItems.requestId,
      taskRateId: paymentRequestItems.taskRateId,
      proposedAmount: paymentRequestItems.proposedAmount,
      appliedAmount: paymentRequestItems.appliedAmount,
      rateType: taskRates.rateType,
      rateAmount: taskRates.amount,
      hoursOverride: taskRates.hoursOverride,
      taskTitle: tasks.title,
      timeSpent: tasks.timeSpent,
      trackedTime: sql<number | null>`(SELECT SUM(${timeTrackingEntries.duration}) FROM ${timeTrackingEntries} WHERE ${timeTrackingEntries.taskId} = ${tasks.id} AND ${timeTrackingEntries.userId} = ${taskRates.userId} AND ${timeTrackingEntries.stoppedAt} IS NOT NULL)`,
    })
    .from(paymentRequestItems)
    .innerJoin(taskRates, eq(paymentRequestItems.taskRateId, taskRates.id))
    .innerJoin(tasks, eq(taskRates.taskId, tasks.id))
    .where(inArray(paymentRequestItems.requestId, requestIds))
    .all();

  const itemsByRequestId = new Map<number, PaymentRequestItem[]>();
  for (const row of itemRows) {
    const expected = computeExpectedAmount(
      {
        rateType: row.rateType,
        amount: row.rateAmount,
        hoursOverride: row.hoursOverride,
      },
      { timeSpent: row.timeSpent },
      row.trackedTime
    );
    const item: PaymentRequestItem = {
      id: row.id,
      taskRateId: row.taskRateId,
      taskTitle: row.taskTitle,
      proposedAmount: row.proposedAmount,
      appliedAmount: row.appliedAmount ?? undefined,
      expectedAmount: Math.round(expected * 100) / 100,
    };
    const arr = itemsByRequestId.get(row.requestId) ?? [];
    arr.push(item);
    itemsByRequestId.set(row.requestId, arr);
  }

  return headers.map((h) => ({
    id: h.id,
    fromUserId: h.fromUserId,
    fromUserName: userNameById.get(h.fromUserId) ?? '',
    toUserId: h.toUserId,
    toUserName: userNameById.get(h.toUserId) ?? '',
    totalAmount: h.totalAmount,
    note: h.note,
    status: h.status as PaymentRequestStatus,
    respondedAt: h.respondedAt,
    createdAt: h.createdAt,
    items: itemsByRequestId.get(h.id) ?? [],
  }));
}

// ==================== Create ====================

/**
 * Admin creates a payment request for a user.
 *
 * Inside a transaction:
 *   1. Insert paymentRequests row with totalAmount = sum(proposedAmount)
 *   2. Insert paymentRequestItems rows
 *   3. Insert notification for the receiver (type='payment_request',
 *      link is implied by the UI at /wallet?tab=requests; we store title +
 *      message only since the notifications table has no link column).
 */
export function createPaymentRequest(
  adminId: number,
  input: CreatePaymentRequestInput
): PaymentRequest {
  if (!input.items || input.items.length === 0) {
    throw new PaymentRequestError('VALIDATION', 'Items must not be empty');
  }
  if (input.toUserId === adminId) {
    throw new PaymentRequestError(
      'VALIDATION',
      'Cannot create a payment request for yourself'
    );
  }
  for (const it of input.items) {
    if (!Number.isFinite(it.proposedAmount) || it.proposedAmount <= 0) {
      throw new PaymentRequestError(
        'VALIDATION',
        'proposedAmount must be a positive number'
      );
    }
  }

  const totalAmount = input.items.reduce(
    (sum, it) => sum + it.proposedAmount,
    0
  );

  // Validate that all taskRateIds exist and belong to the target user.
  const rateIds = input.items.map((it) => it.taskRateId);
  const rates = db
    .select({ id: taskRates.id, userId: taskRates.userId })
    .from(taskRates)
    .where(inArray(taskRates.id, rateIds))
    .all();
  if (rates.length !== rateIds.length) {
    throw new PaymentRequestError('VALIDATION', 'One or more taskRateIds do not exist');
  }
  for (const r of rates) {
    if (r.userId !== input.toUserId) {
      throw new PaymentRequestError(
        'VALIDATION',
        `taskRate ${r.id} does not belong to user ${input.toUserId}`
      );
    }
  }

  const requestId = db.transaction((tx) => {
    const inserted = tx
      .insert(paymentRequests)
      .values({
        fromUserId: adminId,
        toUserId: input.toUserId,
        totalAmount: Math.round(totalAmount * 100) / 100,
        note: input.note ?? null,
        status: 'pending',
      })
      .returning({ id: paymentRequests.id })
      .get();

    const newRequestId = inserted.id;

    tx.insert(paymentRequestItems)
      .values(
        input.items.map((it) => ({
          requestId: newRequestId,
          taskRateId: it.taskRateId,
          proposedAmount: it.proposedAmount,
          appliedAmount: null,
        }))
      )
      .run();

    tx.insert(notifications)
      .values({
        userId: input.toUserId,
        type: 'payment_request',
        title: 'Новый запрос оплаты',
        message: input.note ?? null,
        portalId: null,
        taskId: null,
        isRead: false,
      })
      .run();

    return newRequestId;
  });

  const created = loadPaymentRequestById(requestId);
  if (!created) {
    throw new Error('Failed to load newly created payment request');
  }
  return created;
}

// ==================== List ====================

/**
 * List payment requests where toUserId === userId (what the user has received).
 * Ordered by createdAt DESC.
 */
export function listIncomingRequests(userId: number): PaymentRequest[] {
  const ids = db
    .select({ id: paymentRequests.id })
    .from(paymentRequests)
    .where(eq(paymentRequests.toUserId, userId))
    .orderBy(desc(paymentRequests.createdAt))
    .all()
    .map((r) => r.id);

  const loaded = loadPaymentRequestsByIds(ids);
  // Preserve order from the id list (loadPaymentRequestsByIds doesn't promise order).
  const byId = new Map(loaded.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)!).filter(Boolean);
}

/**
 * List payment requests where fromUserId === adminId (what the admin has sent).
 * Ordered by createdAt DESC.
 */
export function listOutgoingRequests(adminId: number): PaymentRequest[] {
  const ids = db
    .select({ id: paymentRequests.id })
    .from(paymentRequests)
    .where(eq(paymentRequests.fromUserId, adminId))
    .orderBy(desc(paymentRequests.createdAt))
    .all()
    .map((r) => r.id);

  const loaded = loadPaymentRequestsByIds(ids);
  const byId = new Map(loaded.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)!).filter(Boolean);
}

// ==================== Detail ====================

/**
 * Get a single payment request. Access is granted to the sender (fromUserId)
 * or recipient (toUserId) only.
 *
 * Throws PaymentRequestError('NOT_FOUND') if the request does not exist,
 * PaymentRequestError('FORBIDDEN') if the caller has no access.
 */
export function getPaymentRequestDetail(
  requestId: number,
  userId: number
): PaymentRequest {
  const req = loadPaymentRequestById(requestId);
  if (!req) {
    throw new PaymentRequestError('NOT_FOUND', 'Payment request not found');
  }
  if (req.fromUserId !== userId && req.toUserId !== userId) {
    throw new PaymentRequestError(
      'FORBIDDEN',
      'You do not have access to this payment request'
    );
  }
  return req;
}

// ==================== Accept ====================

/**
 * Accept a pending payment request.
 *
 * - Only the recipient (toUserId) can accept.
 * - Only requests with status='pending' can be accepted.
 * - For each item, appliedAmount = overrides[item.id] ?? item.proposedAmount.
 * - taskRates.paidAmount is ACCUMULATED (add to current), not overwritten.
 * - taskRates.isPaid = (new paidAmount >= expectedAmount).
 * - paymentRequestItems.appliedAmount is persisted.
 * - Status becomes 'accepted' if overrides is empty/undefined, 'modified' if
 *   any override is present.
 * - respondedAt = now.
 */
export function acceptPaymentRequest(
  userId: number,
  requestId: number,
  overrides?: { [itemId: string]: number }
): PaymentRequest {
  const existing = loadPaymentRequestById(requestId);
  if (!existing) {
    throw new PaymentRequestError('NOT_FOUND', 'Payment request not found');
  }
  if (existing.toUserId !== userId) {
    throw new PaymentRequestError(
      'FORBIDDEN',
      'Only the recipient can accept this request'
    );
  }
  if (existing.status !== 'pending') {
    throw new PaymentRequestError(
      'CONFLICT',
      `Request is not pending (current status: ${existing.status})`
    );
  }

  const itemIds = new Set(existing.items.map((it) => it.id));
  const normalizedOverrides: Record<number, number> = {};
  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      const parsedId = parseInt(key, 10);
      if (isNaN(parsedId) || !itemIds.has(parsedId)) {
        throw new PaymentRequestError(
          'VALIDATION',
          `Override refers to unknown item id ${key}`
        );
      }
      if (!Number.isFinite(value) || value < 0) {
        throw new PaymentRequestError(
          'VALIDATION',
          `Override for item ${key} must be a non-negative number`
        );
      }
      normalizedOverrides[parsedId] = value;
    }
  }

  const hasOverrides = Object.keys(normalizedOverrides).length > 0;
  const now = new Date().toISOString();

  db.transaction((tx) => {
    for (const item of existing.items) {
      const applied =
        normalizedOverrides[item.id] !== undefined
          ? normalizedOverrides[item.id]
          : item.proposedAmount;

      // Read current paidAmount to accumulate correctly.
      const rateRow = tx
        .select({
          id: taskRates.id,
          paidAmount: taskRates.paidAmount,
        })
        .from(taskRates)
        .where(eq(taskRates.id, item.taskRateId))
        .get();

      if (!rateRow) {
        throw new PaymentRequestError(
          'NOT_FOUND',
          `taskRate ${item.taskRateId} no longer exists`
        );
      }

      const newPaidAmount = (rateRow.paidAmount ?? 0) + applied;
      // expectedAmount was computed at load time with the current rate/task state.
      const isPaid = newPaidAmount >= item.expectedAmount - 1e-9;

      tx.update(taskRates)
        .set({
          paidAmount: Math.round(newPaidAmount * 100) / 100,
          isPaid,
          paidAt: isPaid ? now : null,
          updatedAt: now,
        })
        .where(eq(taskRates.id, item.taskRateId))
        .run();

      tx.update(paymentRequestItems)
        .set({
          appliedAmount: Math.round(applied * 100) / 100,
        })
        .where(eq(paymentRequestItems.id, item.id))
        .run();
    }

    tx.update(paymentRequests)
      .set({
        status: hasOverrides ? 'modified' : 'accepted',
        respondedAt: now,
      })
      .where(eq(paymentRequests.id, requestId))
      .run();
  });

  const refreshed = loadPaymentRequestById(requestId);
  if (!refreshed) {
    throw new Error('Failed to reload payment request after accept');
  }
  return refreshed;
}

// ==================== Reject ====================

/**
 * Reject a pending payment request.
 * Only the recipient (toUserId) can reject. Status must be 'pending'.
 */
export function rejectPaymentRequest(
  userId: number,
  requestId: number
): PaymentRequest {
  const existing = loadPaymentRequestById(requestId);
  if (!existing) {
    throw new PaymentRequestError('NOT_FOUND', 'Payment request not found');
  }
  if (existing.toUserId !== userId) {
    throw new PaymentRequestError(
      'FORBIDDEN',
      'Only the recipient can reject this request'
    );
  }
  if (existing.status !== 'pending') {
    throw new PaymentRequestError(
      'CONFLICT',
      `Request is not pending (current status: ${existing.status})`
    );
  }

  const now = new Date().toISOString();

  db.transaction((tx) => {
    tx.update(paymentRequests)
      .set({
        status: 'rejected',
        respondedAt: now,
      })
      .where(
        and(
          eq(paymentRequests.id, requestId),
          eq(paymentRequests.status, 'pending')
        )
      )
      .run();
  });

  const refreshed = loadPaymentRequestById(requestId);
  if (!refreshed) {
    throw new Error('Failed to reload payment request after reject');
  }
  return refreshed;
}
