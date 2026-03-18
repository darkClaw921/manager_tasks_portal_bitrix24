'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { TaskWithPortal, TaskFilters, PaginatedResponse, CreateTaskInput, UpdateTaskInput } from '@/types';

// ==================== Fetch Functions ====================

async function fetchTasks(
  filters: TaskFilters
): Promise<PaginatedResponse<TaskWithPortal>> {
  const params = new URLSearchParams();

  if (filters.portalId) params.set('portalId', String(filters.portalId));
  if (filters.status) params.set('status', filters.status);
  if (filters.priority) params.set('priority', filters.priority);
  if (filters.search) params.set('search', filters.search);
  if (filters.responsibleId) params.set('assignee', filters.responsibleId);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));

  const response = await fetch(`/api/tasks?${params.toString()}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to fetch tasks');
  }
  return response.json();
}

async function createTask(input: CreateTaskInput): Promise<TaskWithPortal> {
  const response = await fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to create task');
  }
  const data = await response.json();
  return data.data;
}

async function updateTask(
  id: number,
  updates: UpdateTaskInput & { status?: string; stageId?: string; excludeFromAi?: boolean }
): Promise<TaskWithPortal> {
  const response = await fetch(`/api/tasks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to update task');
  }
  const data = await response.json();
  return data.data;
}

async function deleteTask(id: number): Promise<void> {
  const response = await fetch(`/api/tasks/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to delete task');
  }
}

async function startTask(id: number): Promise<TaskWithPortal> {
  const response = await fetch(`/api/tasks/${id}/start`, {
    method: 'POST',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to start task');
  }
  const data = await response.json();
  return data.data;
}

async function completeTask(id: number): Promise<TaskWithPortal> {
  const response = await fetch(`/api/tasks/${id}/complete`, {
    method: 'POST',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to complete task');
  }
  const data = await response.json();
  return data.data;
}

async function renewTask(id: number): Promise<TaskWithPortal> {
  const response = await fetch(`/api/tasks/${id}/renew`, {
    method: 'POST',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to renew task');
  }
  const data = await response.json();
  return data.data;
}

async function moveTaskStage(
  id: number,
  stageId: string
): Promise<void> {
  const response = await fetch(`/api/tasks/${id}/stage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stageId }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to move task stage');
  }
}

// ==================== Hooks ====================

/**
 * Hook to fetch a paginated, filtered list of tasks.
 */
export function useTasks(filters: TaskFilters = {}) {
  return useQuery({
    queryKey: ['tasks', filters],
    queryFn: () => fetchTasks(filters),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

/**
 * Hook to create a new task.
 * Invalidates the tasks list cache on success.
 */
export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

/**
 * Hook to update a task.
 * Optimistically updates the task in cache, then invalidates on success.
 */
export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateTaskInput & { status?: string; stageId?: string; excludeFromAi?: boolean } }) =>
      updateTask(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task', variables.id] });
    },
  });
}

/**
 * Hook to delete a task.
 */
export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

/**
 * Hook to start a task (change status to IN_PROGRESS).
 */
export function useStartTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: startTask,
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task', id] });
    },
  });
}

/**
 * Hook to complete a task.
 */
export function useCompleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: completeTask,
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task', id] });
    },
  });
}

/**
 * Hook to renew/resume a task (change status back to IN_PROGRESS).
 */
export function useRenewTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: renewTask,
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task', id] });
    },
  });
}

/**
 * Hook to move a task to a different stage.
 */
export function useMoveTaskStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, stageId }: { id: number; stageId: string }) =>
      moveTaskStage(id, stageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
