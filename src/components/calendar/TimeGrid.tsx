'use client';

import { cn } from '@/lib/utils';
import { HOUR_HEIGHT, DISPLAY_HOURS } from '@/lib/calendar/utils';
import type { CalendarTask } from '@/types';
import { NowIndicator } from './NowIndicator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TimeGridColumn {
  key: string;
  header: React.ReactNode;
  isHighlighted?: boolean;
  isDimmed?: boolean;
}

export interface TimeGridProps {
  columns: TimeGridColumn[];
  tasks: Map<string, CalendarTask[]>;
  renderTask?: (task: CalendarTask, allColumnTasks: CalendarTask[]) => React.ReactNode;
  showNowIndicator?: boolean;
  nowColumnKey?: string;
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GUTTER_WIDTH = 56; // px
const TOTAL_HOURS = DISPLAY_HOURS.end - DISPLAY_HOURS.start; // 24
const GRID_HEIGHT = TOTAL_HOURS * HOUR_HEIGHT; // 1920

/** Hour labels from 00:00 to 24:00 */
const HOUR_LABELS = Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => {
  const hour = DISPLAY_HOURS.start + i;
  return `${String(hour).padStart(2, '0')}:00`;
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TimeGrid({
  columns,
  tasks,
  renderTask,
  showNowIndicator = false,
  nowColumnKey,
  className,
}: TimeGridProps) {
  return (
    <div className={cn('flex flex-col overflow-hidden', className)}>
      {/* ---- Header row (sticky) ---- */}
      <div className="flex shrink-0 border-b border-border bg-surface sticky top-0 z-10">
        {/* Gutter spacer */}
        <div
          className="shrink-0 border-r border-border"
          style={{ width: GUTTER_WIDTH }}
        />

        {/* Column headers */}
        {columns.map((col) => (
          <div
            key={col.key}
            className={cn(
              'flex-1 flex items-center justify-center py-2 border-l border-border text-small font-semibold min-w-0',
              col.isHighlighted && 'bg-primary-light/40',
              col.isDimmed && 'bg-background/60',
            )}
          >
            {col.header}
          </div>
        ))}
      </div>

      {/* ---- Scrollable grid body ---- */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex" style={{ height: GRID_HEIGHT }}>
          {/* Left time gutter */}
          <div
            className="shrink-0 relative border-r border-border"
            style={{ width: GUTTER_WIDTH, height: GRID_HEIGHT }}
          >
            {HOUR_LABELS.map((label, i) => (
              <div
                key={label}
                className="absolute right-2 text-text-muted font-medium leading-none"
                style={{
                  top: i * HOUR_HEIGHT - 6,
                  fontSize: 11,
                }}
              >
                {label}
              </div>
            ))}
          </div>

          {/* Columns */}
          {columns.map((col) => {
            const columnTasks = tasks.get(col.key) ?? [];

            return (
              <div
                key={col.key}
                className={cn(
                  'flex-1 relative border-l border-border min-w-0',
                  col.isHighlighted && 'bg-primary-light/20',
                  col.isDimmed && 'bg-background/40',
                )}
                style={{ height: GRID_HEIGHT }}
              >
                {/* Horizontal hour lines */}
                {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                  <div
                    key={i}
                    className="absolute left-0 right-0 border-b border-border"
                    style={{ top: (i + 1) * HOUR_HEIGHT }}
                  />
                ))}

                {/* Tasks */}
                {renderTask && columnTasks.map((task) => (
                  <div key={task.id}>
                    {renderTask(task, columnTasks)}
                  </div>
                ))}

                {/* Now indicator */}
                {showNowIndicator && nowColumnKey === col.key && (
                  <NowIndicator />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
