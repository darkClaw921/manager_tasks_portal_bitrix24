'use client';

import { StatCard } from '@/components/ui/StatCard';
import { PortalIndicator } from '@/components/ui/PortalIndicator';
import { TaskList } from '@/components/tasks/TaskList';
import { useTasks } from '@/hooks/useTasks';
import { useTimeTrackingStats } from '@/hooks/useTimeTracking';
import { formatDuration } from '@/hooks/useTimeTracking';
import { useUIStore } from '@/stores/ui-store';
import Link from 'next/link';

/** SVG icons for stat cards */
function TotalIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75 2.25 12l4.179 2.25m0-4.5 5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L12 12.75l-5.571-3m11.142 0L21.75 12l-4.179 2.25m0 0L12 17.25l-5.571-3m11.142 0L21.75 16.5 12 21.75 2.25 16.5l4.179-2.25" />
    </svg>
  );
}

function InProgressIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}

function CompletedIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}

function OverdueIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
    </svg>
  );
}

function TimerTodayIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}

function TimerWeekIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
    </svg>
  );
}

function TimerMonthIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0 1 16.5 7.605" />
    </svg>
  );
}

export default function DashboardPage() {
  const { openSidePanel } = useUIStore();

  // Fetch stats from API: total, in_progress, completed, overdue
  const { data: allData } = useTasks({ limit: 1 });
  const { data: inProgressData } = useTasks({ status: 'IN_PROGRESS', limit: 1 });
  const { data: completedData } = useTasks({ status: 'COMPLETED', limit: 1 });
  const { data: timeStats } = useTimeTrackingStats();

  const total = allData?.total ?? 0;
  const inProgress = inProgressData?.total ?? 0;
  const completed = completedData?.total ?? 0;

  // Calculate overdue: tasks with deadline < now and not completed/deferred
  // For now approximate from total minus completed minus deferred
  // A more precise count would need a separate API call; we'll keep it simple
  const overdue = 0; // Will be enhanced with a dedicated endpoint if needed

  return (
    <div className="space-y-6">
      {/* Page title */}
      <div>
        <h1 className="text-h2 font-bold text-foreground">Дашборд</h1>
        <p className="text-small text-text-secondary mt-1">
          Обзор задач со всех порталов
        </p>
      </div>

      {/* Stat cards grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Всего задач"
          value={total}
          icon={<TotalIcon />}
        />
        <StatCard
          title="В работе"
          value={inProgress}
          icon={<InProgressIcon />}
        />
        <StatCard
          title="Выполнено"
          value={completed}
          icon={<CompletedIcon />}
        />
        <StatCard
          title="Просрочено"
          value={overdue}
          icon={<OverdueIcon />}
        />
      </div>

      {/* Time tracking stats */}
      {timeStats && (timeStats.totalToday > 0 || timeStats.totalWeek > 0 || timeStats.totalMonth > 0) && (
        <div>
          <h2 className="text-h3 font-semibold text-foreground mb-3">
            Трекинг времени
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard
              title="Сегодня"
              value={formatDuration(timeStats.totalToday)}
              icon={<TimerTodayIcon />}
            />
            <StatCard
              title="За неделю"
              value={formatDuration(timeStats.totalWeek)}
              icon={<TimerWeekIcon />}
            />
            <StatCard
              title="За месяц"
              value={formatDuration(timeStats.totalMonth)}
              icon={<TimerMonthIcon />}
            />
          </div>

          {/* Today's tasks breakdown */}
          {timeStats.todayTasks.length > 0 && (
            <div className="mt-4 rounded-card bg-surface border border-border p-4">
              <h3 className="text-small font-medium text-text-secondary mb-3">Задачи за сегодня</h3>
              <div className="space-y-2">
                {timeStats.todayTasks.map((t) => (
                  <Link
                    key={t.taskId}
                    href={`/tasks/${t.taskId}`}
                    className="flex items-center justify-between py-1.5 px-2 rounded-input hover:bg-background transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <PortalIndicator color={t.portalColor} size="sm" />
                      <span className="text-small text-foreground truncate">{t.taskTitle}</span>
                    </div>
                    <span className="text-small font-mono text-text-secondary shrink-0 ml-3">
                      {formatDuration(t.totalDuration)}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Real task list with filters */}
      <div>
        <h2 className="text-h3 font-semibold text-foreground mb-3">
          Задачи
        </h2>
        <TaskList onTaskClick={openSidePanel} />
      </div>
    </div>
  );
}
