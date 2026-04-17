'use client';

/**
 * TanStack Query hooks для вложений задачи.
 *
 *  - useTaskFiles(taskId)       — GET список файлов.
 *  - useUploadTaskFile(taskId)  — POST multipart (single file).
 *  - useDeleteTaskFile(taskId)  — DELETE single file by id.
 *
 * Query key: ['task-files', taskId]. При успехе mutations инвалидируют этот
 * ключ + ['task', taskId] (на случай если detail view уже содержит files).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { TaskFile } from '@/types/task';

async function fetchTaskFiles(taskId: number): Promise<TaskFile[]> {
  const res = await fetch(`/api/tasks/${taskId}/files`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to fetch task files');
  }
  const body = (await res.json()) as { data?: TaskFile[] };
  return body.data ?? [];
}

async function uploadTaskFile(
  taskId: number,
  file: File
): Promise<TaskFile | TaskFile[]> {
  const fd = new FormData();
  fd.append('file', file);
  // Не задаём Content-Type — браузер добавит multipart/form-data; boundary=.
  const res = await fetch(`/api/tasks/${taskId}/files`, {
    method: 'POST',
    body: fd,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to upload file');
  }
  const body = (await res.json()) as { data?: TaskFile | TaskFile[] };
  if (!body.data) throw new Error('Empty upload response');
  return body.data;
}

async function deleteTaskFile(taskId: number, fileId: number): Promise<void> {
  const res = await fetch(`/api/tasks/${taskId}/files/${fileId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to delete file');
  }
}

/**
 * useTaskFiles — список вложений задачи.
 * Передайте null если taskId пока не известен (query отключён).
 */
export function useTaskFiles(taskId: number | null) {
  return useQuery({
    queryKey: ['task-files', taskId],
    queryFn: () => fetchTaskFiles(taskId!),
    enabled: taskId !== null,
    staleTime: 10_000,
  });
}

/**
 * useUploadTaskFile — загрузить один файл.
 * Возвращает вставленную запись (или массив, если backend объединил multi-upload).
 */
export function useUploadTaskFile(taskId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => uploadTaskFile(taskId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-files', taskId] });
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
    },
  });
}

/**
 * useDeleteTaskFile — удалить файл по id.
 */
export function useDeleteTaskFile(taskId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fileId: number) => deleteTaskFile(taskId, fileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-files', taskId] });
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
    },
  });
}
