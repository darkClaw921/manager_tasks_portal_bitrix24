'use client';

import { cn } from '@/lib/utils';
import type { FreeSlot } from '@/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SlotCardProps {
  slot: FreeSlot;
  onBook?: (slot: FreeSlot) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAY_NAMES_RU = [
  'Воскресенье',
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
] as const;

const MONTH_NAMES_RU_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
] as const;

/** Format date as "Понедельник, 18 марта" */
function formatSlotDate(date: Date): string {
  const dayName = DAY_NAMES_RU[date.getDay()];
  const dayNum = date.getDate();
  const month = MONTH_NAMES_RU_GENITIVE[date.getMonth()];
  return `${dayName}, ${dayNum} ${month}`;
}

/** Format time as "HH:MM" */
function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** Format duration: hours with 1 decimal if not integer (3.5 ч), otherwise integer (2 ч) */
function formatDuration(minutes: number): string {
  const hours = minutes / 60;
  if (hours === Math.floor(hours)) {
    return `${hours} ч`;
  }
  // One decimal place
  return `${hours.toFixed(1).replace('.0', '')} ч`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Recommended free slot card. Shows date, time range, duration, and a booking button.
 * Best slots are highlighted with green styling.
 */
export function SlotCard({ slot, onBook }: SlotCardProps) {
  const isBest = slot.isBest;

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-[10px] px-3.5 py-3 w-full transition-colors',
        isBest
          ? 'bg-success-light border border-success'
          : 'bg-background border border-border',
      )}
    >
      {/* Left content */}
      <div className="flex-1 flex flex-col gap-0.5 min-w-0">
        <span className="text-[12px] font-semibold text-text-primary truncate">
          {formatSlotDate(slot.date)}
        </span>
        <span
          className={cn(
            'text-[11px]',
            isBest ? 'text-success' : 'text-text-secondary',
          )}
        >
          {formatTime(slot.startTime)} – {formatTime(slot.endTime)}
          <span className="mx-1.5">·</span>
          {formatDuration(slot.durationMinutes)} свободно
        </span>
      </div>

      {/* Right button */}
      {onBook && (
        <button
          type="button"
          onClick={() => onBook(slot)}
          className={cn(
            'shrink-0 rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors',
            isBest
              ? 'bg-success text-white hover:bg-success/90'
              : 'border border-border text-text-secondary hover:bg-background font-medium',
          )}
        >
          Забронировать
        </button>
      )}
    </div>
  );
}
