'use client';

import { useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { useUIStore } from '@/stores/ui-store';
import { usePortals } from '@/hooks/usePortals';
import { usePortalStore } from '@/stores/portal-store';
import { PortalIndicator } from '@/components/ui/PortalIndicator';
import { cn } from '@/lib/utils';

const STATUS_OPTIONS = [
  { value: '', label: 'Все статусы' },
  { value: 'NEW', label: 'Новые' },
  { value: 'IN_PROGRESS', label: 'В работе' },
  { value: 'COMPLETED', label: 'Завершены' },
  { value: 'DEFERRED', label: 'Отложены' },
  { value: 'PENDING', label: 'Ожидание' },
] as const;

const PRIORITY_OPTIONS = [
  { value: '', label: 'Все приоритеты' },
  { value: '2', label: 'Высокий' },
  { value: '1', label: 'Средний' },
  { value: '0', label: 'Низкий' },
] as const;

function CloseIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}

export function FiltersModal() {
  const {
    activeModal,
    closeModal,
    globalStatusFilter,
    globalPriorityFilter,
    globalDateFrom,
    globalDateTo,
    setGlobalStatusFilter,
    setGlobalPriorityFilter,
    setGlobalDateFrom,
    setGlobalDateTo,
    clearFilters,
    hasActiveFilters,
  } = useUIStore();

  const { activePortalId, setActivePortalId } = usePortalStore();
  const { data: portals } = usePortals();

  const isOpen = activeModal === 'filters';

  const handleReset = useCallback(() => {
    clearFilters();
    setActivePortalId(null);
  }, [clearFilters, setActivePortalId]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={closeModal}
      />

      {/* Modal */}
      <div className="fixed inset-x-4 top-20 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-lg bg-surface rounded-modal shadow-xl z-50 max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-h3 font-semibold text-foreground">Фильтры</h2>
          <button
            type="button"
            onClick={closeModal}
            className="p-1 text-text-secondary hover:text-foreground transition-colors rounded-input hover:bg-background"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5">
          {/* Portal filter */}
          {portals && portals.length > 0 && (
            <div>
              <label className="block text-small font-medium text-text-secondary mb-2">Портал</label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setActivePortalId(null)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-badge text-small font-medium transition-colors',
                    activePortalId === null
                      ? 'bg-primary text-white'
                      : 'bg-background text-text-secondary border border-border hover:bg-surface'
                  )}
                >
                  Все
                </button>
                {portals.map((portal) => (
                  <button
                    key={portal.id}
                    type="button"
                    onClick={() => setActivePortalId(portal.id)}
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
            </div>
          )}

          {/* Status filter */}
          <div>
            <label className="block text-small font-medium text-text-secondary mb-2">Статус</label>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setGlobalStatusFilter(opt.value)}
                  className={cn(
                    'px-3 py-1.5 rounded-badge text-small font-medium transition-colors',
                    globalStatusFilter === opt.value
                      ? 'bg-primary text-white'
                      : 'bg-background text-text-secondary border border-border hover:bg-surface'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Priority filter */}
          <div>
            <label className="block text-small font-medium text-text-secondary mb-2">Приоритет</label>
            <div className="flex flex-wrap gap-2">
              {PRIORITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setGlobalPriorityFilter(opt.value)}
                  className={cn(
                    'px-3 py-1.5 rounded-badge text-small font-medium transition-colors',
                    globalPriorityFilter === opt.value
                      ? 'bg-primary text-white'
                      : 'bg-background text-text-secondary border border-border hover:bg-surface'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date range */}
          <div>
            <label className="block text-small font-medium text-text-secondary mb-2">Период дедлайна</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-muted mb-1">От</label>
                <input
                  type="date"
                  value={globalDateFrom}
                  onChange={(e) => setGlobalDateFrom(e.target.value)}
                  className="w-full px-3 py-2 rounded-input border border-border bg-surface text-body text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">До</label>
                <input
                  type="date"
                  value={globalDateTo}
                  onChange={(e) => setGlobalDateTo(e.target.value)}
                  className="w-full px-3 py-2 rounded-input border border-border bg-surface text-body text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            disabled={!hasActiveFilters() && activePortalId === null}
          >
            Сбросить
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={closeModal}
          >
            Применить
          </Button>
        </div>
      </div>
    </>
  );
}
