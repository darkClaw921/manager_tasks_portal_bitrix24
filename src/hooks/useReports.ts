'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ==================== Types ====================

export interface ReportStats {
  total: number;
  completed: number;
  inProgress: number;
  overdue: number;
  newTasks: number;
  commentsCount: number;
}

export interface ReportData {
  id: number;
  type: 'daily' | 'weekly';
  periodStart: string;
  periodEnd: string;
  content: string;
  stats: ReportStats;
  createdAt: string;
}

interface ReportResponse {
  data: ReportData;
}

// ==================== Fetch Functions ====================

async function fetchDailyReport(date?: string): Promise<ReportData> {
  const params = date ? `?date=${date}` : '';
  const response = await fetch(`/api/reports/daily${params}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Ошибка при загрузке дневного отчёта');
  }

  const result: ReportResponse = await response.json();
  return result.data;
}

async function fetchWeeklyReport(week?: string): Promise<ReportData> {
  const params = week ? `?week=${week}` : '';
  const response = await fetch(`/api/reports/weekly${params}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Ошибка при загрузке недельного отчёта');
  }

  const result: ReportResponse = await response.json();
  return result.data;
}

async function regenerateDaily(date?: string): Promise<ReportData> {
  const response = await fetch('/api/reports/daily', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Ошибка при регенерации дневного отчёта');
  }

  const result: ReportResponse = await response.json();
  return result.data;
}

async function regenerateWeekly(week?: string): Promise<ReportData> {
  const response = await fetch('/api/reports/weekly', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ week }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Ошибка при регенерации недельного отчёта');
  }

  const result: ReportResponse = await response.json();
  return result.data;
}

// ==================== Hooks ====================

/**
 * Hook to fetch daily report. Auto-fetches on mount.
 */
export function useDailyReport(date?: string) {
  return useQuery({
    queryKey: ['reports', 'daily', date || 'today'],
    queryFn: () => fetchDailyReport(date),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });
}

/**
 * Hook to fetch weekly report. Auto-fetches on mount.
 */
export function useWeeklyReport(week?: string) {
  return useQuery({
    queryKey: ['reports', 'weekly', week || 'current'],
    queryFn: () => fetchWeeklyReport(week),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });
}

/**
 * Hook to regenerate daily report.
 */
export function useRegenerateDaily() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (date?: string) => regenerateDaily(date),
    onSuccess: (data) => {
      // Update the cached report
      const dateKey = data.periodStart.split('T')[0];
      queryClient.setQueryData(['reports', 'daily', dateKey], data);
      queryClient.setQueryData(['reports', 'daily', 'today'], data);
      // Invalidate reports list
      queryClient.invalidateQueries({ queryKey: ['reports', 'list'] });
    },
  });
}

/**
 * Hook to regenerate weekly report.
 */
export function useRegenerateWeekly() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (week?: string) => regenerateWeekly(week),
    onSuccess: (data) => {
      queryClient.setQueryData(['reports', 'weekly', 'current'], data);
      queryClient.invalidateQueries({ queryKey: ['reports', 'list'] });
    },
  });
}
