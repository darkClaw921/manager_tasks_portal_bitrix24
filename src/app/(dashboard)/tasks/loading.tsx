import { TaskRowSkeleton } from '@/components/ui/Skeleton';

export default function TasksLoading() {
  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="animate-pulse">
        <div className="h-7 bg-background rounded w-32" />
        <div className="h-4 bg-background rounded w-64 mt-2" />
      </div>

      {/* Поиск */}
      <div className="animate-pulse">
        <div className="h-10 bg-background rounded-input w-full" />
      </div>

      {/* Фильтры по порталам */}
      <div className="flex flex-wrap items-center gap-2 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-8 bg-background rounded-badge w-24" />
        ))}
      </div>

      {/* Фильтры по статусу */}
      <div className="flex flex-wrap items-center gap-2 animate-pulse">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-8 bg-background rounded-badge w-20" />
        ))}
      </div>

      {/* Количество результатов */}
      <div className="animate-pulse">
        <div className="h-4 bg-background rounded w-20" />
      </div>

      {/* Список задач */}
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <TaskRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
