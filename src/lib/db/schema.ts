import { sqliteTable, text, integer, real, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
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
  paidAmount: real('paid_amount').notNull().default(0), // фактически оплачено (partial payments)
  paidAt: text('paid_at'),
  note: text('note'),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text('updated_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [
  uniqueIndex('task_rates_user_task_unique').on(table.userId, table.taskId),
]);

// ==================== PAYMENT REQUESTS ====================
export const paymentRequests = sqliteTable('payment_requests', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  fromUserId: integer('from_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }), // админ-отправитель
  toUserId: integer('to_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),     // получатель
  totalAmount: real('total_amount').notNull(),
  note: text('note'),
  status: text('status').notNull().default('pending'), // 'pending' | 'accepted' | 'modified' | 'rejected'
  respondedAt: text('responded_at'),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

// ==================== PAYMENT REQUEST ITEMS ====================
export const paymentRequestItems = sqliteTable('payment_request_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  requestId: integer('request_id').notNull().references(() => paymentRequests.id, { onDelete: 'cascade' }),
  taskRateId: integer('task_rate_id').notNull().references(() => taskRates.id, { onDelete: 'cascade' }),
  proposedAmount: real('proposed_amount').notNull(), // сумма, предложенная админом
  appliedAmount: real('applied_amount'),             // итоговая сумма после accept/modify
});

// ==================== TIME TRACKING ENTRIES ====================
export const timeTrackingEntries = sqliteTable('time_tracking_entries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  taskId: integer('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  startedAt: text('started_at').notNull(),
  stoppedAt: text('stopped_at'),
  duration: integer('duration'),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

// ==================== NOTIFICATIONS ====================
export const notifications = sqliteTable('notifications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  // Generic type tag. Known values: task_add, task_update, task_delete,
  // comment_add, mention, overdue, digest, meeting_invite.
  type: text('type').notNull(),
  title: text('title').notNull(),
  message: text('message'),
  portalId: integer('portal_id').references(() => portals.id, { onDelete: 'set null' }),
  taskId: integer('task_id').references(() => tasks.id, { onDelete: 'set null' }),
  // Click-through target. Nullable — legacy rows and some types (digest)
  // have no dedicated destination. When null, consumers fall back to the
  // type-default route (e.g., `/tasks/<taskId>` or `/dashboard`).
  link: text('link'),
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

// ==================== MEETINGS ====================
export const meetings = sqliteTable('meetings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  hostId: integer('host_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  roomName: text('room_name').notNull(), // UUID для LiveKit
  status: text('status').notNull().default('scheduled'), // 'scheduled' | 'live' | 'ended'
  recordingEnabled: integer('recording_enabled', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  startedAt: text('started_at'),
  endedAt: text('ended_at'),
  // ISO timestamp set when the last participant leaves; nulled when anyone
  // rejoins. cleanup.ts uses (now - empty_since > 5min) to auto-end meetings.
  emptySince: text('empty_since'),
}, (table) => [
  uniqueIndex('meetings_room_name_unique').on(table.roomName),
]);

// ==================== MEETING PARTICIPANTS ====================
export const meetingParticipants = sqliteTable('meeting_participants', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  meetingId: integer('meeting_id').notNull().references(() => meetings.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('participant'), // 'host' | 'participant'
  joinedAt: text('joined_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  leftAt: text('left_at'),
});

// ==================== MEETING RECORDINGS ====================
export const meetingRecordings = sqliteTable('meeting_recordings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  meetingId: integer('meeting_id').notNull().references(() => meetings.id, { onDelete: 'cascade' }),
  trackType: text('track_type').notNull(), // 'audio' | 'video' | 'mixed' | 'final_mkv'
  userId: text('user_id'), // nullable: для mixed/video/final не привязан к одному юзеру
  filePath: text('file_path').notNull(),
  egressId: text('egress_id').notNull(), // LiveKit egress id
  status: text('status').notNull().default('recording'), // 'recording' | 'processing' | 'done' | 'failed'
  startedAt: text('started_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  endedAt: text('ended_at'),
  sizeBytes: integer('size_bytes'),
}, (table) => [
  uniqueIndex('meeting_recordings_egress_id_unique').on(table.egressId),
]);

// ==================== MEETING GUEST INVITE TOKENS ====================
export const meetingGuestTokens = sqliteTable('meeting_guest_tokens', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  meetingId: integer('meeting_id').notNull().references(() => meetings.id, { onDelete: 'cascade' }),
  token: text('token').notNull(),
  createdBy: integer('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  revokedAt: text('revoked_at'),
}, (table) => [
  uniqueIndex('meeting_guest_tokens_token_unique').on(table.token),
]);

// ==================== MEETING ANNOTATIONS ====================
export const meetingAnnotations = sqliteTable('meeting_annotations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  meetingId: integer('meeting_id').notNull().references(() => meetings.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  payload: text('payload').notNull(), // JSON snapshot of strokes
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

// ==================== MEETING MESSAGES ====================
// In-meeting chat rows. `kind` distinguishes the payload shape:
//   - 'text':  `content` holds the message body; all file_* columns are NULL.
//   - 'file':  file uploaded via /messages/upload; filePath/name/size/mime set.
//   - 'image': same as 'file' plus width/height populated from sharp metadata.
// Access control is enforced at the API layer via `canJoinMeeting` — DB-level
// cascade ensures message rows die with the meeting (and with the user).
export const meetingMessages = sqliteTable('meeting_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  meetingId: integer('meeting_id').notNull().references(() => meetings.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(), // 'text' | 'file' | 'image'
  content: text('content'),
  filePath: text('file_path'),
  fileName: text('file_name'),
  fileSize: integer('file_size'),
  mimeType: text('mime_type'),
  width: integer('width'),
  height: integer('height'),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [
  index('idx_meeting_messages_meeting_created').on(table.meetingId, table.createdAt),
]);

// ==================== WORKSPACES ====================
// A workspace is an Excalidraw-like collaborative drawing surface (canvas of
// elements: shapes, text, freehand, images, tables…). Each workspace gets its
// own LiveKit room (UUID `roomName`) over which `workspace_ops` are streamed
// for realtime collaboration. Snapshots persist the merged state for fast
// initial load + late-join recovery — `snapshotVersion` is bumped each time
// `snapshotPayload` is rewritten and used as the high-water mark when fetching
// op log replays via `GET /api/workspaces/:id/ops?since=<v>`.
//
// `meetingId` is a soft link to a `meetings` row (SET NULL on meeting delete)
// so the same canvas survives meeting end and can be reopened later.
export const workspaces = sqliteTable('workspaces', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ownerId: integer('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  // UUID identifying the LiveKit room. Unique to keep room namespaces clean.
  roomName: text('room_name').notNull(),
  // Optional anchor to a meeting. SET NULL keeps the workspace alive when the
  // meeting is deleted — boards live longer than the meeting they were born in.
  meetingId: integer('meeting_id').references(() => meetings.id, { onDelete: 'set null' }),
  snapshotVersion: integer('snapshot_version').notNull().default(0),
  // JSON blob: { elements: { [id]: Element } }. Stored as TEXT so SQLite is
  // happy; parsing happens in the service layer.
  snapshotPayload: text('snapshot_payload').notNull().default('{}'),
  snapshotUpdatedAt: text('snapshot_updated_at'),
  // Path to a server-rendered preview thumbnail (Phase 3 polish).
  thumbnailPath: text('thumbnail_path'),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text('updated_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [
  uniqueIndex('workspaces_room_name_unique').on(table.roomName),
  index('idx_workspaces_meeting_id').on(table.meetingId),
  index('idx_workspaces_owner_id').on(table.ownerId),
]);

// ==================== WORKSPACE PARTICIPANTS ====================
// Mirrors `meeting_participants`: explicit invite list scoped per workspace.
// `role` controls visibility/edit rights (owner ≅ host, editor can mutate
// elements, viewer is read-only). UNIQUE(workspaceId, userId) keeps the row
// idempotent for repeated invites.
export const workspaceParticipants = sqliteTable('workspace_participants', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  workspaceId: integer('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('editor'), // 'owner' | 'editor' | 'viewer'
  joinedAt: text('joined_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  lastSeenAt: text('last_seen_at'),
}, (table) => [
  uniqueIndex('workspace_participants_ws_user_unique').on(table.workspaceId, table.userId),
]);

// ==================== WORKSPACE OPS ====================
// Append-only log of canvas mutations. Used both as the wire protocol payload
// (when we eventually want to replay) and as the durable source of truth for
// "what happened since snapshotVersion N". `clientOpId` is a UUID generated
// by the client to deduplicate retries — the UNIQUE index makes idempotent
// writes possible even when the client POSTs the same op twice.
//
// `baseVersion` records which snapshot the op was authored against — useful
// for future server-side rebase/merge logic and conflict diagnostics.
export const workspaceOps = sqliteTable('workspace_ops', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  workspaceId: integer('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  clientOpId: text('client_op_id').notNull(),
  baseVersion: integer('base_version').notNull(),
  payload: text('payload').notNull(), // JSON-encoded WorkspaceOp
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [
  uniqueIndex('workspace_ops_ws_client_op_unique').on(table.workspaceId, table.clientOpId),
  index('idx_workspace_ops_ws_id').on(table.workspaceId, table.id),
]);

// ==================== WORKSPACE CHAT MESSAGES ====================
// Per-workspace LLM chat history (Phase 1 = simple Q&A, Phase 2 will allow
// the assistant to emit `commands` payloads alongside the text).
// `attachments` is a JSON array of {assetId, kind} for AI-generated images
// or uploads referenced from the message body.
export const workspaceChatMessages = sqliteTable('workspace_chat_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  workspaceId: integer('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // 'user' | 'assistant' | 'system'
  content: text('content').notNull(),
  attachments: text('attachments'), // JSON: Array<{ assetId: number; kind: string }>
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [
  index('idx_workspace_chat_ws_created').on(table.workspaceId, table.createdAt),
]);

// ==================== WORKSPACE ASSETS ====================
// Files attached to a workspace: uploads (`upload`) or AI-generated images
// (`ai`). The `filePath` points at `data/workspace-assets/<id>/<uuid>_<name>`.
// Image assets carry width/height for layout. `uploadedBy` is nullable to
// allow AI-generated rows when the producer was the assistant rather than
// a user — set to NULL when the producing user is later deleted.
export const workspaceAssets = sqliteTable('workspace_assets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  workspaceId: integer('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(), // 'upload' | 'ai'
  filePath: text('file_path').notNull(),
  mime: text('mime').notNull(),
  width: integer('width'),
  height: integer('height'),
  uploadedBy: integer('uploaded_by').references(() => users.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [
  index('idx_workspace_assets_ws').on(table.workspaceId),
]);

// ==================== WORKSPACE ELEMENT COMMENTS (Phase 3) ====================
// Per-element threaded comments. `elementId` is the canvas element UUID;
// rows survive even when the element is deleted (so historic threads remain
// readable by participants). `resolved` lets users hide finished threads.
export const workspaceElementComments = sqliteTable('workspace_element_comments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  workspaceId: integer('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  elementId: text('element_id').notNull(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  resolved: integer('resolved').notNull().default(0),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text('updated_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [
  index('idx_workspace_comments_ws_element').on(table.workspaceId, table.elementId),
  index('idx_workspace_comments_ws_created').on(table.workspaceId, table.createdAt),
]);

// ==================== WORKSPACE SNAPSHOTS HISTORY (Phase 3) ====================
// Append-only history of past snapshots. Triggered each time the live
// snapshot is saved; the most recent N entries per workspace are kept (older
// rows are pruned by the service layer). Rollback is supported by copying a
// row's `payload` back into `workspaces.snapshot_payload`.
export const workspaceSnapshotsHistory = sqliteTable('workspace_snapshots_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  workspaceId: integer('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  payload: text('payload').notNull(),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [
  index('idx_workspace_history_ws_created').on(table.workspaceId, table.createdAt),
]);

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

export type TimeTrackingEntry = typeof timeTrackingEntries.$inferSelect;
export type NewTimeTrackingEntry = typeof timeTrackingEntries.$inferInsert;

export type PaymentRequest = typeof paymentRequests.$inferSelect;
export type NewPaymentRequest = typeof paymentRequests.$inferInsert;

export type PaymentRequestItem = typeof paymentRequestItems.$inferSelect;
export type NewPaymentRequestItem = typeof paymentRequestItems.$inferInsert;

export type Meeting = typeof meetings.$inferSelect;
export type NewMeeting = typeof meetings.$inferInsert;

export type MeetingParticipant = typeof meetingParticipants.$inferSelect;
export type NewMeetingParticipant = typeof meetingParticipants.$inferInsert;

export type MeetingRecording = typeof meetingRecordings.$inferSelect;
export type NewMeetingRecording = typeof meetingRecordings.$inferInsert;

export type MeetingAnnotation = typeof meetingAnnotations.$inferSelect;
export type NewMeetingAnnotation = typeof meetingAnnotations.$inferInsert;

export type MeetingGuestToken = typeof meetingGuestTokens.$inferSelect;
export type NewMeetingGuestToken = typeof meetingGuestTokens.$inferInsert;

export type MeetingMessage = typeof meetingMessages.$inferSelect;
export type NewMeetingMessage = typeof meetingMessages.$inferInsert;

export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;

export type WorkspaceParticipant = typeof workspaceParticipants.$inferSelect;
export type NewWorkspaceParticipant = typeof workspaceParticipants.$inferInsert;

export type WorkspaceOpRow = typeof workspaceOps.$inferSelect;
export type NewWorkspaceOpRow = typeof workspaceOps.$inferInsert;

export type WorkspaceChatMessage = typeof workspaceChatMessages.$inferSelect;
export type NewWorkspaceChatMessage = typeof workspaceChatMessages.$inferInsert;

export type WorkspaceAsset = typeof workspaceAssets.$inferSelect;
export type NewWorkspaceAsset = typeof workspaceAssets.$inferInsert;

export type WorkspaceElementComment = typeof workspaceElementComments.$inferSelect;
export type NewWorkspaceElementComment = typeof workspaceElementComments.$inferInsert;

export type WorkspaceSnapshotHistory = typeof workspaceSnapshotsHistory.$inferSelect;
export type NewWorkspaceSnapshotHistory = typeof workspaceSnapshotsHistory.$inferInsert;
