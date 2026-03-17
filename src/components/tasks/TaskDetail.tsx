'use client';

import { useTask, type TaskDetail as TaskDetailType } from '@/hooks/useTask';
import { useUpdateTask, useStartTask, useCompleteTask, useDeleteTask } from '@/hooks/useTasks';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { PortalIndicator } from '@/components/ui/PortalIndicator';
import { Comments } from './Comments';
import { Checklist } from './Checklist';
import { Files } from './Files';
import { cn } from '@/lib/utils';
import { sanitizeHtml } from '@/lib/utils/sanitize';

export interface TaskDetailProps {
  taskId: number;
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

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Не указано';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTimeEstimate(seconds: number | null): string {
  if (!seconds) return 'Не указано';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0 && minutes > 0) return `${hours}ч ${minutes}м`;
  if (hours > 0) return `${hours}ч`;
  return `${minutes}м`;
}

function isOverdue(deadline: string | null, status: string): boolean {
  if (!deadline) return false;
  if (status === 'COMPLETED' || status === 'DEFERRED') return false;
  return new Date(deadline) < new Date();
}

function BackIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
    </svg>
  );
}

export function TaskDetail({ taskId }: TaskDetailProps) {
  const { data: task, isLoading, isError } = useTask(taskId);
  const startTask = useStartTask();
  const completeTask = useCompleteTask();
  const deleteTask = useDeleteTask();
  const updateTask = useUpdateTask();
  const queryClient = useQueryClient();
  const router = useRouter();

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-border rounded w-2/3" />
        <div className="h-4 bg-border rounded w-1/2" />
        <div className="h-32 bg-border rounded" />
      </div>
    );
  }

  if (isError || !task) {
    return (
      <div className="text-center py-12">
        <p className="text-danger text-body font-medium">Задача не найдена</p>
        <p className="text-text-secondary text-small mt-1">Задача была удалена или у вас нет доступа</p>
        <Button
          variant="secondary"
          size="sm"
          className="mt-4"
          onClick={() => router.push('/dashboard')}
        >
          Вернуться на Dashboard
        </Button>
      </div>
    );
  }

  const overdue = isOverdue(task.deadline, task.status);
  const tags = Array.isArray(task.tags) ? task.tags : [];
  const accomplices = Array.isArray(task.accomplices) ? task.accomplices : [];
  const auditors = Array.isArray(task.auditors) ? task.auditors : [];

  function handleStart() {
    startTask.mutate(taskId);
  }

  function handleComplete() {
    completeTask.mutate(taskId);
  }

  function handleDelete() {
    if (confirm('Удалить задачу? Это действие нельзя отменить.')) {
      deleteTask.mutate(taskId, {
        onSuccess: () => router.push('/dashboard'),
      });
    }
  }

  function handleToggleAiExclude() {
    updateTask.mutate(
      { id: taskId, data: { excludeFromAi: !task?.excludeFromAi } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: ['task', taskId] }) }
    );
  }

  return (
    <div className="space-y-6">
      {/* Back button + title */}
      <div>
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-text-secondary hover:text-foreground transition-colors mb-3"
        >
          <BackIcon />
          <span className="text-small">Назад</span>
        </button>

        <div className="flex items-start gap-3">
          <PortalIndicator color={task.portalColor} size="md" className="mt-1.5" />
          <div className="flex-1 min-w-0">
            <h1 className="text-h2 font-bold text-foreground">{task.title}</h1>
            <p className="text-small text-text-secondary mt-1">
              {task.portalName || task.portalDomain}
              {task.bitrixTaskId && ` / #${task.bitrixTaskId}`}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-6">
          {/* Description */}
          {(task.description || task.descriptionHtml) && (
            <div className="space-y-2">
              <h3 className="text-h3 font-semibold text-foreground">Описание</h3>
              <div
                className="prose prose-sm max-w-none text-body text-text-secondary rounded-card bg-background p-4 [&_a]:text-primary [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-2 [&_br]:block"
                dangerouslySetInnerHTML={{
                  __html: sanitizeHtml(task.descriptionHtml || task.description || ''),
                }}
              />
            </div>
          )}

          {/* Tags */}
          {tags.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-h3 font-semibold text-foreground">Теги</h3>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag: string | { id?: number; title?: string }, i: number) => (
                  <Badge key={i} variant="default" size="sm">
                    {typeof tag === 'string' ? tag : tag.title || ''}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Checklist */}
          <Checklist
            taskId={taskId}
            items={task.checklist || []}
          />

          {/* Comments */}
          <Comments
            taskId={taskId}
            comments={task.comments || []}
          />

          {/* Files */}
          <Files files={task.files || []} />
        </div>

        {/* Right sidebar */}
        <div className="lg:w-80 shrink-0 space-y-4">
          <div className="rounded-card border border-border bg-surface p-4 space-y-4">
            {/* Status */}
            <div>
              <p className="text-xs text-text-muted mb-1">Статус</p>
              <Badge
                variant={statusVariants[task.status] ?? 'default'}
                size="md"
              >
                {statusLabels[task.status] ?? task.status}
              </Badge>
            </div>

            {/* Priority */}
            <div>
              <p className="text-xs text-text-muted mb-1">Приоритет</p>
              <Badge
                variant={priorityVariants[task.priority] ?? 'default'}
                size="md"
              >
                {priorityLabels[task.priority] ?? task.priority}
              </Badge>
            </div>

            {/* Responsible */}
            <div>
              <p className="text-xs text-text-muted mb-1">Ответственный</p>
              <div className="flex items-center gap-2">
                {task.responsibleName && (
                  <Avatar name={task.responsibleName} src={task.responsiblePhoto} size="sm" />
                )}
                <span className="text-body text-foreground">
                  {task.responsibleName || 'Не назначен'}
                </span>
              </div>
            </div>

            {/* Creator */}
            <div>
              <p className="text-xs text-text-muted mb-1">Постановщик</p>
              <div className="flex items-center gap-2">
                {task.creatorName && (
                  <Avatar name={task.creatorName} src={task.creatorPhoto} size="sm" />
                )}
                <span className="text-body text-foreground">
                  {task.creatorName || 'Неизвестен'}
                </span>
              </div>
            </div>

            {/* Deadline */}
            <div>
              <p className="text-xs text-text-muted mb-1">Крайний срок</p>
              <span
                className={cn(
                  'text-body',
                  overdue ? 'text-danger font-medium' : 'text-foreground'
                )}
              >
                {task.deadline ? formatDate(task.deadline) : 'Не указан'}
                {overdue && ' (просрочена)'}
              </span>
            </div>

            {/* Time estimate */}
            {task.timeEstimate && (
              <div>
                <p className="text-xs text-text-muted mb-1">Оценка времени</p>
                <span className="text-body text-foreground">
                  {formatTimeEstimate(task.timeEstimate)}
                </span>
              </div>
            )}

            {/* Time spent */}
            {task.timeSpent && (
              <div>
                <p className="text-xs text-text-muted mb-1">Затрачено</p>
                <span className="text-body text-foreground">
                  {formatTimeEstimate(task.timeSpent)}
                </span>
              </div>
            )}

            {/* Accomplices */}
            {accomplices.length > 0 && (
              <div>
                <p className="text-xs text-text-muted mb-1">Участники</p>
                <div className="flex flex-wrap gap-1">
                  {accomplices.map((id: string) => (
                    <Badge key={id} variant="default" size="sm">
                      ID: {id}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Auditors */}
            {auditors.length > 0 && (
              <div>
                <p className="text-xs text-text-muted mb-1">Наблюдатели</p>
                <div className="flex flex-wrap gap-1">
                  {auditors.map((id: string) => (
                    <Badge key={id} variant="default" size="sm">
                      ID: {id}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Dates */}
            <div>
              <p className="text-xs text-text-muted mb-1">Создана</p>
              <span className="text-small text-text-secondary">
                {formatDate(task.createdDate)}
              </span>
            </div>

            {task.changedDate && (
              <div>
                <p className="text-xs text-text-muted mb-1">Изменена</p>
                <span className="text-small text-text-secondary">
                  {formatDate(task.changedDate)}
                </span>
              </div>
            )}

            {task.closedDate && (
              <div>
                <p className="text-xs text-text-muted mb-1">Закрыта</p>
                <span className="text-small text-text-secondary">
                  {formatDate(task.closedDate)}
                </span>
              </div>
            )}

            {/* Bitrix24 link */}
            {task.bitrixUrl && (
              <a
                href={task.bitrixUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-primary hover:text-primary/80 text-small font-medium transition-colors"
              >
                <ExternalLinkIcon />
                Открыть в Bitrix24
              </a>
            )}

            {/* AI exclusion toggle */}
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <div>
                <p className="text-xs text-text-muted">Скрыть от AI</p>
                <p className="text-[10px] text-text-muted mt-0.5">Не отправлять в отчёты и чат</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={!!task.excludeFromAi}
                onClick={handleToggleAiExclude}
                className={cn(
                  'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors',
                  task.excludeFromAi ? 'bg-primary' : 'bg-border'
                )}
              >
                <span
                  className={cn(
                    'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform mt-0.5',
                    task.excludeFromAi ? 'translate-x-[18px]' : 'translate-x-0.5'
                  )}
                />
              </button>
            </div>
          </div>

          {/* Action buttons */}
          <div className="space-y-2">
            {task.status !== 'IN_PROGRESS' && task.status !== 'COMPLETED' && (
              <Button
                variant="primary"
                className="w-full"
                onClick={handleStart}
                loading={startTask.isPending}
              >
                Начать задачу
              </Button>
            )}
            {task.status !== 'COMPLETED' && (
              <Button
                variant="secondary"
                className="w-full"
                onClick={handleComplete}
                loading={completeTask.isPending}
              >
                Завершить задачу
              </Button>
            )}
            <Button
              variant="danger"
              className="w-full"
              onClick={handleDelete}
              loading={deleteTask.isPending}
            >
              Удалить задачу
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
