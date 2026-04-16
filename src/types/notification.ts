export type NotificationType =
  | 'task_add'
  | 'task_update'
  | 'task_delete'
  | 'comment_add'
  | 'mention'
  | 'overdue'
  | 'digest'
  | 'meeting_invite';

export interface Notification {
  id: number;
  userId: number;
  type: NotificationType;
  title: string;
  message: string | null;
  portalId: number | null;
  taskId: number | null;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface AIReport {
  id: number;
  userId: number;
  type: 'daily' | 'weekly';
  periodStart: string;
  periodEnd: string;
  content: string;
  stats: Record<string, unknown> | null;
  createdAt: string;
}

export interface AIChatMessage {
  id: number;
  userId: number;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}
