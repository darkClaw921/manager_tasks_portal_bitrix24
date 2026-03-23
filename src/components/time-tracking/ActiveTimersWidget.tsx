'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useActiveTimers, useStopTimer, useElapsedTime } from '@/hooks/useTimeTracking';
import { PortalIndicator } from '@/components/ui/PortalIndicator';
import { cn } from '@/lib/utils';
import type { ActiveTimerEntry } from '@/types';

// ==================== Icons ====================

function ClockIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
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

// ==================== Timer Row ====================

function TimerRow({
  entry,
  onStop,
  onNavigate,
  isStopping,
}: {
  entry: ActiveTimerEntry;
  onStop: (taskId: number) => void;
  onNavigate: (taskId: number) => void;
  isStopping: boolean;
}) {
  const elapsed = useElapsedTime(entry.startedAt);

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-background transition-colors border-b border-border last:border-b-0">
      {/* Clickable area: portal indicator + task info */}
      <button
        type="button"
        onClick={() => onNavigate(entry.taskId)}
        className="flex items-center gap-3 flex-1 min-w-0 text-left"
      >
        <PortalIndicator color={entry.portalColor} size="sm" />
        <div className="flex-1 min-w-0">
          <p className="text-small text-foreground truncate max-w-[200px]">
            {entry.taskTitle}
          </p>
          <p className="text-xs text-text-secondary truncate">
            {entry.portalName}
          </p>
        </div>
      </button>

      {/* Live elapsed time */}
      <span className="text-small font-mono text-primary shrink-0">
        {elapsed}
      </span>

      {/* Stop button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onStop(entry.taskId);
        }}
        disabled={isStopping}
        className={cn(
          'p-1.5 rounded-input text-danger hover:bg-danger/10 transition-colors shrink-0',
          isStopping && 'opacity-50 cursor-not-allowed'
        )}
        aria-label="Остановить таймер"
      >
        <StopIcon />
      </button>
    </div>
  );
}

// ==================== Main Widget ====================

export function ActiveTimersWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const { data: activeTimers = [], isLoading } = useActiveTimers();
  const stopTimer = useStopTimer();

  const timerCount = activeTimers.length;

  // Close on outside click
  const handleClickOutside = useCallback(
    (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    },
    []
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
      if (e.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const handleStop = useCallback(
    (taskId: number) => {
      stopTimer.mutate(taskId);
    },
    [stopTimer]
  );

  const handleNavigate = useCallback(
    (taskId: number) => {
      router.push(`/tasks/${taskId}`);
      setIsOpen(false);
    },
    [router]
  );

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={handleToggle}
        className="relative p-2 text-text-secondary hover:text-foreground transition-colors rounded-input hover:bg-background"
        aria-label="Активные таймеры"
      >
        <ClockIcon />
        {timerCount > 0 && (
          <span className="absolute top-1 right-1 flex items-center justify-center w-4 h-4 rounded-full bg-danger text-[10px] font-bold text-white">
            {timerCount > 9 ? '9+' : timerCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-80 sm:w-96 bg-surface rounded-card border border-border shadow-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-body font-semibold text-foreground">
              Активные таймеры
            </h3>
          </div>

          {/* Content */}
          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="flex gap-3 animate-pulse">
                    <div className="w-2.5 h-2.5 rounded-full bg-border mt-1.5" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3.5 bg-border rounded w-3/4" />
                      <div className="h-2.5 bg-border rounded w-1/3" />
                    </div>
                    <div className="h-3.5 bg-border rounded w-16" />
                  </div>
                ))}
              </div>
            ) : timerCount === 0 ? (
              <div className="px-4 py-8 text-center">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 mx-auto text-text-secondary/50 mb-2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                <p className="text-small text-text-secondary">Нет активных таймеров</p>
              </div>
            ) : (
              activeTimers.map((entry) => (
                <TimerRow
                  key={entry.id}
                  entry={entry}
                  onStop={handleStop}
                  onNavigate={handleNavigate}
                  isStopping={stopTimer.isPending}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
