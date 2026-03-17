'use client';

import { StatCard } from '@/components/ui/StatCard';
import { TaskList } from '@/components/tasks/TaskList';
import { useTasks } from '@/hooks/useTasks';
import { useUIStore } from '@/stores/ui-store';

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

export default function DashboardPage() {
  const { openSidePanel } = useUIStore();

  // Fetch stats from API: total, in_progress, completed, overdue
  const { data: allData } = useTasks({ limit: 1 });
  const { data: inProgressData } = useTasks({ status: 'IN_PROGRESS', limit: 1 });
  const { data: completedData } = useTasks({ status: 'COMPLETED', limit: 1 });

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
