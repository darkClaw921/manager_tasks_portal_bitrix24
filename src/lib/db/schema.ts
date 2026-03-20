import { sqliteTable, text, integer, real, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ==================== USERS ====================
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  isAdmin: integer('is_admin', { mode: 'boolean' }).notNull().default(false),
  language: text('language').notNull().default('ru'),
  timezone: text('timezone').notNull().default('Europe/Moscow'),
  digestTime: text('digest_time').notNull().default('09:00'),
  notifyTaskAdd: integer('notify_task_add', { mode: 'boolean' }).notNull().default(true),
  notifyTaskUpdate: integer('notify_task_update', { mode: 'boolean' }).notNull().default(true),
  notifyTaskDelete: integer('notify_task_delete', { mode: 'boolean' }).notNull().default(true),
  notifyCommentAdd: integer('notify_comment_add', { mode: 'boolean' }).notNull().default(true),
  notifyMention: integer('notify_mention', { mode: 'boolean' }).notNull().default(true),
  notifyOverdue: integer('notify_overdue', { mode: 'boolean' }).notNull().default(true),
  notifyDigest: integer('notify_digest', { mode: 'boolean' }).notNull().default(true),
  pushSubscription: text('push_subscription'), // JSON string
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text('updated_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

// ==================== PORTALS ====================
export const portals = sqliteTable('portals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  domain: text('domain').notNull(),
  name: text('name').notNull(),
  color: text('color').notNull().default('#2563EB'),
  memberId: text('member_id').notNull(),
  clientId: text('client_id').notNull(),
  clientSecret: text('client_secret').notNull(),
  clientEndpoint: text('client_endpoint').notNull(),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull(),
  tokenExpiresAt: text('token_expires_at'),
  appToken: text('app_token'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  lastSyncAt: text('last_sync_at'),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text('updated_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [
  uniqueIndex('portals_member_unique').on(table.memberId),
]);

// ==================== USER PORTAL ACCESS ====================
export const userPortalAccess = sqliteTable('user_portal_access', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  portalId: integer('portal_id').notNull().references(() => portals.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('viewer'), // 'admin' | 'viewer'
  canSeeResponsible: integer('can_see_responsible', { mode: 'boolean' }).notNull().default(true),
  canSeeAccomplice: integer('can_see_accomplice', { mode: 'boolean' }).notNull().default(false),
  canSeeAuditor: integer('can_see_auditor', { mode: 'boolean' }).notNull().default(false),
  canSeeCreator: integer('can_see_creator', { mode: 'boolean' }).notNull().default(false),
  canSeeAll: integer('can_see_all', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text('updated_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [
  uniqueIndex('user_portal_access_user_portal_unique').on(table.userId, table.portalId),
]);

// ==================== USER BITRIX MAPPINGS ====================
export const userBitrixMappings = sqliteTable('user_bitrix_mappings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  portalId: integer('portal_id').notNull().references(() => portals.id, { onDelete: 'cascade' }),
  bitrixUserId: text('bitrix_user_id').notNull(),
  bitrixName: text('bitrix_name'),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text('updated_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [
  uniqueIndex('user_bitrix_mappings_user_portal_unique').on(table.userId, table.portalId),
  uniqueIndex('user_bitrix_mappings_portal_bitrix_unique').on(table.portalId, table.bitrixUserId),
]);

// ==================== PORTAL CUSTOM STAGES ====================
export const portalCustomStages = sqliteTable('portal_custom_stages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  portalId: integer('portal_id').notNull().references(() => portals.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  color: text('color'),
  sort: integer('sort').notNull().default(0),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text('updated_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

// ==================== PORTAL STAGE MAPPINGS ====================
export const portalStageMappings = sqliteTable('portal_stage_mappings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  portalId: integer('portal_id').notNull().references(() => portals.id, { onDelete: 'cascade' }),
  customStageId: integer('custom_stage_id').notNull().references(() => portalCustomStages.id, { onDelete: 'cascade' }),
  bitrixStageId: integer('bitrix_stage_id').notNull().references(() => taskStages.id, { onDelete: 'cascade' }),
}, (table) => [
  uniqueIndex('portal_stage_mappings_portal_bitrix_unique').on(table.portalId, table.bitrixStageId),
]);

// ==================== TASKS ====================
export const tasks = sqliteTable('tasks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  portalId: integer('portal_id').notNull().references(() => portals.id, { onDelete: 'cascade' }),
  bitrixTaskId: integer('bitrix_task_id').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  descriptionHtml: text('description_html'),
  status: text('status').notNull().default('NEW'),
  priority: text('priority').notNull().default('1'),
  mark: text('mark'),
  responsibleId: text('responsible_id'),
  responsibleName: text('responsible_name'),
  responsiblePhoto: text('responsible_photo'),
  creatorId: text('creator_id'),
  creatorName: text('creator_name'),
  creatorPhoto: text('creator_photo'),
  groupId: integer('group_id'),
  stageId: integer('stage_id'),
  deadline: text('deadline'),
  startDatePlan: text('start_date_plan'),
  endDatePlan: text('end_date_plan'),
  createdDate: text('created_date'),
  changedDate: text('changed_date'),
  closedDate: text('closed_date'),
  timeEstimate: integer('time_estimate'),
  timeSpent: integer('time_spent'),
  tags: text('tags'), // JSON array string
  accomplices: text('accomplices'), // JSON array string
  auditors: text('auditors'), // JSON array string
  bitrixUrl: text('bitrix_url'),
  excludeFromAi: integer('exclude_from_ai').notNull().default(0),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text('updated_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [
  uniqueIndex('tasks_portal_bitrix_unique').on(table.portalId, table.bitrixTaskId),
]);

// ==================== TASK STAGES ====================
export const taskStages = sqliteTable('task_stages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  portalId: integer('portal_id').notNull().references(() => portals.id, { onDelete: 'cascade' }),
  bitrixStageId: text('bitrix_stage_id').notNull(),
  entityId: integer('entity_id').notNull().default(0),
  entityType: text('entity_type').notNull().default('USER'),
  title: text('title').notNull(),
  sort: integer('sort').notNull().default(0),
  color: text('color'),
  systemType: text('system_type'), // NEW, PROGRESS, WORK, REVIEW, FINISH
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text('updated_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [
  uniqueIndex('task_stages_portal_bitrix_unique').on(table.portalId, table.bitrixStageId),
]);

// ==================== TASK COMMENTS ====================
export const taskComments = sqliteTable('task_comments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: integer('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  bitrixCommentId: integer('bitrix_comment_id').notNull(),
  authorId: text('author_id'),
  authorName: text('author_name'),
  authorPhoto: text('author_photo'),
  postMessage: text('post_message'),
  postDate: text('post_date'),
  attachedFiles: text('attached_files'), // JSON string of CommentFile[]
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [
  uniqueIndex('task_comments_task_bitrix_unique').on(table.taskId, table.bitrixCommentId),
]);

// ==================== TASK CHECKLIST ITEMS ====================
export const taskChecklistItems = sqliteTable('task_checklist_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: integer('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  bitrixItemId: integer('bitrix_item_id'),
  title: text('title').notNull(),
  sortIndex: integer('sort_index').notNull().default(0),
  isComplete: integer('is_complete', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

// ==================== TASK FILES ====================
export const taskFiles = sqliteTable('task_files', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: integer('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  bitrixFileId: integer('bitrix_file_id'),
  name: text('name').notNull(),
  size: integer('size'),
  downloadUrl: text('download_url'),
  contentType: text('content_type'),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

// ==================== TASK RATES ====================
export const taskRates = sqliteTable('task_rates', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  taskId: integer('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  rateType: text('rate_type').notNull().default('fixed'), // 'hourly' | 'fixed'
  amount: real('amount').notNull().default(0),
  hoursOverride: real('hours_override'), // null = использовать timeSpent из задачи
  isPaid: integer('is_paid', { mode: 'boolean' }).notNull().default(false),
  paidAt: text('paid_at'),
  note: text('note'),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text('updated_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [
  uniqueIndex('task_rates_user_task_unique').on(table.userId, table.taskId),
]);

// ==================== NOTIFICATIONS ====================
export const notifications = sqliteTable('notifications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // task_add, task_update, task_delete, comment_add, mention, overdue, digest
  title: text('title').notNull(),
  message: text('message'),
  portalId: integer('portal_id').references(() => portals.id, { onDelete: 'set null' }),
  taskId: integer('task_id').references(() => tasks.id, { onDelete: 'set null' }),
  isRead: integer('is_read', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

// ==================== AI REPORTS ====================
export const aiReports = sqliteTable('ai_reports', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // daily, weekly
  periodStart: text('period_start').notNull(),
  periodEnd: text('period_end').notNull(),
  content: text('content').notNull(),
  stats: text('stats'), // JSON string
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

// ==================== AI CHAT MESSAGES ====================
export const aiChatMessages = sqliteTable('ai_chat_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // user, assistant
  content: text('content').notNull(),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

// ==================== APP SETTINGS ====================
export const appSettings = sqliteTable('app_settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull().unique(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

// ==================== Type Exports ====================
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Portal = typeof portals.$inferSelect;
export type NewPortal = typeof portals.$inferInsert;

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;

export type TaskStage = typeof taskStages.$inferSelect;
export type NewTaskStage = typeof taskStages.$inferInsert;

export type TaskComment = typeof taskComments.$inferSelect;
export type NewTaskComment = typeof taskComments.$inferInsert;

export type TaskChecklistItem = typeof taskChecklistItems.$inferSelect;
export type NewTaskChecklistItem = typeof taskChecklistItems.$inferInsert;

export type TaskFile = typeof taskFiles.$inferSelect;
export type NewTaskFile = typeof taskFiles.$inferInsert;

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;

export type AIReport = typeof aiReports.$inferSelect;
export type NewAIReport = typeof aiReports.$inferInsert;

export type AIChatMessage = typeof aiChatMessages.$inferSelect;
export type NewAIChatMessage = typeof aiChatMessages.$inferInsert;

export type UserPortalAccess = typeof userPortalAccess.$inferSelect;
export type NewUserPortalAccess = typeof userPortalAccess.$inferInsert;

export type UserBitrixMapping = typeof userBitrixMappings.$inferSelect;
export type NewUserBitrixMapping = typeof userBitrixMappings.$inferInsert;

export type PortalCustomStage = typeof portalCustomStages.$inferSelect;
export type NewPortalCustomStage = typeof portalCustomStages.$inferInsert;

export type PortalStageMapping = typeof portalStageMappings.$inferSelect;
export type NewPortalStageMapping = typeof portalStageMappings.$inferInsert;

export type AppSetting = typeof appSettings.$inferSelect;
export type NewAppSetting = typeof appSettings.$inferInsert;

export type TaskRate = typeof taskRates.$inferSelect;
export type NewTaskRate = typeof taskRates.$inferInsert;
