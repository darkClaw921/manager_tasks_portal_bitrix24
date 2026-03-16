'use client';

import { useCalendarStore } from '@/stores/calendar-store';
import { useUIStore } from '@/stores/ui-store';
import { CalendarHeader, WeeklyView, TeamDayView, FreeSlotsView } from '@/components/calendar';
import { formatWeekLabel, formatDayLabel } from '@/lib/calendar/utils';
import type { CalendarView } from '@/types';

// ---------------------------------------------------------------------------
// Inline SVG Icons (Heroicons-style, 20x20)
// ---------------------------------------------------------------------------

function CalendarDaysIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
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

function TimerIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2 2" />
      <path d="M5 3L2 6M22 6l-3-3" />
    </svg>
  );
}

function PlusIcon() {
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
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// View tabs config
// ---------------------------------------------------------------------------

const VIEW_TABS: { value: CalendarView; label: string }[] = [
  { value: 'week', label: 'Неделя' },
  { value: 'team-day', label: 'Команда' },
  { value: 'free-slots', label: 'Слоты' },
];

// ---------------------------------------------------------------------------
// View-specific icons
// ---------------------------------------------------------------------------

function getViewIcon(view: CalendarView): React.ReactNode {
  switch (view) {
    case 'week':
      return <CalendarDaysIcon />;
    case 'team-day':
      return <UsersIcon />;
    case 'free-slots':
      return <TimerIcon />;
    default:
      return <CalendarDaysIcon />;
  }
}

function getViewTitle(view: CalendarView): string {
  switch (view) {
    case 'week':
      return 'Календарь';
    case 'team-day':
      return 'Расписание команды';
    case 'free-slots':
      return 'Свободные слоты';
    default:
      return 'Календарь';
  }
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function CalendarPage() {
  const { view, setView, currentDate, navigateWeek, navigateDay, goToToday } =
    useCalendarStore();
  const openModal = useUIStore((s) => s.openModal);

  const date = new Date(currentDate);

  // Compute dateLabel based on current view
  const dateLabel =
    view === 'team-day' ? formatDayLabel(date) : formatWeekLabel(date);

  // Navigation handlers depend on view
  const handlePrev = () => {
    if (view === 'team-day') {
      navigateDay(-1);
    } else {
      navigateWeek(-1);
    }
  };

  const handleNext = () => {
    if (view === 'team-day') {
      navigateDay(1);
    } else {
      navigateWeek(1);
    }
  };

  // View tabs with active state
  const viewTabs = VIEW_TABS.map((tab) => ({
    ...tab,
    active: tab.value === view,
  }));

  // Actions slot: "Create task" button for week view
  const actions =
    view === 'week' ? (
      <button
        type="button"
        onClick={() => openModal('createTask')}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-text-inverse text-[12px] font-semibold hover:bg-primary-hover transition-colors"
      >
        <PlusIcon />
        <span className="hidden sm:inline">Создать задачу</span>
      </button>
    ) : null;

  return (
    <div className="flex flex-col h-full -m-4 md:-m-6">
      <CalendarHeader
        title={getViewTitle(view)}
        icon={getViewIcon(view)}
        dateLabel={dateLabel}
        onPrev={handlePrev}
        onNext={handleNext}
        onToday={goToToday}
        viewTabs={viewTabs}
        onViewChange={(v) => setView(v as CalendarView)}
        actions={actions}
      />

      <div className="flex-1 overflow-hidden">
        {view === 'week' && <WeeklyView />}
        {view === 'team-day' && <TeamDayView />}
        {view === 'free-slots' && <FreeSlotsView />}
      </div>
    </div>
  );
}
