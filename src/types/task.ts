export type TaskStatus = 'NEW' | 'PENDING' | 'IN_PROGRESS' | 'SUPPOSEDLY_COMPLETED' | 'COMPLETED' | 'DEFERRED';

export type TaskPriority = '0' | '1' | '2';

export type TaskMark = 'P' | 'N' | null;

export interface Task {
  id: number;
  portalId: number;
  bitrixTaskId: number;
  title: string;
  description: string | null;
  descriptionHtml: string | null;
  status: string;
  priority: string;
  mark: string | null;
  responsibleId: string | null;
  responsibleName: string | null;
  creatorId: string | null;
  creatorName: string | null;
  groupId: number | null;
  stageId: number | null;
  deadline: string | null;
  startDatePlan: string | null;
  endDatePlan: string | null;
  createdDate: string | null;
  changedDate: string | null;
  closedDate: string | null;
  timeEstimate: number | null;
  timeSpent: number | null;
  tags: string[] | null;
  accomplices: string[] | null;
  auditors: string[] | null;
  bitrixUrl: string | null;
  excludeFromAi: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Task with joined portal info */
export interface TaskWithPortal extends Task {
  portalName: string;
  portalColor: string;
  portalDomain: string;
}

export interface TaskStage {
  id: number;
  portalId: number;
  bitrixStageId: string;
  entityId: number;
  entityType: string;
  title: string;
  sort: number;
  color: string | null;
  systemType: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskComment {
  id: number;
  taskId: number;
  bitrixCommentId: number;
  authorId: string | null;
  authorName: string | null;
  postMessage: string | null;
  postDate: string | null;
  createdAt: string;
}

export interface TaskChecklistItem {
  id: number;
  taskId: number;
  bitrixItemId: number | null;
  title: string;
  sortIndex: number;
  isComplete: boolean;
  createdAt: string;
}

export interface TaskFile {
  id: number;
  taskId: number;
  bitrixFileId: number | null;
  name: string;
  size: number | null;
  downloadUrl: string | null;
  contentType: string | null;
  createdAt: string;
}

export interface CreateTaskInput {
  portalId: number;
  title: string;
  description?: string;
  responsibleId?: string;
  priority?: string;
  deadline?: string;
  tags?: string[];
  groupId?: number;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  priority?: string;
  deadline?: string;
  tags?: string[];
  responsibleId?: string;
}

export interface TaskFilters {
  portalId?: number;
  status?: string;
  priority?: string;
  search?: string;
  responsibleId?: string;
  groupId?: number;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}
