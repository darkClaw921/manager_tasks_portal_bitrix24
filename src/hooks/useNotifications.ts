'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { NotificationType } from '@/types';

// ==================== Types ====================

export interface NotificationItem {
  id: number;
  userId: number;
  type: NotificationType;
  title: string;
  message: string | null;
  portalId: number | null;
  taskId: number | null;
  link: string | null;
  isRead: boolean;
  createdAt: string;
  portalName: string | null;
  portalColor: string | null;
  portalDomain: string | null;
}

interface NotificationsResponse {
  data: NotificationItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface UnreadCountResponse {
  data: { count: number };
}

// ==================== Fetch Functions ====================

async function fetchNotifications(params: {
  page?: number;
  limit?: number;
  isRead?: boolean | null;
}): Promise<NotificationsResponse> {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', String(params.page));
  if (params.limit) searchParams.set('limit', String(params.limit));
  if (params.isRead !== null && params.isRead !== undefined) {
    searchParams.set('is_read', String(params.isRead));
  }

  const url = `/api/notifications${searchParams.toString() ? `?${searchParams}` : ''}`;
  const response = await fetch(url);

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to fetch notifications');
  }

  return response.json();
}

async function fetchUnreadCount(): Promise<number> {
  const response = await fetch('/api/notifications/unread-count');

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to fetch unread count');
  }

  const data: UnreadCountResponse = await response.json();
  return data.data.count;
}

async function markAsRead(notificationId: number): Promise<void> {
  const response = await fetch(`/api/notifications/${notificationId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to mark notification as read');
  }
}

async function markAllAsRead(): Promise<void> {
  const response = await fetch('/api/notifications/read-all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to mark all as read');
  }
}

// ==================== Hooks ====================

/**
 * Hook to fetch notifications with pagination.
 */
export function useNotifications(params: {
  page?: number;
  limit?: number;
  isRead?: boolean | null;
} = {}) {
  return useQuery({
    queryKey: ['notifications', params],
    queryFn: () => fetchNotifications(params),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

/**
 * Hook to fetch unread notification count.
 * Polls every 30 seconds for real-time updates.
 */
export function useUnreadCount() {
  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: fetchUnreadCount,
    staleTime: 15_000,
    refetchInterval: 30_000, // Poll every 30 seconds
    refetchOnWindowFocus: true,
  });
}

/**
 * Hook to mark a single notification as read.
 */
export function useMarkAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: number) => markAsRead(notificationId),
    onSuccess: () => {
      // Invalidate both notification list and unread count
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

/**
 * Hook to mark all notifications as read.
 */
export function useMarkAllAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: markAllAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
