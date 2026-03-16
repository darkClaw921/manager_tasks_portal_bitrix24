'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useNotifications, useMarkAsRead, useMarkAllAsRead } from '@/hooks/useNotifications';
import { PortalIndicator } from '@/components/ui/PortalIndicator';
import { cn } from '@/lib/utils';
import type { NotificationType } from '@/types';
import type { NotificationItem } from '@/hooks/useNotifications';

interface NotificationDropdownProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Get icon for notification type
 */
function NotificationIcon({ type }: { type: NotificationType }) {
  switch (type) {
    case 'task_add':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-success">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      );
    case 'task_update':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-primary">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
        </svg>
      );
    case 'task_delete':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-danger">
          <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
        </svg>
      );
    case 'comment_add':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-primary">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 0 1 1.037-.443 48.282 48.282 0 0 0 5.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
        </svg>
      );
    case 'mention':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-warning">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Zm0 0c0 1.657 1.007 3 2.25 3S21 13.657 21 12a9 9 0 1 0-2.636 6.364M16.5 12V8.25" />
        </svg>
      );
    case 'overdue':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-danger">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      );
    default:
      return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-text-secondary">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
        </svg>
      );
  }
}

/**
 * Format a relative time string
 */
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return 'только что';
  if (diffMin < 60) return `${diffMin} мин. назад`;
  if (diffHr < 24) return `${diffHr} ч. назад`;
  if (diffDay < 7) return `${diffDay} дн. назад`;

  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function NotificationItemRow({
  notification,
  onNavigate,
}: {
  notification: NotificationItem;
  onNavigate: (notification: NotificationItem) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onNavigate(notification)}
      className={cn(
        'w-full text-left px-4 py-3 flex gap-3 hover:bg-background transition-colors border-b border-border last:border-b-0',
        !notification.isRead && 'bg-primary/5'
      )}
    >
      {/* Icon */}
      <div className="flex-shrink-0 mt-0.5">
        <NotificationIcon type={notification.type} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={cn(
            'text-small leading-snug truncate',
            notification.isRead ? 'text-text-secondary' : 'text-foreground font-medium'
          )}>
            {notification.title}
          </p>
          {!notification.isRead && (
            <span className="flex-shrink-0 w-2 h-2 mt-1.5 rounded-full bg-primary" />
          )}
        </div>

        {notification.message && (
          <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">
            {notification.message}
          </p>
        )}

        <div className="flex items-center gap-2 mt-1">
          {notification.portalColor && (
            <PortalIndicator color={notification.portalColor} size="sm" />
          )}
          <span className="text-xs text-text-secondary">
            {formatRelativeTime(notification.createdAt)}
          </span>
        </div>
      </div>
    </button>
  );
}

export function NotificationDropdown({ isOpen, onClose }: NotificationDropdownProps) {
  const router = useRouter();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: notificationsData, isLoading } = useNotifications({
    page: 1,
    limit: 15,
  });

  const markAsRead = useMarkAsRead();
  const markAllAsRead = useMarkAllAsRead();

  // Close on outside click
  const handleClickOutside = useCallback(
    (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, handleClickOutside]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const handleNavigate = useCallback(
    (notification: NotificationItem) => {
      // Mark as read
      if (!notification.isRead) {
        markAsRead.mutate(notification.id);
      }

      // Navigate to the task if available
      if (notification.taskId) {
        router.push(`/tasks/${notification.taskId}`);
      }

      onClose();
    },
    [markAsRead, router, onClose]
  );

  const handleMarkAllRead = useCallback(() => {
    markAllAsRead.mutate();
  }, [markAllAsRead]);

  if (!isOpen) return null;

  const items = notificationsData?.data || [];
  const hasNotifications = items.length > 0;

  return (
    <div
      ref={dropdownRef}
      className="absolute top-full right-0 mt-2 w-80 sm:w-96 bg-surface rounded-card border border-border shadow-lg z-50 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-body font-semibold text-foreground">Уведомления</h3>
        {hasNotifications && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="text-xs text-primary hover:text-primary/80 transition-colors"
            disabled={markAllAsRead.isPending}
          >
            {markAllAsRead.isPending ? 'Отмечаем...' : 'Прочитать все'}
          </button>
        )}
      </div>

      {/* Content */}
      <div className="max-h-96 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="w-4 h-4 rounded bg-border" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 bg-border rounded w-3/4" />
                  <div className="h-3 bg-border rounded w-full" />
                  <div className="h-2.5 bg-border rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : !hasNotifications ? (
          <div className="px-4 py-8 text-center">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 mx-auto text-text-secondary/50 mb-2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
            </svg>
            <p className="text-small text-text-secondary">Нет уведомлений</p>
          </div>
        ) : (
          items.map((notification) => (
            <NotificationItemRow
              key={notification.id}
              notification={notification}
              onNavigate={handleNavigate}
            />
          ))
        )}
      </div>
    </div>
  );
}
