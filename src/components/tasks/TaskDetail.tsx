'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { useTask, type TaskDetail as TaskDetailType } from '@/hooks/useTask';
import { useUpdateTask, useStartTask, useCompleteTask, useDeleteTask, useRenewTask } from '@/hooks/useTasks';
import { useBitrixMappings } from '@/hooks/usePortalSettings';
import { useUsers } from '@/hooks/useUsers';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { PortalIndicator } from '@/components/ui/PortalIndicator';
import { useToast } from '@/components/ui/Toast';
import { Comments } from './Comments';
import { Checklist } from './Checklist';
import { Files } from './Files';
import { TaskRateWidget } from './TaskRateWidget';
import { TaskTimerControls } from '@/components/time-tracking';
import { useTaskTimeTracking } from '@/hooks/useTimeTracking';
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

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className || 'w-4 h-4'}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className || 'w-4 h-4'}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className || 'w-3 h-3'}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}

/** Generic option shape used by the reusable user picker */
interface PickerOption {
  id: string;
  name: string;
}

/** Reusable user picker for accomplices/auditors */
function UserPicker({
  label,
  selectedIds,
  options,
  emptyHint,
  showPicker,
  onTogglePicker,
  onAdd,
  onRemove,
}: {
  label: string;
  selectedIds: string[];
  options: PickerOption[];
  /** Text shown inside the picker dropdown when options list is empty */
  emptyHint: string;
  showPicker: boolean;
  onTogglePicker: () => void;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showPicker) return;
    function handleClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        onTogglePicker();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPicker, onTogglePicker]);

  function getUserName(id: string): string {
    const opt = options.find((o) => o.id === id);
    if (opt) return opt.name;
    return `ID: ${id}`;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-text-muted">{label}</p>
        <button
          type="button"
          onClick={onTogglePicker}
          className="p-0.5 rounded hover:bg-border transition-colors text-text-muted hover:text-foreground"
          title={`Добавить ${label.toLowerCase()}`}
        >
          <PlusIcon className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {selectedIds.length === 0 && !showPicker && (
          <span className="text-small text-text-secondary">Не назначены</span>
        )}
        {selectedIds.map((id) => (
          <span
            key={id}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-background text-small text-foreground border border-border"
          >
            {getUserName(id)}
            <button
              type="button"
              onClick={() => onRemove(id)}
              className="p-0.5 rounded-full hover:bg-danger/10 hover:text-danger transition-colors"
              title="Удалить"
            >
              <CloseIcon className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      {showPicker && (
        <div ref={pickerRef} className="mt-2 rounded-card border border-border bg-surface shadow-lg max-h-48 overflow-y-auto">
          {options.length === 0 ? (
            <p className="p-3 text-small text-text-muted text-center">{emptyHint}</p>
          ) : (
            options.map((o) => {
              const isSelected = selectedIds.includes(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => isSelected ? onRemove(o.id) : onAdd(o.id)}
                  className={cn(
                    'w-full text-left px-3 py-2 text-small transition-colors hover:bg-border/50',
                    isSelected && 'bg-primary/10 text-primary font-medium'
                  )}
                >
                  <span>{o.name}</span>
                  {isSelected && <span className="ml-1 text-xs">(выбран)</span>}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export function TaskDetail({ taskId }: TaskDetailProps) {
  const { data: task, isLoading, isError } = useTask(taskId);
  const { data: timeTrackingData } = useTaskTimeTracking(taskId);
  const startTask = useStartTask();
  const completeTask = useCompleteTask();
  const deleteTask = useDeleteTask();
  const updateTask = useUpdateTask();
  const renewTask = useRenewTask();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { toast } = useToast();

  // Title editing state
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');

  // Description editing state
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionValue, setDescriptionValue] = useState('');

  // Accomplices/auditors picker state
  const [showAccomplicesPicker, setShowAccomplicesPicker] = useState(false);
  const [showAuditorsPicker, setShowAuditorsPicker] = useState(false);

  // Bitrix mappings for user name resolution
  const { data: mappingsData } = useBitrixMappings(task?.portalId ?? null);

  // App users (used when task belongs to the local portal)
  const { data: appUsersData } = useUsers();

  // isLocal is driven by portalDomain joined into the task payload by the API
  const isLocal = task?.portalDomain === 'local';

  // Current viewer's admin flag — used to expose the "rates for other
  // participants" section in the sidebar. Fetched once on mount.
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setIsAdmin(!!d?.user?.isAdmin);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Resolve all participants of the task to app-user ids so admin can set
  // their rates. For local portal the *Id fields already are app user ids
  // (stringified); for bitrix portal we reverse-lookup via user_bitrix_mappings.
  const participantAppUsers = useMemo<Array<{ id: number; name: string }>>(() => {
    if (!task) return [];
    const bitrixIds = new Set<string>();
    if (task.responsibleId) bitrixIds.add(String(task.responsibleId));
    if (task.creatorId) bitrixIds.add(String(task.creatorId));
    for (const a of task.accomplices ?? []) bitrixIds.add(String(a));
    for (const a of task.auditors ?? []) bitrixIds.add(String(a));

    const out = new Map<number, string>();
    if (isLocal) {
      for (const id of bitrixIds) {
        const appId = parseInt(id, 10);
        if (!Number.isFinite(appId) || appId <= 0) continue;
        const u = (appUsersData || []).find((x) => x.id === appId);
        const name = u
          ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email
          : `user#${appId}`;
        out.set(appId, name);
      }
    } else {
      for (const id of bitrixIds) {
        const m = (mappingsData || []).find((x) => x.bitrixUserId === id);
        if (!m) continue;
        const name =
          m.bitrixName ||
          `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() ||
          id;
        out.set(m.userId, name);
      }
    }
    return Array.from(out.entries()).map(([id, name]) => ({ id, name }));
  }, [task, isLocal, appUsersData, mappingsData]);

  // Build a uniform options list for the UserPicker
  const pickerOptions = useMemo(() => {
    if (isLocal) {
      return (appUsersData || []).map((u) => {
        const name = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email;
        return { id: String(u.id), name };
      });
    }
    return (mappingsData || []).map((m) => {
      const name = m.bitrixName || `${m.firstName} ${m.lastName}`.trim() || m.bitrixUserId;
      return { id: m.bitrixUserId, name };
    });
  }, [isLocal, appUsersData, mappingsData]);

  const pickerEmptyHint = isLocal
    ? 'Нет доступных пользователей'
    : 'Нет замапленных пользователей';

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
  const accomplices: string[] = Array.isArray(task.accomplices) ? task.accomplices : [];
  const auditors: string[] = Array.isArray(task.auditors) ? task.auditors : [];

  // ==================== Handlers ====================

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

  // Title editing
  function handleStartEditTitle() {
    setEditingTitle(true);
    setTitleValue(task!.title);
  }

  function handleSaveTitle() {
    const trimmed = titleValue.trim();
    if (!trimmed) {
      toast('error', 'Заголовок не может быть пустым');
      return;
    }
    if (trimmed === task!.title) {
      setEditingTitle(false);
      return;
    }
    updateTask.mutate(
      { id: taskId, data: { title: trimmed } },
      {
        onSuccess: () => {
          setEditingTitle(false);
          toast('success', 'Заголовок обновлён');
        },
        onError: (err) => {
          toast('error', err.message || 'Ошибка при обновлении заголовка');
        },
      }
    );
  }

  function handleTitleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveTitle();
    } else if (e.key === 'Escape') {
      setEditingTitle(false);
    }
  }

  // Description editing
  function handleStartEditDescription() {
    setEditingDescription(true);
    setDescriptionValue(task!.description || '');
  }

  function handleSaveDescription() {
    updateTask.mutate(
      { id: taskId, data: { description: descriptionValue } },
      {
        onSuccess: () => {
          setEditingDescription(false);
          toast('success', 'Описание обновлено');
        },
        onError: (err) => {
          toast('error', err.message || 'Ошибка при обновлении описания');
        },
      }
    );
  }

  function handleCancelEditDescription() {
    setEditingDescription(false);
  }

  // Accomplices editing
  function handleAddAccomplice(id: string) {
    const newList = [...accomplices, id];
    updateTask.mutate(
      { id: taskId, data: { accomplices: newList } },
      {
        onSuccess: () => toast('success', 'Участник добавлен'),
        onError: (err) => toast('error', err.message || 'Ошибка'),
      }
    );
  }

  function handleRemoveAccomplice(id: string) {
    const newList = accomplices.filter(a => a !== id);
    updateTask.mutate(
      { id: taskId, data: { accomplices: newList } },
      {
        onSuccess: () => toast('success', 'Участник удалён'),
        onError: (err) => toast('error', err.message || 'Ошибка'),
      }
    );
  }

  // Auditors editing
  function handleAddAuditor(id: string) {
    const newList = [...auditors, id];
    updateTask.mutate(
      { id: taskId, data: { auditors: newList } },
      {
        onSuccess: () => toast('success', 'Наблюдатель добавлен'),
        onError: (err) => toast('error', err.message || 'Ошибка'),
      }
    );
  }

  function handleRemoveAuditor(id: string) {
    const newList = auditors.filter(a => a !== id);
    updateTask.mutate(
      { id: taskId, data: { auditors: newList } },
      {
        onSuccess: () => toast('success', 'Наблюдатель удалён'),
        onError: (err) => toast('error', err.message || 'Ошибка'),
      }
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
            {editingTitle ? (
              <input
                type="text"
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                onKeyDown={handleTitleKeyDown}
                onBlur={handleSaveTitle}
                autoFocus
                className="w-full text-h2 font-bold text-foreground bg-transparent border-b-2 border-primary outline-none py-0.5"
              />
            ) : (
              <div className="flex items-center gap-2 group">
                <h1 className="text-h2 font-bold text-foreground">{task.title}</h1>
                <button
                  type="button"
                  onClick={handleStartEditTitle}
                  className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-border transition-all text-text-muted hover:text-foreground"
                  title="Редактировать заголовок"
                >
                  <PencilIcon className="w-4 h-4" />
                </button>
              </div>
            )}
            <p className="text-small text-text-secondary mt-1 flex items-center gap-2 flex-wrap">
              <span>
                {task.portalName || task.portalDomain}
                {isLocal ? '' : task.bitrixTaskId ? ` / #${task.bitrixTaskId}` : ''}
              </span>
              {isLocal && (
                <Badge variant="primary" size="sm">Локальная</Badge>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-6">
          {/* Description */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-h3 font-semibold text-foreground">Описание</h3>
              {!editingDescription && (
                <button
                  type="button"
                  onClick={handleStartEditDescription}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-small text-text-muted hover:text-foreground hover:bg-border transition-colors"
                >
                  <PencilIcon className="w-3.5 h-3.5" />
                  <span>Редактировать</span>
                </button>
              )}
            </div>
            {editingDescription ? (
              <div className="space-y-2">
                <textarea
                  value={descriptionValue}
                  onChange={(e) => setDescriptionValue(e.target.value)}
                  rows={8}
                  className="w-full rounded-card border border-border bg-background p-3 text-body text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-y min-h-[120px]"
                  placeholder="Описание задачи..."
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleSaveDescription}
                    loading={updateTask.isPending}
                  >
                    Сохранить
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleCancelEditDescription}
                  >
                    Отмена
                  </Button>
                </div>
              </div>
            ) : (
              (task.description || task.descriptionHtml) ? (
                <div
                  className="prose prose-sm max-w-none text-body text-text-secondary rounded-card bg-background p-4 [&_a]:text-primary [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-2 [&_br]:block"
                  dangerouslySetInnerHTML={{
                    __html: sanitizeHtml(task.descriptionHtml || task.description || ''),
                  }}
                />
              ) : (
                <p className="text-small text-text-muted rounded-card bg-background p-4">Описание не указано</p>
              )
            )}
          </div>

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

            {/* Time Tracking */}
            <div className="pt-3 border-t border-border">
              <TaskTimerControls taskId={task.id} />
            </div>

            {/* Accomplices */}
            <UserPicker
              label="Участники"
              selectedIds={accomplices}
              options={pickerOptions}
              emptyHint={pickerEmptyHint}
              showPicker={showAccomplicesPicker}
              onTogglePicker={() => setShowAccomplicesPicker(!showAccomplicesPicker)}
              onAdd={handleAddAccomplice}
              onRemove={handleRemoveAccomplice}
            />

            {/* Auditors */}
            <UserPicker
              label="Наблюдатели"
              selectedIds={auditors}
              options={pickerOptions}
              emptyHint={pickerEmptyHint}
              showPicker={showAuditorsPicker}
              onTogglePicker={() => setShowAuditorsPicker(!showAuditorsPicker)}
              onAdd={handleAddAuditor}
              onRemove={handleRemoveAuditor}
            />

            {/* Ставка / Оплата */}
            <div className="pt-3 border-t border-zinc-700">
              <h4 className="text-xs font-medium text-zinc-400 mb-2">Ставка</h4>
              <TaskRateWidget taskId={task.id} timeSpent={task.timeSpent} trackedTime={timeTrackingData?.totalDuration ?? null} />
            </div>

            {/* Admin-only: set rates for other participants of this task. */}
            {isAdmin && participantAppUsers.length > 0 && (
              <div className="pt-3 border-t border-zinc-700">
                <h4 className="text-xs font-medium text-zinc-400 mb-2">Ставки участников</h4>
                <div className="space-y-4">
                  {participantAppUsers.map((u) => (
                    <div key={u.id} className="space-y-1">
                      <p className="text-xs text-text-muted">{u.name}</p>
                      <TaskRateWidget
                        taskId={task.id}
                        timeSpent={task.timeSpent}
                        trackedTime={timeTrackingData?.totalDuration ?? null}
                        targetUserId={u.id}
                        targetUserName={u.name}
                      />
                    </div>
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
            {(task.status === 'COMPLETED' || task.status === 'DEFERRED' || task.status === 'SUPPOSEDLY_COMPLETED') && (
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => renewTask.mutate(taskId)}
                loading={renewTask.isPending}
              >
                Возобновить
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
