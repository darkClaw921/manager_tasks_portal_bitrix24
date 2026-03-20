export type RateType = 'hourly' | 'fixed';

export interface TaskRate {
  id: number;
  userId: number;
  taskId: number;
  rateType: RateType;
  amount: number;
  hoursOverride: number | null;
  isPaid: boolean;
  paidAt: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskRateWithTask extends TaskRate {
  taskTitle: string;
  taskStatus: string;
  portalId: number;
  portalName: string;
  portalColor: string;
  portalDomain: string;
  timeSpent: number | null;
  closedDate: string | null;
  deadline: string | null;
  responsibleName: string | null;
  userName?: string;
  userEmail?: string;
}

export interface UpsertTaskRateInput {
  taskId: number;
  rateType: RateType;
  amount: number;
  hoursOverride?: number | null;
  note?: string | null;
}

export interface PaymentFilters {
  portalId?: number;
  dateFrom?: string;
  dateTo?: string;
  isPaid?: boolean;
  taskStatus?: string;
  userId?: number;
  page?: number;
  limit?: number;
}

export interface PaymentSummary {
  totalEarned: number;
  totalPaid: number;
  totalUnpaid: number;
  taskCount: number;
}
