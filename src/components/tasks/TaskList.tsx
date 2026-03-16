'use client';

import { useState, useMemo, useCallback } from 'react';
import { useTasks } from '@/hooks/useTasks';
import { usePortals } from '@/hooks/usePortals';
import { usePortalStore } from '@/stores/portal-store';
import { TaskRow } from '@/components/ui/TaskRow';
import { SearchInput } from '@/components/ui/SearchInput';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { PortalIndicator } from '@/components/ui/PortalIndicator';
import { cn } from '@/lib/utils';
import type { TaskFilters } from '@/types';

const STATUS_TABS = [
  { value: '', label: 'Все' },
  { value: 'NEW', label: 'Новые' },
  { value: 'IN_PROGRESS', label: 'В работе' },
  { value: 'COMPLETED', label: 'Завершены' },
  { value: 'DEFERRED', label: 'Отложены' },
] as const;

export interface TaskListProps {
  className?: string;
}

export function TaskList({ className }: TaskListProps) {
  const { activePortalId, setActivePortalId } = usePortalStore();
  const { data: portals } = usePortals();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  const filters: TaskFilters = useMemo(() => ({
    portalId: activePortalId || undefined,
    status: statusFilter || undefined,
    search: search || undefined,
    page: currentPage,
    limit: pageSize,
  }), [activePortalId, statusFilter, search, currentPage]);

  const { data, isLoading, isError } = useTasks(filters);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setCurrentPage(1);
  }, []);

  const handleStatusChange = useCallback((status: string) => {
    setStatusFilter(status);
    setCurrentPage(1);
  }, []);

  const handlePortalChange = useCallback((portalId: number | null) => {
    setActivePortalId(portalId);
    setCurrentPage(1);
  }, [setActivePortalId]);

  const tasks = data?.data || [];
  const totalPages = data?.totalPages || 0;
  const total = data?.total || 0;

  return (
    <div className={cn('space-y-4', className)}>
      {/* Search */}
      <SearchInput
        value={search}
        onChange={handleSearchChange}
        placeholder="Поиск задач..."
      />

      {/* Portal filter */}
      {portals && portals.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handlePortalChange(null)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-badge text-small font-medium transition-colors',
              activePortalId === null
                ? 'bg-primary text-white'
                : 'bg-background text-text-secondary border border-border hover:bg-surface'
            )}
          >
            Все порталы
          </button>
          {portals.map((portal) => (
            <button
              key={portal.id}
              type="button"
              onClick={() => handlePortalChange(portal.id)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-badge text-small font-medium transition-colors',
                activePortalId === portal.id
                  ? 'bg-primary text-white'
                  : 'bg-background text-text-secondary border border-border hover:bg-surface'
              )}
            >
              <PortalIndicator color={portal.color} size="sm" />
              {portal.name || portal.domain}
            </button>
          ))}
        </div>
      )}

      {/* Status tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => handleStatusChange(tab.value)}
            className={cn(
              'px-3 py-1.5 rounded-badge text-small font-medium transition-colors',
              statusFilter === tab.value
                ? 'bg-primary text-white'
                : 'bg-background text-text-secondary border border-border hover:bg-surface'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Results summary */}
      <div className="flex items-center justify-between">
        <p className="text-small text-text-secondary">
          {isLoading ? 'Загрузка...' : `${total} задач`}
        </p>
      </div>

      {/* Task list */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="animate-pulse flex items-center gap-3 px-4 py-3 rounded-card bg-surface">
              <div className="w-2.5 h-2.5 rounded-full bg-border" />
              <div className="flex-1 h-4 bg-border rounded" />
              <div className="w-16 h-5 bg-border rounded-badge hidden sm:block" />
              <div className="w-20 h-5 bg-border rounded-badge hidden md:block" />
              <div className="w-8 h-8 bg-border rounded-full hidden sm:block" />
              <div className="w-16 h-4 bg-border rounded" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="text-center py-12">
          <p className="text-danger text-body">Не удалось загрузить задачи</p>
          <p className="text-text-secondary text-small mt-1">Попробуйте обновить страницу</p>
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12">
          <svg
            className="mx-auto w-12 h-12 text-text-muted mb-3"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z"
            />
          </svg>
          <p className="text-text-secondary text-body font-medium">Задач не найдено</p>
          <p className="text-text-muted text-small mt-1">
            {search ? 'Попробуйте изменить параметры поиска' : 'Синхронизируйте портал для загрузки задач'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={{
                id: task.id,
                title: task.title,
                status: task.status,
                priority: task.priority,
                deadline: task.deadline,
                responsibleName: task.responsibleName,
                portalColor: task.portalColor,
                portalName: task.portalName,
              }}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          >
            Назад
          </Button>
          <span className="text-small text-text-secondary">
            {currentPage} / {totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
          >
            Вперёд
          </Button>
        </div>
      )}
    </div>
  );
}
