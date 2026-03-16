'use client';

import { useMemo } from 'react';
import { getBusyLevel, getWeekRange, getDayShortName, isToday, WORK_HOURS } from '@/lib/calendar/utils';
import { cn } from '@/lib/utils';
import type { TaskWithPortal } from '@/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AvailabilityGridProps {
  tasks: TaskWithPortal[];
  selectedUserIds: string[];
  weekStart: Date;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HOURS = Array.from(
  { length: WORK_HOURS.end - WORK_HOURS.start },
  (_, i) => WORK_HOURS.start + i,
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BusyBlock {
  startHourIndex: number;
  endHourIndex: number;
  level: number; // 0 = all free, 1 = 1 busy, 2 = 2+ busy, -1 = all busy
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build weekdays (Mon-Fri) from the given date */
function getWorkDays(date: Date): Date[] {
  const { start } = getWeekRange(date);
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

/** Get the color class for a busy level */
function getBusyColor(level: number, totalUsers: number): string {
  if (level === 0) return ''; // transparent - shows green bg
  if (level >= totalUsers && totalUsers > 0) return 'bg-zinc-500/80';
  if (level >= 2) return 'bg-zinc-400/80';
  return 'bg-zinc-300/80';
}

/** Group consecutive hours with the same busy level into blocks */
function groupBusyBlocks(
  tasks: TaskWithPortal[],
  userIds: string[],
  day: Date,
): BusyBlock[] {
  if (userIds.length === 0) return [];

  const blocks: BusyBlock[] = [];
  let currentBlock: BusyBlock | null = null;

  for (let i = 0; i < HOURS.length; i++) {
    const level = getBusyLevel(tasks, userIds, day, HOURS[i]);
    const normalizedLevel =
      level >= userIds.length && userIds.length > 0 ? -1 : level;

    if (currentBlock && currentBlock.level === normalizedLevel) {
      currentBlock.endHourIndex = i + 1;
    } else {
      if (currentBlock) blocks.push(currentBlock);
      currentBlock = {
        startHourIndex: i,
        endHourIndex: i + 1,
        level: normalizedLevel,
      };
    }
  }

  if (currentBlock) blocks.push(currentBlock);

  return blocks;
}

// ---------------------------------------------------------------------------
// Legend Component
// ---------------------------------------------------------------------------

function AvailabilityLegend({ totalUsers }: { totalUsers: number }) {
  const items = [
    { color: 'bg-success-light border border-success', label: 'Все свободны' },
    { color: 'bg-zinc-300/80', label: '1 занят' },
    { color: 'bg-zinc-400/80', label: '2+ заняты' },
    { color: 'bg-zinc-500/80', label: totalUsers > 0 ? 'Все заняты' : 'Все заняты' },
  ];

  return (
    <div className="flex items-center gap-5 pt-3">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <div className={cn('w-3 h-3 rounded-sm shrink-0', item.color)} />
          <span className="text-[11px] text-text-secondary">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Day Column Component
// ---------------------------------------------------------------------------

interface DayColumnProps {
  day: Date;
  blocks: BusyBlock[];
  totalUsers: number;
  totalHours: number;
}

function DayColumn({ day, blocks, totalUsers, totalHours }: DayColumnProps) {
  const today = isToday(day);

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Header */}
      <div
        className={cn(
          'flex items-center justify-center h-7 text-[11px] font-semibold shrink-0',
          today ? 'text-primary' : 'text-text-secondary',
        )}
      >
        <span>{getDayShortName(day)}</span>
        <span className="ml-1">{day.getDate()}</span>
      </div>

      {/* Body */}
      <div className="relative flex-1 rounded-lg border border-success bg-success-light overflow-hidden">
        {blocks
          .filter((block) => block.level !== 0) // 0 = free, just show green bg
          .map((block) => {
            const topPercent = (block.startHourIndex / totalHours) * 100;
            const heightPercent =
              ((block.endHourIndex - block.startHourIndex) / totalHours) * 100;
            const color = getBusyColor(
              block.level === -1 ? totalUsers : block.level,
              totalUsers,
            );

            return (
              <div
                key={`${block.startHourIndex}-${block.level}`}
                className={cn('absolute left-0 right-0', color)}
                style={{
                  top: `${topPercent}%`,
                  height: `${heightPercent}%`,
                }}
              />
            );
          })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * Color-coded availability grid showing busy/free status per hour
 * for each workday of the week. Used in the Free Slots view.
 */
export function AvailabilityGrid({
  tasks,
  selectedUserIds,
  weekStart,
}: AvailabilityGridProps) {
  const workDays = useMemo(() => getWorkDays(weekStart), [weekStart]);

  const dayBlocks = useMemo(
    () =>
      workDays.map((day) => ({
        day,
        blocks: groupBusyBlocks(tasks, selectedUserIds, day),
      })),
    [workDays, tasks, selectedUserIds],
  );

  const totalHours = HOURS.length;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex flex-1 min-h-0">
        {/* Time column */}
        <div className="shrink-0 w-12 flex flex-col pt-7">
          {HOURS.map((hour) => (
            <div
              key={hour}
              className="flex-1 flex items-start justify-end pr-1"
            >
              <span className="text-[10px] text-text-muted font-medium leading-none -mt-1.5">
                {String(hour).padStart(2, '0')}:00
              </span>
            </div>
          ))}
        </div>

        {/* Day columns */}
        <div className="flex gap-1.5 flex-1 min-w-0">
          {dayBlocks.map(({ day, blocks }) => (
            <DayColumn
              key={day.toISOString()}
              day={day}
              blocks={blocks}
              totalUsers={selectedUserIds.length}
              totalHours={totalHours}
            />
          ))}
        </div>
      </div>

      {/* Legend */}
      <AvailabilityLegend totalUsers={selectedUserIds.length} />
    </div>
  );
}
