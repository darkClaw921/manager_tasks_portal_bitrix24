'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ==================== Types ====================

export interface WorkHours {
  start: number;
  end: number;
}

interface SettingsResponse {
  data: Record<string, string>;
}

const DEFAULT_WORK_HOURS: WorkHours = { start: 9, end: 18 };

// ==================== Fetchers ====================

/** Fetch work hours from /api/settings */
async function fetchWorkHours(): Promise<WorkHours> {
  const response = await fetch('/api/settings');
  if (!response.ok) {
    throw new Error('Failed to fetch settings');
  }
  const json: SettingsResponse = await response.json();
  const data = json.data;

  const start = data.work_hours_start !== undefined
    ? Number(data.work_hours_start)
    : DEFAULT_WORK_HOURS.start;
  const end = data.work_hours_end !== undefined
    ? Number(data.work_hours_end)
    : DEFAULT_WORK_HOURS.end;

  return {
    start: Number.isFinite(start) ? start : DEFAULT_WORK_HOURS.start,
    end: Number.isFinite(end) ? end : DEFAULT_WORK_HOURS.end,
  };
}

/** Update work hours via PATCH /api/settings */
async function updateWorkHours(workHours: WorkHours): Promise<Record<string, string>> {
  const response = await fetch('/api/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      work_hours_start: workHours.start,
      work_hours_end: workHours.end,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to update work hours');
  }

  const json: SettingsResponse = await response.json();
  return json.data;
}

// ==================== Hooks ====================

/**
 * Hook to fetch current work hours settings.
 * Returns { start: number, end: number } with defaults of { start: 9, end: 18 }.
 */
export function useWorkHours() {
  const query = useQuery({
    queryKey: ['settings', 'work-hours'],
    queryFn: fetchWorkHours,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    ...query,
    data: query.data ?? DEFAULT_WORK_HOURS,
  };
}

/**
 * Hook to update work hours settings.
 * Invalidates the ['settings', 'work-hours'] cache on success.
 */
export function useUpdateWorkHours() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateWorkHours,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'work-hours'] });
    },
  });
}
