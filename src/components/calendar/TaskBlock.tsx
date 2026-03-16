'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { CalendarTask } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TaskBlockProps {
  task: CalendarTask;
  onClick?: (task: CalendarTask) => void;
  /** Hidden tasks in the same cluster (passed when task has overflowCount) */
  overflowTasks?: CalendarTask[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a Date to "HH:MM" */
function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// OverflowPopover: shows hidden tasks when clicking "+N ещё"
// ---------------------------------------------------------------------------

interface OverflowPopoverProps {
  tasks: CalendarTask[];
  onClose: () => void;
}

function OverflowPopover({ tasks, onClose }: OverflowPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute z-50 bg-surface border border-border rounded-lg shadow-lg p-2 min-w-[180px] max-w-[260px]"
      style={{ top: '100%', right: 0, marginTop: 4 }}
    >
      <p className="text-[10px] text-text-muted px-2 py-1 font-medium">
        Скрытые задачи
      </p>
      {tasks.map((t) => (
        <button
          key={t.id}
          type="button"
          className="w-full text-left px-2 py-1.5 rounded hover:bg-background transition-colors flex flex-col gap-0.5"
          onClick={() => {
            router.push(`/tasks/${t.id}`);
            onClose();
          }}
        >
          <span
            className="text-[11px] font-semibold truncate leading-tight"
            style={{ color: t.portalColor }}
          >
            {t.title}
          </span>
          {t.startTime && t.endTime && (
            <span className="text-[10px] text-text-secondary leading-tight">
              {formatTime(t.startTime)} &ndash; {formatTime(t.endTime)}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// OverflowIndicator: "+N ещё" badge
// ---------------------------------------------------------------------------

interface OverflowIndicatorProps {
  count: number;
  tasks: CalendarTask[];
  style: React.CSSProperties;
}

function OverflowIndicator({ count, tasks, style }: OverflowIndicatorProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="absolute" style={style}>
      <div className="relative">
        <button
          type="button"
          className={cn(
            'bg-slate-100 dark:bg-slate-700 text-text-secondary',
            'text-[10px] font-medium rounded-md px-2 py-1',
            'hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors',
            'cursor-pointer select-none whitespace-nowrap',
          )}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(!open);
          }}
        >
          +{count} ещё
        </button>
        {open && (
          <OverflowPopover tasks={tasks} onClose={() => setOpen(false)} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Individual task block positioned absolutely within a TimeGrid column.
 * Width/left are computed from overlap info (columnIndex/totalColumns).
 *
 * When `task.hidden` is true, the block is not rendered.
 * When `task.overflowCount > 0`, a "+N ещё" badge appears at the bottom-right.
 */
export function TaskBlock({ task, onClick, overflowTasks }: TaskBlockProps) {
  const router = useRouter();

  // Hidden tasks are not rendered
  if (task.hidden) return null;

  const { startY, height, startTime, endTime, columnIndex, totalColumns, portalColor, overflowCount } = task;
  const effectiveHeight = Math.max(height, 24);

  // Overlap layout: split width when tasks overlap
  const colCount = totalColumns ?? 1;
  const colIdx = columnIndex ?? 0;
  const widthPercent = 100 / colCount;
  const leftPercent = colIdx * widthPercent;

  const handleClick = () => {
    if (onClick) {
      onClick(task);
    } else {
      router.push(`/tasks/${task.id}`);
    }
  };

  const isCompact = effectiveHeight < 40;
  const showPortal = effectiveHeight > 60;

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        className={cn(
          'absolute cursor-pointer transition-shadow hover:shadow-md',
          'overflow-hidden select-none',
        )}
        style={{
          top: startY,
          height: effectiveHeight,
          width: `calc(${widthPercent}% - 6px)`,
          left: `calc(${leftPercent}% + 3px)`,
          borderRadius: 6,
          borderLeft: `3px solid ${portalColor}`,
          backgroundColor: `${portalColor}1A`, // ~10% opacity
        }}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick();
          }
        }}
      >
        <div className="px-2 py-1.5 flex flex-col gap-0.5 h-full">
          {/* Title */}
          <span
            className={cn(
              'font-semibold truncate leading-tight',
              isCompact ? 'text-[10px]' : 'text-[11px]',
            )}
            style={{ color: portalColor }}
          >
            {task.title}
          </span>

          {/* Time range (hidden in compact mode) */}
          {!isCompact && (
            <span className="text-[10px] text-text-secondary leading-tight truncate">
              {formatTime(startTime)} &ndash; {formatTime(endTime)}
            </span>
          )}

          {/* Portal info (only if enough height) */}
          {showPortal && (
            <div className="flex items-center gap-1 mt-auto">
              <span
                className="shrink-0 rounded-full"
                style={{
                  width: 6,
                  height: 6,
                  backgroundColor: portalColor,
                }}
              />
              <span className="text-[9px] text-text-muted truncate">
                {task.portalName}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Overflow indicator: "+N ещё" */}
      {overflowCount && overflowCount > 0 && (
        <OverflowIndicator
          count={overflowCount}
          tasks={overflowTasks ?? []}
          style={{
            top: startY + effectiveHeight - 22,
            left: `calc(${leftPercent + widthPercent}% + 3px)`,
            width: `calc(${widthPercent}% - 6px)`,
          }}
        />
      )}
    </>
  );
}
