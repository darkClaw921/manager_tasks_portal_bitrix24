/**
 * Payment request types.
 *
 * A PaymentRequest represents an admin's proposal to pay a user for a set of
 * task rates. The user can accept (optionally with overrides that change
 * proposed amounts per item), reject, or leave it pending.
 *
 * Field ownership:
 * - `fromUserName` / `toUserName` / `taskTitle` / `expectedAmount` are NOT
 *   stored in the DB — they are added on the bridge layer via JOIN
 *   (users table, taskRates -> tasks, computeExpectedAmount helper).
 */

export type PaymentRequestStatus = 'pending' | 'accepted' | 'modified' | 'rejected';

export interface PaymentRequestItem {
  id: number;
  taskRateId: number;
  taskTitle: string;
  proposedAmount: number;
  appliedAmount?: number;
  expectedAmount: number;
}

export interface PaymentRequest {
  id: number;
  fromUserId: number;
  fromUserName: string;
  toUserId: number;
  toUserName: string;
  totalAmount: number;
  note: string | null;
  status: PaymentRequestStatus;
  respondedAt: string | null;
  createdAt: string;
  items: PaymentRequestItem[];
}

export interface CreatePaymentRequestInput {
  toUserId: number;
  items: Array<{
    taskRateId: number;
    proposedAmount: number;
  }>;
  note?: string;
}

export interface AcceptPaymentRequestInput {
  /**
   * Optional override map: key is PaymentRequestItem.id (as string, since JSON
   * objects can only have string keys), value is the appliedAmount to use
   * instead of the original proposedAmount. When any overrides are present,
   * the request status becomes 'modified'; otherwise 'accepted'.
   */
  overrides?: { [itemId: string]: number };
}
