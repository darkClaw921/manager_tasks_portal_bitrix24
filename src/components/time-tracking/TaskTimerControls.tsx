'use client';

import { useState } from 'react';
import {
  useTaskTimeTracking,
  useStartTimer,
  useStopTimer,
  useDeleteTimeEntry,
  useElapsedTime,
  formatDuration,
} from '@/hooks/useTimeTracking';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

// ==================== Icons ====================

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className || 'w-4 h-4'}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
    </svg>
  );
}

function StopIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className || 'w-4 h-4'}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 0 1 7.5 5.25h9a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25h-9a2.25 2.25 0 0 1-2.25-2.25v-9Z" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className || 'w-4 h-4'}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className || 'w-4 h-4'}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

function ChevronUpIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className || 'w-4 h-4'}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
    </svg>
  );
}

// ==================== Sub-components ====================

function LiveTimer({ startedAt }: { startedAt: string }) {
  const elapsed = useElapsedTime(startedAt);
  return (
    <span className="text-lg font-mono text-primary">{elapsed}</span>
  );
}

function formatEntryDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ==================== Loading Skeleton ====================

function TimerSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-3 bg-border rounded w-1/3" />
      <div className="h-8 bg-border rounded w-24" />
      <div className="h-3 bg-border rounded w-1/2" />
    </div>
  );
}

// ==================== Main Component ====================

export interface TaskTimerControlsProps {
  taskId: number;
}

export function TaskTimerControls({ taskId }: TaskTimerControlsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const { data: tracking, isLoading } = useTaskTimeTracking(taskId);
  const startTimer = useStartTimer();
  const stopTimer = useStopTimer();
  const deleteEntry = useDeleteTimeEntry();

  if (isLoading) {
    return (
      <div className="border-t border-border pt-3">
        <p className="text-xs text-text-muted mb-2">Трекинг времени</p>
        <TimerSkeleton />
      </div>
    );
  }

  if (!tracking) return null;

  const { activeEntry, totalDuration, entries } = tracking;
  const completedEntries = entries.filter((e) => e.stoppedAt !== null);
  const hasHistory = completedEntries.length > 0;

  return (
    <div className="border-t border-border pt-3">
      {/* Section header */}
      <p className="text-xs text-text-muted mb-2">Трекинг времени</p>

      {/* Active timer or start button */}
      <div className="flex items-center gap-3 mb-2">
        {activeEntry ? (
          <>
            <LiveTimer startedAt={activeEntry.startedAt} />
            <Button
              variant="danger"
              size="sm"
              onClick={() => stopTimer.mutate(taskId)}
              loading={stopTimer.isPending}
              disabled={stopTimer.isPending}
            >
              <StopIcon />
              Стоп
            </Button>
          </>
        ) : (
          <Button
            variant="primary"
            size="sm"
            onClick={() => startTimer.mutate(taskId)}
            loading={startTimer.isPending}
            disabled={startTimer.isPending}
          >
            <PlayIcon />
            Старт
          </Button>
        )}
      </div>

      {/* Total accumulated time */}
      <p className="text-small text-text-secondary mb-2">
        Всего: <span className="font-mono">{formatDuration(totalDuration)}</span>
      </p>

      {/* Expandable history */}
      {hasHistory && (
        <div>
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
          >
            {isExpanded ? <ChevronUpIcon className="w-3.5 h-3.5" /> : <ChevronDownIcon className="w-3.5 h-3.5" />}
            История сессий ({completedEntries.length})
          </button>

          {isExpanded && (
            <div className="mt-2 space-y-1.5">
              {completedEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-input bg-background"
                >
                  <div className="min-w-0">
                    <p className="text-xs text-text-secondary">
                      {formatEntryDate(entry.startedAt)}
                    </p>
                    <p className="text-xs font-mono text-foreground">
                      {entry.duration !== null
                        ? formatDuration(entry.duration)
                        : 'в процессе'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteEntry.mutate(entry.id)}
                    disabled={deleteEntry.isPending}
                    className={cn(
                      'p-1 rounded-input text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors shrink-0',
                      deleteEntry.isPending && 'opacity-50 cursor-not-allowed'
                    )}
                    aria-label="Удалить запись"
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
