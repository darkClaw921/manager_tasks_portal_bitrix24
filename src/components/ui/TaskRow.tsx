'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { PortalIndicator } from './PortalIndicator';
import { Badge } from './Badge';
import { Avatar } from './Avatar';

export interface TaskRowData {
  id: number;
  title: string;
  status: string;
  priority: string;
  deadline: string | null;
  responsibleName: string | null;
  responsiblePhoto: string | null;
  portalColor: string;
  portalName: string;
}

export interface TaskRowProps {
  task: TaskRowData;
  className?: string;
  onClick?: (taskId: number) => void;
}

const statusLabels: Record<string, string> = {
  NEW: 'Новая',
  PENDING: 'Ожидает',
  IN_PROGRESS: 'В работе',
  SUPPOSEDLY_COMPLETED: 'Условно завершена',
  COMPLETED: 'Завершена',
  DEFERRED: 'Отложена',
};

const statusVariants: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'primary'> = {
  NEW: 'primary',
  PENDING: 'warning',
  IN_PROGRESS: 'primary',
  SUPPOSEDLY_COMPLETED: 'warning',
  COMPLETED: 'success',
  DEFERRED: 'default',
};

const priorityLabels: Record<string, string> = {
  '0': 'Низкий',
  '1': 'Средний',
  '2': 'Высокий',
};

const priorityVariants: Record<string, 'default' | 'success' | 'warning' | 'danger'> = {
  '0': 'default',
  '1': 'warning',
  '2': 'danger',
};

function isOverdue(deadline: string | null): boolean {
  if (!deadline) return false;
  const deadlineDate = new Date(deadline);
  return deadlineDate < new Date() && !isNaN(deadlineDate.getTime());
}

function formatDeadline(deadline: string): string {
  const date = new Date(deadline);
  if (isNaN(date.getTime())) return deadline;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const deadlineDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((deadlineDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Сегодня';
  if (diffDays === 1) return 'Завтра';
  if (diffDays === -1) return 'Вчера';

  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
  });
}

export function TaskRow({ task, className, onClick }: TaskRowProps) {
  const overdue = isOverdue(task.deadline);

  const sharedClassName = cn(
    'flex items-center gap-3 px-4 py-3 rounded-card border border-transparent bg-surface transition-colors hover:bg-background hover:border-border group cursor-pointer',
    className
  );

  const content = (
    <>
      {/* Portal indicator */}
      <PortalIndicator color={task.portalColor} size="sm" />

      {/* Title */}
      <span className="flex-1 text-body text-foreground font-medium truncate group-hover:text-primary transition-colors">
        {task.title}
      </span>

      {/* Priority badge */}
      <Badge variant={priorityVariants[task.priority] ?? 'default'} size="sm" className="hidden sm:inline-flex">
        {priorityLabels[task.priority] ?? task.priority}
      </Badge>

      {/* Status badge */}
      <Badge variant={statusVariants[task.status] ?? 'default'} size="sm" className="hidden md:inline-flex">
        {statusLabels[task.status] ?? task.status}
      </Badge>

      {/* Responsible avatar */}
      {task.responsibleName && (
        <Avatar name={task.responsibleName} src={task.responsiblePhoto} size="sm" className="hidden sm:flex" />
      )}

      {/* Deadline */}
      {task.deadline && (
        <span
          className={cn(
            'text-small whitespace-nowrap shrink-0',
            overdue ? 'text-danger font-medium' : 'text-text-secondary'
          )}
        >
          {formatDeadline(task.deadline)}
        </span>
      )}
    </>
  );

  if (onClick) {
    return (
      <div
        role="button"
        tabIndex={0}
        className={sharedClassName}
        onClick={() => onClick(task.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick(task.id);
          }
        }}
      >
        {content}
      </div>
    );
  }

  return (
    <Link href={`/tasks/${task.id}`} className={sharedClassName}>
      {content}
    </Link>
  );
}
