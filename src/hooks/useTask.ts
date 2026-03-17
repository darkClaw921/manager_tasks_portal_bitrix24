'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { TaskComment, TaskChecklistItem, TaskFile, TaskWithPortal } from '@/types';

// ==================== Types ====================

export interface TaskDetail extends TaskWithPortal {
  comments: TaskComment[];
  checklist: TaskChecklistItem[];
  files: TaskFile[];
}

// ==================== Fetch Functions ====================

async function fetchTask(id: number): Promise<TaskDetail> {
  const response = await fetch(`/api/tasks/${id}?include=comments,checklist,files`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to fetch task');
  }
  const data = await response.json();
  return data.data;
}

// Comments
async function addComment(taskId: number, message: string): Promise<TaskComment> {
  const response = await fetch(`/api/tasks/${taskId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to add comment');
  }
  const data = await response.json();
  return data.data;
}

// Checklist
async function addChecklistItem(taskId: number, title: string): Promise<TaskChecklistItem> {
  const response = await fetch(`/api/tasks/${taskId}/checklist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to add checklist item');
  }
  const data = await response.json();
  return data.data;
}

async function toggleChecklistItem(
  taskId: number,
  itemId: number,
  isComplete: boolean
): Promise<void> {
  const response = await fetch(`/api/tasks/${taskId}/checklist/${itemId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isComplete }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to toggle checklist item');
  }
}

async function deleteChecklistItemApi(
  taskId: number,
  itemId: number
): Promise<void> {
  const response = await fetch(`/api/tasks/${taskId}/checklist/${itemId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to delete checklist item');
  }
}

// ==================== Hooks ====================

/**
 * Hook to fetch a single task with all related data.
 */
export function useTask(id: number | null) {
  return useQuery({
    queryKey: ['task', id],
    queryFn: () => fetchTask(id!),
    enabled: id !== null,
    staleTime: 5_000,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });
}

/**
 * Hook to add a comment to a task.
 */
export function useAddComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, message }: { taskId: number; message: string }) =>
      addComment(taskId, message),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['task', variables.taskId] });
    },
  });
}

/**
 * Hook to add a checklist item.
 */
export function useAddChecklistItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, title }: { taskId: number; title: string }) =>
      addChecklistItem(taskId, title),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['task', variables.taskId] });
    },
  });
}

/**
 * Hook to toggle a checklist item complete/incomplete.
 * Optimistic update for smooth UX.
 */
export function useToggleChecklistItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      taskId,
      itemId,
      isComplete,
    }: {
      taskId: number;
      itemId: number;
      isComplete: boolean;
    }) => toggleChecklistItem(taskId, itemId, isComplete),
    onMutate: async ({ taskId, itemId, isComplete }) => {
      await queryClient.cancelQueries({ queryKey: ['task', taskId] });

      const previousTask = queryClient.getQueryData<TaskDetail>(['task', taskId]);

      if (previousTask) {
        queryClient.setQueryData<TaskDetail>(['task', taskId], {
          ...previousTask,
          checklist: previousTask.checklist.map((item) =>
            item.id === itemId ? { ...item, isComplete } : item
          ),
        });
      }

      return { previousTask };
    },
    onError: (_error, variables, context) => {
      if (context?.previousTask) {
        queryClient.setQueryData(['task', variables.taskId], context.previousTask);
      }
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: ['task', variables.taskId] });
    },
  });
}

/**
 * Hook to delete a checklist item.
 */
export function useDeleteChecklistItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, itemId }: { taskId: number; itemId: number }) =>
      deleteChecklistItemApi(taskId, itemId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['task', variables.taskId] });
    },
  });
}
