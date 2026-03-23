export interface TimeTrackingEntry {
  id: number;
  userId: number;
  taskId: number;
  startedAt: string;
  stoppedAt: string | null;
  duration: number | null;
  createdAt: string;
}

export interface ActiveTimerEntry extends TimeTrackingEntry {
  taskTitle: string;
  portalColor: string;
  portalName: string;
}

export interface TaskTimeTrackingSummary {
  taskId: number;
  totalDuration: number;
  activeEntry: TimeTrackingEntry | null;
  entries: TimeTrackingEntry[];
}

export interface TimeTrackingTaskStat {
  taskId: number;
  taskTitle: string;
  portalColor: string;
  portalName: string;
  totalDuration: number;
}

export interface TimeTrackingStats {
  totalToday: number;
  totalWeek: number;
  totalMonth: number;
  totalAll: number;
  todayTasks: TimeTrackingTaskStat[];
}
