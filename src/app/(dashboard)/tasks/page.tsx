'use client';

import { TaskList } from '@/components/tasks/TaskList';

export default function TasksPage() {
  return (
    <div className="space-y-6">
      {/* Заголовок страницы */}
      <div>
        <h1 className="text-h2 font-bold text-foreground">Задачи</h1>
        <p className="text-small text-text-secondary mt-1">
          Управление задачами со всех порталов
        </p>
      </div>

      {/* Список задач с фильтрами, поиском и пагинацией */}
      <TaskList />
    </div>
  );
}
