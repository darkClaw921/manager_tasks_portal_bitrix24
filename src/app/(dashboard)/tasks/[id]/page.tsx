'use client';

import { use } from 'react';
import { TaskDetail } from '@/components/tasks/TaskDetail';

interface TaskPageProps {
  params: Promise<{ id: string }>;
}

export default function TaskPage({ params }: TaskPageProps) {
  const { id } = use(params);
  const taskId = parseInt(id, 10);

  if (isNaN(taskId)) {
    return (
      <div className="text-center py-12">
        <p className="text-danger text-body font-medium">Некорректный ID задачи</p>
      </div>
    );
  }

  return <TaskDetail taskId={taskId} />;
}
