'use client';

import { useQuery } from '@tanstack/react-query';
import type { TaskWithPortal, TeamMember } from '@/types';

// ==================== Fetch Functions ====================

async function fetchCalendarTasks(
  dateFrom: string,
  dateTo: string,
  portalId?: number
): Promise<{ data: TaskWithPortal[] }> {
  const params = new URLSearchParams();
  params.set('dateFrom', dateFrom);
  params.set('dateTo', dateTo);
  if (portalId) params.set('portalId', String(portalId));

  const response = await fetch(`/api/calendar/tasks?${params.toString()}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to fetch calendar tasks');
  }
  return response.json();
}

async function fetchTeamDay(
  date: string,
  portalId?: number
): Promise<{ members: TeamMember[]; tasks: TaskWithPortal[] }> {
  const params = new URLSearchParams();
  params.set('date', date);
  if (portalId) params.set('portalId', String(portalId));

  const response = await fetch(`/api/calendar/team?${params.toString()}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to fetch team day data');
  }
  return response.json();
}

// ==================== Hooks ====================

/**
 * Hook to fetch calendar tasks for a date range.
 * Returns all tasks that have any date field overlapping with [dateFrom, dateTo].
 */
export function useCalendarTasks(dateFrom: string, dateTo: string, portalId?: number) {
  return useQuery({
    queryKey: ['calendar-tasks', dateFrom, dateTo, portalId],
    queryFn: () => fetchCalendarTasks(dateFrom, dateTo, portalId),
    staleTime: 30_000,
    enabled: !!dateFrom && !!dateTo,
  });
}

/**
 * Hook to fetch team members and their tasks for a specific day.
 * Used by the team-day calendar view.
 */
export function useTeamDay(date: string, portalId?: number) {
  return useQuery({
    queryKey: ['calendar-team', date, portalId],
    queryFn: () => fetchTeamDay(date, portalId),
    staleTime: 30_000,
    enabled: !!date,
  });
}
