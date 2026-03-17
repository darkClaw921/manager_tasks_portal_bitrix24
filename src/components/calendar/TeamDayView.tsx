'use client';

import { useMemo, useCallback } from 'react';
import { useCalendarStore } from '@/stores/calendar-store';
import { usePortalStore } from '@/stores/portal-store';
import { useTeamDay } from '@/hooks/useCalendarTasks';
import {
  getTaskTimeBlock,
  resolveOverlaps,
  isToday,
} from '@/lib/calendar/utils';
import type { CalendarTask, TeamMember } from '@/types';
import { TimeGrid } from './TimeGrid';
import type { TimeGridColumn } from './TimeGrid';
import { TaskBlock } from './TaskBlock';
import { TeamMemberHeader } from './TeamMemberHeader';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui';

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function UsersIcon() {
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
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function CalendarDayIcon() {
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
// Helpers
// ---------------------------------------------------------------------------

/** Format date as YYYY-MM-DD (local timezone) */
function toISODateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ---------------------------------------------------------------------------
// Skeleton for loading state
// ---------------------------------------------------------------------------

function TeamDayViewSkeleton() {
  const columnCount = 4; // placeholder columns

  return (
    <div className="flex flex-col h-full animate-pulse">
      {/* Header skeleton */}
      <div className="flex shrink-0 border-b border-border bg-surface">
        <div className="shrink-0" style={{ width: 56 }} />
        {Array.from({ length: columnCount }, (_, i) => (
          <div
            key={i}
            className="flex-1 flex items-center gap-2 px-3 py-2 border-l border-border"
          >
            <div className="w-7 h-7 rounded-full bg-background shrink-0" />
            <div className="flex flex-col gap-1 min-w-0">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-2 w-12" />
            </div>
          </div>
        ))}
      </div>
      {/* Grid body skeleton */}
      <div className="flex-1 overflow-hidden">
        <div className="flex" style={{ height: 720 }}>
          <div
            className="shrink-0 border-r border-border"
            style={{ width: 56 }}
          >
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
          {Array.from({ length: columnCount }, (_, col) => (
            <div key={col} className="flex-1 relative border-l border-border">
              {[1, 2].map((block) => (
                <div
                  key={block}
                  className="absolute left-1 right-1 bg-background rounded"
                  style={{
                    top: (col * 60 + block * 100) % 600,
                    height: 50 + ((col * 13 + block * 29) % 50),
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
// TeamDayView Component
// ---------------------------------------------------------------------------

export function TeamDayView() {
  const currentDate = useCalendarStore((s) => s.currentDate);
  const activePortalId = usePortalStore((s) => s.activePortalId);

  // Compute date string
  const date = useMemo(() => new Date(currentDate), [currentDate]);
  const dateString = useMemo(() => toISODateString(date), [date]);

  // Fetch team data
  const { data, isLoading, isError, error, refetch } = useTeamDay(
    dateString,
    activePortalId ?? undefined,
  );

  const members = data?.members ?? [];
  const tasks = data?.tasks ?? [];

  // Transform tasks to CalendarTask[] and group by member
  const { tasksByMember, hiddenCount } = useMemo(() => {
    const map = new Map<string, CalendarTask[]>();

    // Initialize all member columns
    for (const member of members) {
      map.set(member.bitrixUserId, []);
    }

    let hidden = 0;

    // Assign tasks to members by responsibleId
    for (const task of tasks) {
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

      const memberKey = task.responsibleId;
      if (memberKey) {
        const existing = map.get(memberKey);
        if (existing) {
          existing.push(calTask);
        }
      }
    }

    // Resolve overlaps for each member
    for (const [key, memberTasks] of map.entries()) {
      if (memberTasks.length > 0) {
        map.set(key, resolveOverlaps(memberTasks));
      }
    }

    return { tasksByMember: map, hiddenCount: hidden };
  }, [members, tasks]);

  // Build TimeGrid columns
  const columns: TimeGridColumn[] = useMemo(
    () =>
      members.map((member: TeamMember) => ({
        key: member.bitrixUserId,
        header: <TeamMemberHeader member={member} />,
        isHighlighted: false,
      })),
    [members],
  );

  // Now indicator: show in first column if today
  const nowColumnKey = useMemo(() => {
    if (members.length === 0) return undefined;
    return isToday(date) ? members[0].bitrixUserId : undefined;
  }, [members, date]);

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

  // Count total visible tasks across all members
  const totalVisibleTasks = useMemo(() => {
    let count = 0;
    for (const memberTasks of tasksByMember.values()) {
      count += memberTasks.length;
    }
    return count;
  }, [tasksByMember]);

  // --- Render ---

  if (isLoading) {
    return <TeamDayViewSkeleton />;
  }

  if (isError) {
    return (
      <ErrorState
        title="Ошибка загрузки"
        message={error?.message || 'Не удалось загрузить данные команды.'}
        onRetry={() => refetch()}
      />
    );
  }

  // Empty state: no team members (no Bitrix mappings configured)
  if (members.length === 0) {
    return (
      <EmptyState
        icon={<UsersIcon />}
        title="Нет привязанных пользователей"
        description="Настройте привязку пользователей к Bitrix24 в настройках портала"
        actionLabel="Настройки порталов"
        actionHref="/portals"
      />
    );
  }

  // Empty state: no tasks at all for this day
  if (totalVisibleTasks === 0 && hiddenCount === 0) {
    return (
      <EmptyState
        icon={<CalendarDayIcon />}
        title="Нет задач на этот день"
        description="Задачи с датами начала или дедлайном появятся здесь"
      />
    );
  }

  return (
    <div className="flex flex-col h-full overflow-x-auto">
      {/* Hidden tasks info badge */}
      {hiddenCount > 0 && (
        <div className="shrink-0 bg-slate-50 dark:bg-slate-800/50 rounded-md px-3 py-1.5 mx-3 mt-2 flex items-center gap-1.5">
          <InfoCircleIcon />
          <span className="text-xs text-text-secondary">
            {hiddenCount} {hiddenCount === 1 ? 'задача' : hiddenCount < 5 ? 'задачи' : 'задач'} без дат {hiddenCount === 1 ? 'скрыта' : 'скрыты'}
          </span>
        </div>
      )}

      <TimeGrid
        columns={columns}
        tasks={tasksByMember}
        renderTask={renderTask}
        showNowIndicator={!!nowColumnKey}
        nowColumnKey={nowColumnKey}
        className="h-full min-w-max"
      />
    </div>
  );
}
