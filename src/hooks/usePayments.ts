'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  TaskRate,
  TaskRateWithTask,
  PaymentFilters,
  PaymentSummary,
  UpsertTaskRateInput,
} from '@/types';

// ==================== Types ====================

export interface PaymentsResponse {
  data: TaskRateWithTask[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  summary: PaymentSummary;
}

// ==================== Fetch Functions ====================

async function fetchTaskRate(taskId: number, userId?: number): Promise<TaskRate | null> {
  const url = userId != null
    ? `/api/tasks/${taskId}/rate?userId=${userId}`
    : `/api/tasks/${taskId}/rate`;
  const response = await fetch(url);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to fetch task rate');
  }
  const data = await response.json();
  return data.data;
}

async function upsertTaskRate(
  input: UpsertTaskRateInput & { userId?: number }
): Promise<TaskRate> {
  const { taskId, ...body } = input;
  const response = await fetch(`/api/tasks/${taskId}/rate`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to save task rate');
  }
  const data = await response.json();
  return data.data;
}

async function deleteTaskRate(taskId: number, userId?: number): Promise<void> {
  const url = userId != null
    ? `/api/tasks/${taskId}/rate?userId=${userId}`
    : `/api/tasks/${taskId}/rate`;
  const response = await fetch(url, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to delete task rate');
  }
}

async function fetchPayments(
  filters: PaymentFilters
): Promise<PaymentsResponse> {
  const params = new URLSearchParams();

  if (filters.portalId != null) params.set('portalId', String(filters.portalId));
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.isPaid != null) params.set('isPaid', String(filters.isPaid));
  if (filters.taskStatus) params.set('taskStatus', filters.taskStatus);
  if (filters.userId != null) params.set('userId', String(filters.userId));
  if (filters.page != null) params.set('page', String(filters.page));
  if (filters.limit != null) params.set('limit', String(filters.limit));

  const response = await fetch(`/api/payments?${params.toString()}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to fetch payments');
  }
  return response.json();
}

async function updatePaymentStatus(
  rateId: number,
  isPaid: boolean
): Promise<TaskRate> {
  const response = await fetch(`/api/payments/${rateId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isPaid }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to update payment status');
  }
  const data = await response.json();
  return data.data;
}

async function batchUpdatePaymentStatus(
  rateIds: number[],
  isPaid: boolean
): Promise<{ updated: number }> {
  const response = await fetch('/api/payments/batch', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rateIds, isPaid }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to batch update payment status');
  }
  const data = await response.json();
  return data.data;
}

// ==================== Hooks ====================

/**
 * Hook to fetch the current user's rate for a specific task.
 */
export function useTaskRate(taskId: number | null, userId?: number) {
  return useQuery({
    queryKey: ['task-rate', taskId, userId ?? 'self'],
    queryFn: () => fetchTaskRate(taskId!, userId),
    enabled: !!taskId,
    staleTime: 5_000,
  });
}

/**
 * Hook to create or update a task rate. When `userId` is supplied in the
 * input, the request is for that user (admin-only on the backend).
 */
export function useUpsertTaskRate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpsertTaskRateInput & { userId?: number }) => upsertTaskRate(input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['task-rate', variables.taskId] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
    },
  });
}

/**
 * Hook to delete a task rate. When `userId` is supplied, deletes that user's
 * rate (admin-only on the backend).
 */
export function useDeleteTaskRate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, userId }: { taskId: number; userId?: number }) => deleteTaskRate(taskId, userId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['task-rate', variables.taskId] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
    },
  });
}

/**
 * Hook to fetch payments with filtering and pagination.
 */
export function usePayments(filters: PaymentFilters) {
  return useQuery({
    queryKey: ['payments', filters],
    queryFn: () => fetchPayments(filters),
    staleTime: 10_000,
  });
}

/**
 * Hook to update payment status for a single rate.
 */
export function useUpdatePaymentStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ rateId, isPaid }: { rateId: number; isPaid: boolean }) =>
      updatePaymentStatus(rateId, isPaid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
    },
  });
}

/**
 * Hook to batch update payment status for multiple rates.
 */
export function useBatchUpdatePaymentStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ rateIds, isPaid }: { rateIds: number[]; isPaid: boolean }) =>
      batchUpdatePaymentStatus(rateIds, isPaid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
    },
  });
}
