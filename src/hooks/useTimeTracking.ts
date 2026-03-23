'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ActiveTimerEntry, TaskTimeTrackingSummary, TimeTrackingEntry, TimeTrackingStats } from '@/types';

// ==================== Fetch Functions ====================

async function fetchActiveTimers(): Promise<ActiveTimerEntry[]> {
  const response = await fetch('/api/time-tracking/active');
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to fetch active timers');
  }
  const data = await response.json();
  return data.data;
}

async function startTimer(taskId: number): Promise<TimeTrackingEntry> {
  const response = await fetch('/api/time-tracking/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to start timer');
  }
  const data = await response.json();
  return data.data;
}

async function stopTimer(taskId: number): Promise<TimeTrackingEntry> {
  const response = await fetch('/api/time-tracking/stop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to stop timer');
  }
  const data = await response.json();
  return data.data;
}

async function fetchTaskTimeTracking(taskId: number): Promise<TaskTimeTrackingSummary> {
  const response = await fetch(`/api/time-tracking/task/${taskId}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to fetch task time tracking');
  }
  const data = await response.json();
  return data.data;
}

async function deleteTimeEntry(id: number): Promise<void> {
  const response = await fetch(`/api/time-tracking/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to delete time entry');
  }
}

async function fetchTimeTrackingStats(): Promise<TimeTrackingStats> {
  const response = await fetch('/api/time-tracking/stats');
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to fetch time tracking stats');
  }
  const data = await response.json();
  return data.data;
}

// ==================== Query Hooks ====================

/**
 * Hook to fetch all active timers for the current user.
 * Automatically refetches every 10 seconds.
 */
export function useActiveTimers() {
  return useQuery({
    queryKey: ['time-tracking', 'active'],
    queryFn: fetchActiveTimers,
    staleTime: 5_000,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });
}

/**
 * Hook to fetch time tracking summary for a specific task.
 * Automatically refetches every 10 seconds when enabled.
 */
export function useTaskTimeTracking(taskId: number | null) {
  return useQuery({
    queryKey: ['time-tracking', 'task', taskId],
    queryFn: () => fetchTaskTimeTracking(taskId!),
    enabled: taskId !== null,
    staleTime: 5_000,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });
}

/**
 * Hook to fetch time tracking statistics (today, week, month, all time).
 */
export function useTimeTrackingStats() {
  return useQuery({
    queryKey: ['time-tracking', 'stats'],
    queryFn: fetchTimeTrackingStats,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

// ==================== Mutation Hooks ====================

/**
 * Hook to start a timer for a task.
 * Invalidates active timers and task-specific time tracking caches on success.
 */
export function useStartTimer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: startTimer,
    onSuccess: (_data, taskId) => {
      queryClient.invalidateQueries({ queryKey: ['time-tracking', 'active'] });
      queryClient.invalidateQueries({ queryKey: ['time-tracking', 'task', taskId] });
    },
  });
}

/**
 * Hook to stop a timer for a task.
 * Invalidates active timers and task-specific time tracking caches on success.
 */
export function useStopTimer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: stopTimer,
    onSuccess: (_data, taskId) => {
      queryClient.invalidateQueries({ queryKey: ['time-tracking', 'active'] });
      queryClient.invalidateQueries({ queryKey: ['time-tracking', 'task', taskId] });
      queryClient.invalidateQueries({ queryKey: ['time-tracking', 'stats'] });
    },
  });
}

/**
 * Hook to delete a time tracking entry.
 * Invalidates all time-tracking caches on success.
 */
export function useDeleteTimeEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteTimeEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['time-tracking'] });
    },
  });
}

// ==================== Utility Hooks ====================

/**
 * Hook that returns a live-updating elapsed time string (HH:MM:SS)
 * for a running timer. Updates every second.
 *
 * @param startedAt - ISO datetime string of when the timer started, or null if no timer is active
 * @returns Formatted elapsed time string in HH:MM:SS format
 */
export function useElapsedTime(startedAt: string | null): string {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!startedAt) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  if (!startedAt) return '00:00:00';

  const elapsed = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ==================== Utility Functions ====================

/**
 * Formats a duration in seconds to HH:MM:SS string.
 * Use for displaying completed session durations.
 *
 * @param seconds - Duration in seconds
 * @returns Formatted duration string in HH:MM:SS format
 */
export function formatDuration(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
