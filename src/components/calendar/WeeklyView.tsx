'use client';

import { useMemo, useState, useCallback } from 'react';
import { useCalendarStore } from '@/stores/calendar-store';
import { usePortalStore } from '@/stores/portal-store';
import { useCalendarTasks } from '@/hooks/useCalendarTasks';
import {
  getWeekRange,
  getTaskTimeBlock,
  resolveOverlaps,
  getDayShortName,
  isToday,
  isWeekend,
  isSameDay,
} from '@/lib/calendar/utils';
import type { CalendarTask } from '@/types';
import { TimeGrid } from './TimeGrid';
import type { TimeGridColumn } from './TimeGrid';
import { TaskBlock } from './TaskBlock';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function CalendarIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function InfoCircleIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAY_TAB_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format date as YYYY-MM-DD (local timezone) */
function toISODateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Build 7 Date objects (Mon–Sun) for the week containing `currentDate` */
function getWeekDays(currentDate: Date): Date[] {
  const { start } = getWeekRange(currentDate);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

// ---------------------------------------------------------------------------
// Skeleton for loading state
// ---------------------------------------------------------------------------

function WeeklyViewSkeleton() {
  return (
    <div className="flex flex-col h-full animate-pulse">
      {/* Header skeleton */}
      <div className="flex shrink-0 border-b border-border bg-surface">
        <div className="shrink-0" style={{ width: 56 }} />
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="flex-1 flex items-center justify-center py-2 border-l border-border">
            <div className="h-4 bg-background rounded w-10" />
          </div>
        ))}
      </div>
      {/* Grid body skeleton */}
      <div className="flex-1 overflow-hidden">
        <div className="flex" style={{ height: 720 }}>
          <div className="shrink-0 border-r border-border" style={{ width: 56 }}>
            {Array.from({ length: 10 }, (_, i) => (
              <div
                key={i}
                className="absolute right-2"
                style={{ top: i * 80 - 6 }}
              >
                <Skeleton className="h-3 w-8" />
              </div>
            ))}
          </div>
          {Array.from({ length: 7 }, (_, col) => (
            <div key={col} className="flex-1 relative border-l border-border">
              {/* Random task skeletons per column */}
              {[1, 2].map((block) => (
                <div
                  key={block}
                  className="absolute left-1 right-1 bg-background rounded"
                  style={{
                    top: (col * 40 + block * 120) % 600,
                    height: 60 + (col * 17 + block * 23) % 40,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile day selector tabs
// ---------------------------------------------------------------------------

interface DayTabsProps {
  days: Date[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

function DayTabs({ days, selectedIndex, onSelect }: DayTabsProps) {
  return (
    <div className="flex border-b border-border bg-surface shrink-0 overflow-x-auto md:hidden">
      {days.map((day, i) => {
        const today = isToday(day);
        const active = i === selectedIndex;

        return (
          <button
            key={toISODateString(day)}
            type="button"
            onClick={() => onSelect(i)}
            className={cn(
              'flex-1 min-w-[52px] flex flex-col items-center gap-0.5 py-2 px-1 text-center transition-colors',
              active
                ? 'border-b-2 border-primary text-primary'
                : 'text-text-secondary',
              today && !active && 'text-primary',
            )}
          >
            <span className="text-[11px] font-medium">{DAY_TAB_LABELS[i]}</span>
            <span
              className={cn(
                'text-[13px] font-bold w-7 h-7 flex items-center justify-center rounded-full',
                today && active && 'bg-primary text-text-inverse',
                today && !active && 'bg-primary-light/40',
              )}
            >
              {day.getDate()}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// WeeklyView Component
// ---------------------------------------------------------------------------

export function WeeklyView() {
  const currentDate = useCalendarStore((s) => s.currentDate);
  const activePortalId = usePortalStore((s) => s.activePortalId);

  // Mobile day selection (0 = Mon, 6 = Sun)
  const [mobileDayIndex, setMobileDayIndex] = useState(() => {
    // Default to today's index within the week, or Monday
    const now = new Date();
    const day = now.getDay(); // 0=Sun
    return day === 0 ? 6 : day - 1; // Convert to Mon=0..Sun=6
  });

  // Compute week range
  const date = useMemo(() => new Date(currentDate), [currentDate]);
  const weekRange = useMemo(() => getWeekRange(date), [date]);
  const weekDays = useMemo(() => getWeekDays(date), [date]);

  // Fetch tasks for the week
  const dateFrom = weekRange.start.toISOString();
  const dateTo = weekRange.end.toISOString();
  const { data, isLoading, isError, error, refetch } = useCalendarTasks(
    dateFrom,
    dateTo,
    activePortalId ?? undefined,
  );

  // Transform tasks to CalendarTask[] and group by day
  const { tasksByDay, todayKey, hiddenCount } = useMemo(() => {
    const map = new Map<string, CalendarTask[]>();

    // Initialize all days
    for (const day of weekDays) {
      map.set(toISODateString(day), []);
    }

    let todayStr = '';
    for (const day of weekDays) {
      if (isToday(day)) {
        todayStr = toISODateString(day);
        break;
      }
    }

    if (!data?.data) return { tasksByDay: map, todayKey: todayStr, hiddenCount: 0 };

    let hidden = 0;

    for (const task of data.data) {
      const block = getTaskTimeBlock(task);
      if (!block) {
        hidden++;
        continue;
      }

      const calTask: CalendarTask = {
        ...task,
        startY: block.startY,
        height: block.height,
        startTime: block.startTime,
        endTime: block.endTime,
      };

      // Determine which day this task belongs to (by startTime)
      const taskDayKey = toISODateString(block.startTime);

      // Check if this day is in our week
      const existing = map.get(taskDayKey);
      if (existing) {
        existing.push(calTask);
      } else {
        // Task might span across days — also check each week day
        for (const day of weekDays) {
          if (isSameDay(day, block.startTime)) {
            const dayKey = toISODateString(day);
            const arr = map.get(dayKey);
            if (arr) arr.push(calTask);
            break;
          }
        }
      }
    }

    // Resolve overlaps for each day
    for (const [key, tasks] of map.entries()) {
      if (tasks.length > 0) {
        map.set(key, resolveOverlaps(tasks));
      }
    }

    return { tasksByDay: map, todayKey: todayStr, hiddenCount: hidden };
  }, [data, weekDays]);

  // Build TimeGrid columns
  const allColumns: TimeGridColumn[] = useMemo(
    () =>
      weekDays.map((day) => ({
        key: toISODateString(day),
        header: (
          <div className="flex flex-col items-center gap-0.5">
            <span
              className={cn(
                'text-[11px] font-medium',
                isToday(day) ? 'text-primary' : 'text-text-secondary',
                isWeekend(day) && !isToday(day) && 'text-text-muted',
              )}
            >
              {getDayShortName(day)}
            </span>
            <span
              className={cn(
                'text-[14px] font-bold w-7 h-7 flex items-center justify-center rounded-full',
                isToday(day) && 'bg-primary text-text-inverse',
                isWeekend(day) && !isToday(day) && 'text-text-muted',
              )}
            >
              {day.getDate()}
            </span>
          </div>
        ),
        isHighlighted: isToday(day),
        isDimmed: isWeekend(day),
      })),
    [weekDays],
  );

  // For mobile: only show one column
  const mobileColumns = useMemo(
    () => (allColumns.length > mobileDayIndex ? [allColumns[mobileDayIndex]] : []),
    [allColumns, mobileDayIndex],
  );

  // renderTask callback
  const renderTask = useCallback(
    (task: CalendarTask, allColumnTasks: CalendarTask[]) => {
      const overflowTasks = task.overflowCount
        ? allColumnTasks.filter((t) => t.hidden)
        : undefined;
      return <TaskBlock task={task} overflowTasks={overflowTasks} />;
    },
    [],
  );

  // Count total visible tasks across all days
  const totalVisibleTasks = useMemo(() => {
    let count = 0;
    for (const tasks of tasksByDay.values()) {
      count += tasks.length;
    }
    return count;
  }, [tasksByDay]);

  // --- Render ---

  if (isLoading) {
    return <WeeklyViewSkeleton />;
  }

  if (isError) {
    return (
      <ErrorState
        title="Ошибка загрузки"
        message={error?.message || 'Не удалось загрузить задачи календаря.'}
        onRetry={() => refetch()}
      />
    );
  }

  // Empty state: no tasks at all for this week
  if (totalVisibleTasks === 0 && hiddenCount === 0) {
    return (
      <EmptyState
        icon={<CalendarIcon />}
        title="Нет задач на эту неделю"
        description="Задачи с датами начала или дедлайном появятся здесь"
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Hidden tasks info badge */}
      {hiddenCount > 0 && (
        <div className="shrink-0 bg-slate-50 dark:bg-slate-800/50 rounded-md px-3 py-1.5 mx-3 mt-2 flex items-center gap-1.5">
          <InfoCircleIcon />
          <span className="text-xs text-text-secondary">
            {hiddenCount} {hiddenCount === 1 ? 'задача' : hiddenCount < 5 ? 'задачи' : 'задач'} без дат {hiddenCount === 1 ? 'скрыта' : 'скрыты'}
          </span>
        </div>
      )}

      {/* Mobile day tabs */}
      <DayTabs
        days={weekDays}
        selectedIndex={mobileDayIndex}
        onSelect={setMobileDayIndex}
      />

      {/* Desktop: 7-column grid */}
      <div className="hidden md:flex flex-1 overflow-hidden">
        <TimeGrid
          columns={allColumns}
          tasks={tasksByDay}
          renderTask={renderTask}
          showNowIndicator
          nowColumnKey={todayKey}
          className="h-full w-full"
        />
      </div>

      {/* Mobile: single-column grid */}
      <div className="flex md:hidden flex-1 overflow-hidden">
        <TimeGrid
          columns={mobileColumns}
          tasks={tasksByDay}
          renderTask={renderTask}
          showNowIndicator
          nowColumnKey={todayKey}
          className="h-full w-full"
        />
      </div>
    </div>
  );
}
