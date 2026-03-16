'use client';

import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CalendarHeaderTab {
  value: string;
  label: string;
  active?: boolean;
}

export interface CalendarHeaderProps {
  title: string;
  icon: React.ReactNode;
  dateLabel: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  viewTabs?: CalendarHeaderTab[];
  onViewChange?: (value: string) => void;
  actions?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Inline SVG Icons (Heroicons-style)
// ---------------------------------------------------------------------------

function ChevronLeftIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Shared calendar header with navigation controls, date label, view tabs,
 * and an actions slot. Used by all calendar views.
 */
export function CalendarHeader({
  title,
  icon,
  dateLabel,
  onPrev,
  onNext,
  onToday,
  viewTabs,
  onViewChange,
  actions,
}: CalendarHeaderProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 md:gap-4 px-4 md:px-8 py-3.5 bg-surface border-b border-border">
      {/* ---- Left: Icon + Title ---- */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-primary" style={{ width: 20, height: 20 }}>
          {icon}
        </span>
        <h1 className="text-[18px] font-bold text-text-primary leading-tight">
          {title}
        </h1>
      </div>

      {/* ---- Spacer ---- */}
      <div className="flex-1 min-w-0" />

      {/* ---- Navigation group ---- */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Prev button */}
        <button
          type="button"
          onClick={onPrev}
          className="flex items-center justify-center rounded-md text-text-secondary hover:bg-background transition-colors"
          style={{ width: 28, height: 28 }}
          aria-label="Previous"
        >
          <ChevronLeftIcon />
        </button>

        {/* Date label */}
        <span className="text-[14px] font-semibold text-text-primary whitespace-nowrap">
          {dateLabel}
        </span>

        {/* Next button */}
        <button
          type="button"
          onClick={onNext}
          className="flex items-center justify-center rounded-md text-text-secondary hover:bg-background transition-colors"
          style={{ width: 28, height: 28 }}
          aria-label="Next"
        >
          <ChevronRightIcon />
        </button>

        {/* Today button */}
        <button
          type="button"
          onClick={onToday}
          className="px-3 py-1.5 rounded-md border border-border text-[12px] font-medium text-text-secondary hover:bg-background transition-colors whitespace-nowrap"
        >
          Сегодня
        </button>
      </div>

      {/* ---- View tabs ---- */}
      {viewTabs && viewTabs.length > 0 && (
        <div className="flex rounded-lg border border-border overflow-hidden shrink-0">
          {viewTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => onViewChange?.(tab.value)}
              className={cn(
                'px-3.5 py-1.5 text-[12px] font-medium transition-colors whitespace-nowrap',
                tab.active
                  ? 'bg-primary text-text-inverse font-semibold'
                  : 'bg-surface text-text-secondary hover:bg-background',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* ---- Actions slot ---- */}
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}
