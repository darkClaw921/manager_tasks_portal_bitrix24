# TaskHub Architecture

Веб-приложение для управления задачами с нескольких порталов Bitrix24. Единый интерфейс с CRUD задач, стадиями, комментариями, чеклистами, файлами, AI-отчётами.

## Tech Stack

- **Framework:** Next.js 15 (App Router, TypeScript)
- **Styling:** Tailwind CSS 4 (CSS-based `@theme` config)
- **State (client):** Zustand
- **Server state:** TanStack Query
- **DB:** SQLite via better-sqlite3
- **ORM:** Drizzle ORM
- **Auth:** JWT (jose) + bcryptjs
- **AI:** OpenAI SDK via OpenRouter (model: x-ai/grok-4.1-fast)
- **Cron:** node-cron (scheduled tasks via instrumentation.ts)
- **Markdown:** react-markdown (rendering AI report content)
- **PWA:** @ducanh2912/next-pwa (service worker, offline fallback, caching strategies)
- **Push:** web-push (VAPID, Web Push Protocol)
- **Sanitization:** isomorphic-dompurify (XSS protection, works in SSR and client)
- **Font:** Inter (Google Fonts via next/font)

---

## Project Structure

```
src/
├── middleware.ts                  # Next.js Edge middleware: auth redirect (protects /dashboard, /tasks, /calendar, etc.; redirects /login if authenticated) + security headers (X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy) via addSecurityHeaders()
├── instrumentation.ts             # Next.js instrumentation hook: initializes cron jobs on server start (production or ENABLE_CRON=true)
├── app/                           # Next.js App Router
│   ├── layout.tsx                 # Root layout: Inter font, Providers wrapper, PWA metadata (manifest, theme-color, apple-web-app)
│   ├── page.tsx                   # Root page: redirects to /login or /dashboard via middleware
│   ├── globals.css                # Tailwind CSS 4 @theme + design tokens + base styles
│   ├── providers.tsx              # Client-side providers (TanStack Query + ToastProvider)
│   ├── favicon.ico
│   ├── ~offline/
│   │   └── page.tsx               # Offline fallback page: shown when user is offline and page is not cached
│   ├── error.tsx                  # Global error boundary: catches unhandled errors, shows error UI with retry
│   ├── (auth)/
│   │   └── login/page.tsx         # Login page: email+password form
│   ├── (dashboard)/
│   │   ├── layout.tsx             # Dashboard layout: Sidebar + Header + BottomTabs + CreateTaskModal + FiltersModal + TaskSidePanel
│   │   ├── error.tsx              # Dashboard error boundary: catches errors within dashboard, retry + navigate to dashboard
│   │   ├── dashboard/
│   │   │   ├── page.tsx           # Dashboard page: live StatCards (total/inProgress/completed/overdue) + TaskList with filters
│   │   │   └── loading.tsx        # Dashboard skeleton: 4 StatCards + 5 TaskRow skeletons
│   │   ├── tasks/
│   │   │   ├── page.tsx           # Страница задач: заголовок «Задачи» + TaskList с фильтрами, поиском и пагинацией
│   │   │   ├── loading.tsx        # Скелетон страницы задач: заголовок + поиск + фильтры + 8 TaskRowSkeleton
│   │   │   └── [id]/
│   │   │       ├── page.tsx       # Task detail page: uses TaskDetail component with comments, checklist, files, sidebar
│   │   │       └── loading.tsx    # Task detail skeleton: main content + sidebar
│   │   ├── portals/
│   │   │   ├── page.tsx           # Portals page: admin-centric (admin: AddPortalForm + PortalList with management; user: read-only list), Suspense for useSearchParams, OAuth callback notification, fetches isAdmin from /api/auth/me
│   │   │   ├── loading.tsx        # Portals skeleton: form + portal cards
│   │   │   └── [id]/settings/
│   │   │       └── page.tsx       # Portal settings page: 4 tabs (General, Users, User Mapping, Kanban Stages), URL query param sync (?tab=), breadcrumb navigation, admin-only access, lazy-loaded tab components via dynamic(), Suspense boundary
│   │   ├── settings/
│   │   │   ├── page.tsx           # Settings page: 3 tabs (Profile, Notifications, Portals) + admin-only 4th tab (Система → SystemSettings), all functional with save
│   │   │   └── loading.tsx        # Settings skeleton: tabs + form fields
│   │   ├── calendar/
│   │   │   ├── page.tsx           # Calendar page: CalendarHeader with view tabs (Неделя/Команда/Слоты), WeeklyView for week, TeamDayView for team-day, FreeSlotsView for free-slots, "Создать задачу" button via useUIStore
│   │   │   └── loading.tsx        # Calendar skeleton: header bar + 7-column grid with deterministic task block placeholders
│   │   ├── reports/
│   │   │   ├── page.tsx           # AI Reports page: Daily/Weekly tabs, StatCards, AI markdown summary, regenerate, AI chat
│   │   │   └── loading.tsx        # Reports skeleton: StatCards + content area
│   │   └── admin/
│   │       ├── layout.tsx         # Admin layout guard: checks isAdmin via /api/auth/me, redirects non-admins to /dashboard
│   │       └── users/
│   │           ├── page.tsx       # Admin users page: UserTable + CreateUserForm + UserDetailModal, full CRUD
│   │           └── loading.tsx    # Admin users skeleton: header + user cards
│   └── api/
│       ├── auth/
│       │   ├── login/route.ts     # POST: authenticate, return JWT cookie + user; rate-limited by IP (loginLimiter: 5/15min)
│       │   ├── me/route.ts        # GET: return current user from JWT
│       │   └── refresh/           # (placeholder)
│       ├── users/
│       │   ├── route.ts           # GET: list all users with portal counts (admin only); POST: create user (admin only)
│       │   └── [id]/
│       │       ├── route.ts       # GET: user details (admin or self); PATCH: update user (admin or self for profile); DELETE: delete user (admin only, not self)
│       │       ├── stats/route.ts # GET: user task statistics — total, inProgress, completed, overdue (admin only)
│       │       └── portals/route.ts # GET: user's portals (admin only, public fields)
│       ├── portals/
│       │   ├── route.ts           # GET: list user portals via user_portal_access (optional ?active filter, returns role+permissions); POST: initiate OAuth — requires app admin (returns authUrl)
│       │   └── [id]/
│       │       ├── route.ts       # GET: portal details (checks user_portal_access); PATCH: update name/color/isActive (requires portal admin or app admin); DELETE: soft-delete + unregister events (requires portal admin or app admin)
│       │       ├── access/
│       │       │   ├── route.ts       # GET: list users with access (portal/app admin); POST: grant user access with permissions
│       │       │   └── [userId]/route.ts # GET: access details; PATCH: update permissions; DELETE: revoke access (protects last admin)
│       │       ├── mappings/route.ts  # GET: list user-to-Bitrix24 mappings (portal/app admin); POST: create mapping {userId, bitrixUserId, bitrixName?} (409 on duplicate); DELETE: remove mapping by {userId}
│       │       ├── bitrix-users/route.ts # GET: fetch Bitrix24 users from portal (?search=query), portal/app admin only; returns 502 on Bitrix24 API errors
│       │       ├── custom-stages/
│       │       │   ├── route.ts       # GET: list custom stages with Bitrix24 mappings (any portal access); POST: create custom stage {title, color?, sort?} (portal admin)
│       │       │   └── [stageId]/
│       │       │       ├── route.ts   # PATCH: update custom stage {title?, color?, sort?} (portal admin); DELETE: delete custom stage + cascade mappings (portal admin)
│       │       │       └── mappings/route.ts # GET: list mapped Bitrix24 stages; POST: add mapping {bitrixStageId} (portal admin, 409 on conflict); DELETE: remove mapping {bitrixStageId} (portal admin)
│       │       ├── stages/route.ts # GET: cached stages enriched with customStage mapping info (optional ?refresh=true to re-fetch from Bitrix24)
│       │       └── sync/route.ts  # POST: full sync (stages + tasks + comments + checklists + files), updates last_sync_at
│       ├── calendar/
│       │   ├── tasks/route.ts     # GET: calendar tasks for date range (dateFrom, dateTo required; portalId?, responsibleIds? optional). Returns ALL matching tasks (cap 500, no pagination). Filters on startDatePlan/endDatePlan/deadline falling within range OR spanning it. Uses buildTaskAccessFilter for access control. Returns { data: TaskWithPortal[] }
│       │   └── team/route.ts      # GET: team day data (date required; portalId? optional). Returns { members: TeamMember[], tasks: TaskWithPortal[] }. Members from user_bitrix_mappings JOIN users JOIN portals filtered by accessible portals. Tasks use same date logic as calendar/tasks for a single day
│       ├── tasks/
│       │   ├── route.ts           # GET: paginated task list with permission-based filtering via buildTaskAccessFilter (portalId, status, priority, search, assignee, date range, sort); POST: create task on Bitrix24 + save to SQLite (verifies user_portal_access)
│       │   └── [id]/
│       │       ├── route.ts       # GET: single task (optional ?include=comments,checklist,files); PATCH: update on Bitrix24 + SQLite; DELETE: delete on Bitrix24 + SQLite
│       │       ├── start/route.ts     # POST: tasks.task.start on Bitrix24, set status=IN_PROGRESS locally
│       │       ├── complete/route.ts  # POST: tasks.task.complete on Bitrix24, set status=COMPLETED locally
│       │       ├── stage/route.ts     # POST: task.stages.movetask on Bitrix24, update stageId locally
│       │       ├── comments/route.ts  # POST: task.commentitem.add on Bitrix24, save comment locally
│       │       ├── checklist/
│       │       │   ├── route.ts       # POST: task.checklistitem.add on Bitrix24, save item locally
│       │       │   └── [itemId]/route.ts # PATCH: toggle complete/renew on Bitrix24; DELETE: delete on Bitrix24 + locally
│       │       └── files/         # (placeholder for file upload)
│       ├── webhooks/bitrix/
│       │   └── route.ts           # POST: receives Bitrix24 webhook events, verifies application_token by memberId (no userId), routes to handlers with { id, domain } portal info
│       ├── notifications/
│       │   ├── route.ts           # GET: paginated notification list with is_read filter
│       │   ├── [id]/route.ts      # PATCH: mark single notification as read
│       │   ├── unread-count/route.ts # GET: count of unread notifications
│       │   ├── read-all/route.ts  # POST: mark all notifications as read
│       │   └── subscribe/route.ts # POST: save push subscription; DELETE: remove push subscription
│       ├── settings/
│       │   └── route.ts           # GET: all settings as {key: value} (auth required); PATCH: update work hours {work_hours_start?, work_hours_end?} (admin only, validates 0-23/1-24, start<end)
│       ├── reports/
│       │   ├── route.ts           # GET: paginated list of user's AI reports (?type, ?page, ?limit)
│       │   ├── daily/route.ts     # GET: get/generate daily report (?date=YYYY-MM-DD); POST: force-regenerate daily report
│       │   ├── weekly/route.ts    # GET: get/generate weekly report (?week=YYYY-WNN); POST: force-regenerate weekly report
│       │   └── chat/route.ts      # POST: AI chat (streaming response); GET: chat history; DELETE: clear chat history
│       ├── install/route.ts        # POST: Bitrix24 app install callback — saves tokens, checks user access via user.current REST API + getMappedBitrixUserIds (returns access denied HTML if user not in mapping, fail-open on errors, skips check if no mappings); GET: serves install HTML page. Functions: getAccessDeniedHtml() — static HTML for denied access; getInstallHtml() — HTML with BX24.installFinish()
│       └── oauth/callback/route.ts # GET: OAuth callback from Bitrix24 — verifies state JWT, exchanges code for tokens, creates/updates portal (unique by memberId), auto-creates user_portal_access for connecting admin, triggers event registration + stages fetch
├── components/
│   ├── ui/
│   │   ├── index.ts               # Barrel export for all UI components
│   │   ├── Button.tsx             # Button: variants (primary/secondary/danger/ghost), sizes (sm/md/lg), loading spinner, forwardRef
│   │   ├── Badge.tsx              # Badge: variants (default/success/warning/danger/portal/primary), sizes (sm/md), custom portal color
│   │   ├── Avatar.tsx             # Avatar: sizes (sm/md/lg), image or initials with deterministic bg color from name hash
│   │   ├── PortalIndicator.tsx    # PortalIndicator: colored circle dot (sm/md) for portal identification
│   │   ├── NavItem.tsx            # NavItem: sidebar nav link with icon, active state via usePathname()
│   │   ├── SearchInput.tsx        # SearchInput: search icon, clear button, 300ms debounce via useDebounce hook
│   │   ├── StatCard.tsx           # StatCard: title, value number, icon, trend (+/- with color), for dashboard stats
│   │   ├── TaskRow.tsx            # TaskRow: portal dot, title, priority/status badges, avatar, deadline (overdue in red). Optional onClick prop: when provided renders div[role=button] calling onClick(taskId), otherwise renders Link to /tasks/[id]
│   │   ├── InputField.tsx         # InputField: label + input + error, forwardRef, all HTML input types
│   │   ├── SelectField.tsx        # SelectField: label + custom-styled select + error, forwardRef, options array
│   │   ├── TextareaField.tsx      # TextareaField: label + textarea + error, auto-resize, min-height 100px, forwardRef
│   │   ├── BottomTabBar.tsx       # BottomTabBar: fixed bottom wrapper, backdrop-blur, safe-area-inset-bottom, md:hidden
│   │   ├── EmptyState.tsx         # Reusable empty state: icon, title, description, optional CTA button
│   │   ├── ErrorState.tsx         # Reusable error state: error icon, message, retry button
│   │   ├── Skeleton.tsx           # Skeleton components: Skeleton, TaskRowSkeleton, StatCardSkeleton, DashboardSkeleton, PortalListSkeleton, ReportSkeleton, NotificationSkeleton
│   │   └── Toast.tsx              # Toast notification system: ToastProvider (wraps app), useToast hook, 4 types (success/error/warning/info), auto-dismiss, slide-in animation
│   ├── layout/
│   │   ├── index.ts               # Barrel export: Sidebar, Header, BottomTabs
│   │   ├── Sidebar.tsx            # Sidebar: 260px, bg #1E293B, logo, portal list with PortalIndicator, 6+1 NavItems (Dashboard/Задачи/Календарь/Порталы/AI Отчёты/Настройки + admin link conditional), real user name/email from /api/auth/me; mobile overlay via Zustand
│   │   ├── Header.tsx             # Header: SearchInput (desktop), filters button, "Создать задачу" primary button, notification bell with real unread count + NotificationDropdown, avatar; mobile hamburger
│   │   └── BottomTabs.tsx         # BottomTabs: 6 tabs (Задачи/Мои/Календарь/Порталы/AI/Настройки), SVG icons, active state, uses BottomTabBar wrapper
│   ├── tasks/
│   │   ├── index.ts               # Barrel export: TaskList, CreateTaskModal, TaskDetail, Comments, Checklist, Files, TaskSidePanel
│   │   ├── TaskList.tsx           # Task list: uses useTasks hook, portal filter (PortalIndicator chips), status tabs, search with debounce, pagination, skeleton loading, empty state
│   │   ├── CreateTaskModal.tsx    # Modal: portal select, title, description, priority, deadline, responsible ID, tags; uses useCreateTask; opens via Zustand activeModal='createTask'
│   │   ├── TaskDetail.tsx         # Full task detail: title, description (HTML), tags, right sidebar (status/priority/responsible/creator/deadline/time/accomplices/auditors/dates/Bitrix24 link), start/complete/delete buttons
│   │   ├── Comments.tsx           # Comment list with author avatar + date + HTML content; add comment form with send button
│   │   ├── Checklist.tsx          # Checklist: progress bar, checkbox toggle (optimistic), add/delete items, completed count/total
│   │   ├── Files.tsx              # File list: name, size, content type, download link
│   │   └── TaskSidePanel.tsx      # Slide-in side panel: overlay + animated panel (480px/full mobile), reads sidePanelTaskId from useUIStore, shows header (portal indicator, title, close, open full link), compact info (status/priority badges, responsible, deadline), scrollable comments chat (last 5, load earlier, sanitized HTML), comment input form with useAddComment, auto-scroll, Escape/backdrop/X close
│   ├── notifications/
│   │   ├── index.ts               # Barrel export: NotificationDropdown
│   │   └── NotificationDropdown.tsx # Dropdown panel: type icons, relative time, portal indicator, skeleton loading, empty state, click-to-navigate + auto-mark-read, "Прочитать все" button
│   ├── portals/
│   │   ├── index.ts               # Barrel export: AddPortalForm, PortalList
│   │   ├── AddPortalForm.tsx      # Form: domain input, Client ID, Client Secret, optional name, 8 color options, expandable section with install/handler URLs for Bitrix24 app setup, check/connect buttons, OAuth redirect (admin-only, conditionally rendered by portals page)
│   │   ├── PortalList.tsx         # Portal cards: initial letter avatar, domain, active badge; admin: inline edit (name/color), settings link, sync/disconnect buttons; non-admin: read-only view
│   │   ├── PortalAccessManager.tsx # Admin component: manage user access to portal — add user (select dropdown + role + permission checkboxes), list users with badges, edit/revoke per user; requires callbacks for grant/update/revoke
│   │   ├── BitrixUserMapping.tsx  # Admin component: map app users to Bitrix24 users — shows portal users with dropdown/autocomplete for Bitrix24 user selection, debounced search, save/remove mapping, mapped/total counter badge, loading skeletons
│   │   └── StageSettings.tsx      # Admin component: manage custom kanban stages — CRUD with color picker (12 presets + custom), up/down reorder, Bitrix24 stage mapping dropdown per stage, unmapped stages warning, refresh from Bitrix24 button, delete with confirmation
│   ├── calendar/
│   │   ├── index.ts               # Barrel export: TimeGrid, TaskBlock, NowIndicator, CalendarHeader, WeeklyView, TeamMemberHeader, TeamDayView, ParticipantSelector, AvailabilityGrid, SlotCard, FreeSlotsView
│   │   ├── TimeGrid.tsx           # Reusable time grid: left gutter (56px) with hour labels 09:00-18:00, configurable columns with sticky headers, 80px hour rows, tasks via renderTask callback, NowIndicator support
│   │   ├── TaskBlock.tsx          # Absolute-positioned task block: portalColor left border + tinted bg, overlap layout via columnIndex/totalColumns, compact mode, click → /tasks/{id}. Hidden tasks return null. OverflowIndicator (+N ещё badge) + OverflowPopover for overflow display
│   │   ├── NowIndicator.tsx       # Current time indicator: red line (2px) + red dot (10px), auto-updates every 60s, hidden outside 09:00-18:00
│   │   ├── CalendarHeader.tsx     # Shared calendar header: icon + title, prev/next nav, date label, "Сегодня" button, view tabs, actions slot, responsive flex-wrap
│   │   ├── WeeklyView.tsx        # Weekly calendar view: 7-column desktop grid (Mon-Sun), mobile single-day with DayTabs selector. Uses useCalendarTasks + getTaskTimeBlock + resolveOverlaps. Shows NowIndicator on today, highlights today, dims weekends. Loading skeleton + ErrorState + EmptyState + hidden tasks info badge
│   │   ├── TeamMemberHeader.tsx   # Column header for team member: Avatar (sm) + name (12px semibold) + position/email (10px secondary), truncated text, min-w 120px
│   │   ├── TeamDayView.tsx       # Team day view: one column per team member, tasks grouped by responsibleId, overlap resolution per member, NowIndicator on today, loading skeleton, error state, empty state (no members + no tasks), hidden tasks info badge. Uses useTeamDay hook, horizontal scroll for mobile
│   │   ├── ParticipantSelector.tsx # Horizontal row of selectable participant chips: "Участники" label, all/count toggle, member chips with Avatar (24px) + name, selected/unselected states, horizontal scroll
│   │   ├── AvailabilityGrid.tsx  # Color-coded availability grid (Mon-Fri): time column + 5 day columns, busy blocks colored by getBusyLevel (green=free, zinc shades=busy), legend at bottom; accepts optional workHours prop for custom range (defaults to WORK_HOURS 9-18)
│   │   ├── SlotCard.tsx          # Recommended free slot card: date + time range + duration, "Забронировать" button, best slot green highlighting, Russian date formatting
│   │   └── FreeSlotsView.tsx     # Complete free slots view: two-panel layout (left: participants + grid, right: recommended slots with duration tabs 30m/1h/2h), uses findFreeSlots with workHours from useWorkHours(), maps app-to-bitrix userIds, passes workHours to AvailabilityGrid, empty states
│   ├── reports/
│   │   ├── index.ts               # Barrel export: ReportSummary, ReportChat
│   │   ├── ReportSummary.tsx      # Report display: 4 StatCards (total/completed/inProgress/overdue), markdown content via react-markdown, regenerate button, loading skeleton, empty state
│   │   └── ReportChat.tsx         # AI chat interface: message bubbles (user/assistant), streaming typing effect, suggestion chips, auto-scroll, markdown rendering, clear history, Enter to send
│   ├── admin/
│   │   ├── index.ts               # Barrel export: UserTable, CreateUserForm, UserDetailModal
│   │   ├── UserTable.tsx           # Admin user table: email, name, role badge, portal count, created date; inline edit, delete with confirm; mobile cards layout
│   │   ├── CreateUserForm.tsx      # Create user form: email, password, first/last name, isAdmin checkbox; client validation
│   │   └── UserDetailModal.tsx     # User detail modal: StatCards (tasks stats), portal list, account info; fetches from /api/users/[id]/stats and /portals
│   └── settings/
│       └── SystemSettings.tsx     # System settings tab (admin only): work hours configuration with start (0-23) and end (1-24) select fields, client-side validation (start < end), useUpdateWorkHours mutation, toast notifications
├── lib/
│   ├── settings.ts                # App settings CRUD: getSetting(key), setSetting(key, value), getAllSettings(), getWorkHours() -> {start, end}, setWorkHours(start, end); uses Drizzle ORM upsert (onConflictDoUpdate)
│   ├── utils.ts                   # cn() utility: merge CSS class names, filtering falsy values
│   ├── utils/
│   │   └── sanitize.ts            # HTML sanitization via isomorphic-dompurify: sanitizeHtml() (whitelist of safe tags/attrs), sanitizeText() (strip all tags)
│   ├── db/
│   │   ├── index.ts               # DB initialization: creates SQLite connection, 15 tables (incl. app_settings), migrates existing portals to user_portal_access, runs seed
│   │   ├── schema.ts              # Drizzle ORM schema: 15 tables with types (users, portals, user_portal_access, user_bitrix_mappings, portal_custom_stages, portal_stage_mappings, tasks, task_stages, task_comments, task_checklist_items, task_files, notifications, ai_reports, ai_chat_messages, app_settings)
│   │   └── seed.ts                # Admin seed from env vars (ADMIN_EMAIL/PASSWORD) + default app settings seed (work_hours_start=9, work_hours_end=18)
│   ├── auth/
│   │   ├── jwt.ts                 # JWT sign/verify with jose (HS256, 7d expiry); getJwtSecret() — environment-aware secret enforcement (throws in production if JWT_SECRET missing, warns+fallback in dev); shared by middleware.ts and oauth.ts
│   │   ├── password.ts            # bcryptjs hash/verify
│   │   ├── password-policy.ts    # validatePassword(): enforces min 8 chars, uppercase, lowercase, digit; returns { valid, message } with Russian error messages
│   │   ├── middleware.ts          # getAuthUser(): extract JWT from cookie/Bearer header
│   │   └── guards.ts             # requireAuth(), requireAdmin(), isAuthError() helpers
│   ├── bitrix/
│   │   ├── client.ts              # Bitrix24Client class: call(method, params), callBatch(commands, max 50), auto token refresh on expired_token, retry once
│   │   ├── token-manager.ts       # getValidToken(portalId): checks expiry, per-portal mutex refresh via Promise chain, reads clientId/clientSecret from portal DB record (encrypted), saves new tokens (encrypted) to DB; redactSensitiveData() strips tokens from error logs; Bitrix24Error class
│   │   ├── oauth.ts               # getAuthUrl(domain, userId, clientId, clientSecret): signed JWT state with per-portal credentials, OAuth URL; verifyOAuthState(state) -> {userId, clientId, clientSecret}; exchangeCode(code, clientId, clientSecret): token exchange via oauth.bitrix.info
│   │   ├── events.ts              # registerEventHandlers(portalId): batch event.bind for ONTASKADD/UPDATE/DELETE/COMMENTADD; unregisterEventHandlers: batch event.unbind
│   │   ├── stages.ts              # fetchStages(portalId, entityId): calls task.stages.get, upserts to DB; getStagesForPortal(portalId, entityId?): local DB query sorted by sort
│   │   ├── stage-settings.ts     # Custom stage CRUD + Bitrix24 mapping: getCustomStages(portalId) with mappings JOIN, createCustomStage, updateCustomStage, deleteCustomStage (cascade), mapBitrixStageToCustom, unmapBitrixStage, getCustomStageForTask, reorderCustomStages, getCustomStageById, getCustomStageMappingsForPortal
│   │   ├── tasks.ts               # TASK_SELECT_FIELDS, mapBitrixStatus/mapStatusToBitrix, generateBitrixUrl, mapBitrixTaskToLocal, isTaskRelevantToUsers (checks task roles against mapped user IDs Set, returns true if empty set), upsertTask, fetchAllTasks (pagination), fetchSingleTask, getPortalDomain
│   │   ├── users.ts               # fetchBitrixUsers(portalId): paginated user.get API (50/page); searchBitrixUsers(portalId, query): user.get with FIND filter
│   │   ├── comments.ts            # mapBitrixCommentToLocal, fetchComments, syncComments, addComment (task.commentitem.add)
│   │   ├── checklist.ts           # mapBitrixChecklistItemToLocal, fetchChecklist, syncChecklist, addChecklistItem, toggleChecklistItem (complete/renew), deleteChecklistItem
│   │   ├── files.ts               # mapBitrixFileToLocal, fetchFiles, syncFiles
│   │   ├── sync.ts                # fullSync(portalId): stages + all tasks with pagination + comments/checklist/files per task + update last_sync_at; фильтрует задачи по маппингу пользователей (задачи без замапленных участников пропускаются через isTaskRelevantToUsers). syncSingleTask(portalId, bitrixTaskId): фильтрует задачу по маппингу — нерелевантные задачи не сохраняются
│   │   └── webhook-handlers.ts    # handleWebhookEvent dispatcher + handlers: handleTaskAdd, handleTaskUpdate, handleTaskDelete, handleCommentAdd, handleCommentUpdate; handleTaskAdd/handleTaskUpdate/handleCommentAdd проверяют релевантность задачи замапленным пользователям через isTaskRelevantToUsers (нерелевантные пропускаются); handleTaskUpdate удаляет локальную задачу если она стала нерелевантна; createNotification helper; notifyUser() checks notify_* flags; notifyRecipients() resolves multi-user dispatch via notification-resolver; PortalInfo is { id, domain } (no userId)
│   ├── portals/
│   │   ├── access.ts              # Portal access CRUD: getUserPortals, getPortalUsers, hasPortalAccess, isPortalAdmin, getPortalAccess, grantPortalAccess, updatePortalAccess, revokePortalAccess (last-admin protection), getAccessiblePortalIds
│   │   ├── mappings.ts            # User-Bitrix24 mapping CRUD: getBitrixUserIdForUser, getUserForBitrixUserId, getUsersForBitrixUserIds (bulk inArray), getAllMappingsForPortal (with user info JOIN), getMappedBitrixUserIds (returns Set<string> of all mapped bitrix user IDs for portal, no JOIN), createMapping, deleteMapping, updateMapping
│   │   ├── notification-resolver.ts # Notification recipient resolution: resolveNotificationRecipients(portalId, task) — collects bitrix user IDs from task, maps to app users, filters by can_see_* permissions, fallback to portal admin; resolveRecipientsForMention(portalId, bitrixUserIds) — maps mentioned bitrix IDs to app users without permission filtering
│   │   └── task-filter.ts         # Task access filtering: buildTaskAccessFilter(userId) — builds parameterized SQL WHERE using Drizzle ORM operators (eq, like, or, and) based on user_portal_access permissions + user_bitrix_mappings; buildPortalTaskFilter(userId, portalId) — single portal variant; returns SQL type; uses like() for JSON array fields (accomplices, auditors); getAccessiblePortalIds(userId) — returns portal ID list
│   ├── calendar/
│   │   └── utils.ts               # Calendar utilities: constants (HOUR_HEIGHT=80, WORK_HOURS 9-18, MAX_OVERLAP_COLUMNS=4), range helpers (getWeekRange Mon-Sun, getDayRange), pixel calculations (timeToPixelOffset clamped 0-720, getTaskTimeBlock from startDatePlan/endDatePlan/deadline), overlap algorithm (resolveOverlaps greedy column packing with cap at 4 columns — tasks beyond cap get hidden=true, carrier task gets overflowCount), free slot finder (findFreeSlots 30-min increment bitmap), busy level (getBusyLevel), Russian locale date formatting (formatWeekLabel, formatDayLabel, getDayShortName, isToday, isSameDay, isWeekend)
│   ├── notifications/
│   │   ├── mention-detector.ts    # detectMentions(text): parses [user=ID] BBCode; detectAndNotifyMentions(portalId, taskId, bitrixTaskId): resolves mentioned bitrix IDs to app users via resolveRecipientsForMention, creates mention notification + push for each with 60s per-user dedup
│   │   ├── overdue.ts             # checkOverdueTasks(userId?): uses buildTaskAccessFilter for per-user task visibility, finds overdue tasks (deadline < now, not completed), sends push notifications respecting notify_overdue flag
│   │   ├── digest.ts              # generateDigest(userId): uses generateDailySnapshot for rich content (task names, priorities, deadlines), full message in DB + truncated push body (~200 chars); checkOverdueTasks(): hourly scan using buildTaskAccessFilter for newly overdue tasks (1h window)
│   │   ├── snapshot.ts            # generateDailySnapshot(userId): builds per-user task snapshot (todayTasks, overdueTasks, stats) using buildTaskAccessFilter + portal JOIN; generateAllSnapshots(): generates snapshots for all digest-enabled users with portal access
│   │   └── push.ts                # Web Push via VAPID: sendPushNotification (DB + push delivery), deliverPushNotification (push-only, no DB record), savePushSubscription, removePushSubscription, getPushSubscription, deliverWebPush (handles 410 expired)
│   ├── ai/
│   │   ├── client.ts              # OpenRouter (OpenAI SDK) singleton: generateCompletion(system, user) -> text, streamCompletion(system, user, history) -> ReadableStream<string>, AIError class, isAIAvailable(), model: x-ai/grok-4.1-fast
│   │   ├── reports.ts             # generateDailyReport(userId, date?), generateWeeklyReport(userId, week?), regenerateReport(), getUserReports(); fetches tasks from SQLite, builds AI prompt, caches in ai_reports; fallback if AI unavailable
│   │   └── chat.ts                # chatAboutTasks(userId, message) -> ReadableStream<Uint8Array> for streaming; getChatHistory(), clearChatHistory(); task context (200 tasks), 20-message history
│   ├── crypto/
│   │   └── encryption.ts          # AES-256-GCM encryption: encrypt(plaintext)->iv:authTag:ciphertext (base64), decrypt(encrypted)->plaintext (backward compatible with plaintext), isEncrypted(value)->boolean; ENCRYPTION_KEY from env (64 hex chars), dev fallback key with warning, production throws if not set
│   ├── security/
│   │   └── rate-limiter.ts        # In-memory sliding-window rate limiter: RateLimiter class (Map<string, number[]>, check/consume methods, periodic cleanup); pre-configured instances: loginLimiter (5/15min per IP), webhookLimiter (100/min per member_id), aiLimiter (10/min per userId); rateLimitResponse() helper for 429 + Retry-After
│   └── cron/
│       └── scheduler.ts           # initializeCron(): node-cron jobs — hourly overdue check, per-minute digest delivery (matches user digest_time), 00:00 daily task snapshots, 00:05 daily report pre-generation; shouldEnableCron()
├── hooks/
│   ├── useDebounce.ts             # useDebounce<T>(value, delay): returns debounced value after delay ms of inactivity
│   ├── usePortals.ts              # TanStack Query hooks: usePortals (list), useUpdatePortal (PATCH), useDisconnectPortal (DELETE), useSyncPortal (POST sync), usePortalAccess, useGrantAccess, useUpdateAccess, useRevokeAccess
│   ├── usePortalSettings.ts       # TanStack Query hooks: useBitrixMappings(portalId), useCreateMapping(), useDeleteMapping(), useBitrixUsers(portalId, search?); custom stages: useCustomStages(portalId), useCreateCustomStage(), useUpdateCustomStage(), useDeleteCustomStage(), useMapBitrixStage(), useUnmapBitrixStage(), usePortalStages(portalId)
│   ├── useCalendarTasks.ts         # TanStack Query hooks: useCalendarTasks(dateFrom, dateTo, portalId?) — fetches calendar tasks for date range, queryKey ['calendar-tasks', ...]; useTeamDay(date, portalId?) — fetches team members + tasks for a day, queryKey ['calendar-team', ...]. Both staleTime: 30_000
│   ├── useTasks.ts                # TanStack Query hooks: useTasks (filtered list), useCreateTask, useUpdateTask, useDeleteTask, useStartTask, useCompleteTask, useMoveTaskStage
│   ├── useTask.ts                 # TanStack Query hooks: useTask (single with comments/checklist/files), useAddComment, useAddChecklistItem, useToggleChecklistItem (optimistic), useDeleteChecklistItem
│   ├── useNotifications.ts        # TanStack Query hooks: useNotifications (paginated list), useUnreadCount (30s polling), useMarkAsRead, useMarkAllAsRead
│   ├── usePushNotifications.ts    # Push notification hook: isSupported, isSubscribed, permission, subscribe(), unsubscribe(); handles service worker + PushManager lifecycle
│   ├── useReports.ts             # TanStack Query hooks: useDailyReport(date?), useWeeklyReport(week?), useRegenerateDaily(), useRegenerateWeekly()
│   ├── useWorkHours.ts           # TanStack Query hooks: useWorkHours() — fetches work hours from /api/settings (queryKey ['settings', 'work-hours'], staleTime 5min, defaults {start:9, end:18}); useUpdateWorkHours() — PATCH /api/settings mutation with cache invalidation
│   └── useUsers.ts               # TanStack Query hooks: useUsers (admin list), useUser(id), useCreateUser, useUpdateUser, useDeleteUser; AdminUser and UserDetail types
├── stores/
│   ├── ui-store.ts                # Zustand store: sidebarOpen, activeModal (createTask/filters), toggle/set/open/close actions
│   ├── portal-store.ts            # Zustand store with persist: portals[], activePortalId, CRUD actions; persists activePortalId to localStorage
│   └── calendar-store.ts          # Zustand store with persist: view (CalendarView), currentDate (ISO string), selectedUserIds, slotDuration (30/60/120); actions: setView, setCurrentDate, goToToday, navigateWeek(±1), navigateDay(±1), toggleUser, setSelectedUserIds, setSlotDuration; persists view, slotDuration, selectedUserIds to localStorage key 'taskhub-calendar-store'
└── types/
    ├── index.ts                   # Re-exports all types (user, portal, task, calendar, notification, bitrix, api)
    ├── user.ts                    # User, UserWithoutPassword, LoginInput, CreateUserInput, UpdateUserInput
    ├── portal.ts                  # Portal, PortalPublic, CreatePortalInput, UpdatePortalInput, PortalAccessRole, PortalAccessPermissions, UserPortalAccess, UserBitrixMapping, PortalMappingCreate, PortalCustomStage, PortalStageMapping
    ├── task.ts                    # Task, TaskWithPortal, TaskStage, TaskComment, TaskChecklistItem, TaskFile, TaskFilters, Create/UpdateTaskInput
    ├── calendar.ts                # CalendarView ('week'|'team-day'|'free-slots'), CalendarTask (extends TaskWithPortal + startY/height/startTime/endTime/columnIndex/totalColumns/hidden/overflowCount), FreeSlot, TeamMember
    ├── notification.ts            # Notification, NotificationType, AIReport, AIChatMessage
    ├── bitrix.ts                  # BitrixResponse, BitrixTask, BitrixStage, BitrixComment, BitrixChecklistItem, BitrixFile, BitrixUser, BitrixTokenResponse, BitrixWebhookEvent
    └── api.ts                     # ApiResponse<T>, PaginatedResponse<T>, ApiError
```

---

## Root Config Files

| File | Description |
|------|-------------|
| [package.json](./package.json) | Dependencies, scripts (dev, build, type-check, db:push/studio/generate, vapid:generate, db:encrypt) |
| [tsconfig.json](./tsconfig.json) | TypeScript strict mode, path alias `@/*` -> `./src/*`, excludes `service-worker/` dir |
| [next.config.ts](./next.config.ts) | Next.js + @ducanh2912/next-pwa config (caching strategies, offline fallback, custom worker) |
| [postcss.config.mjs](./postcss.config.mjs) | PostCSS with @tailwindcss/postcss plugin |
| [eslint.config.mjs](./eslint.config.mjs) | ESLint flat config with next/core-web-vitals + typescript |
| [drizzle.config.ts](./drizzle.config.ts) | Drizzle Kit config: SQLite dialect, schema path, DB credentials |
| [.env.example](./.env.example) | Template for all env vars (JWT_SECRET, ADMIN_*, BITRIX_*, OPENROUTER_*, VAPID_*, ENCRYPTION_KEY) |
| [.env.local](./.env.local) | Local development env vars |

---

## Database Schema (14 tables)

| Table | Key Fields | Constraints |
|-------|-----------|-------------|
| **users** | id, email, password_hash, first_name, last_name, is_admin, notify_* flags, push_subscription | email UNIQUE |
| **portals** | id, user_id FK, domain, name, color, member_id, client_id (encrypted), client_secret (encrypted), access_token, refresh_token, app_token | UNIQUE(member_id) |
| **user_portal_access** | id, user_id FK(users), portal_id FK(portals), role ('admin'\|'viewer'), can_see_responsible, can_see_accomplice, can_see_auditor, can_see_creator, can_see_all | UNIQUE(user_id, portal_id) |
| **user_bitrix_mappings** | id, user_id FK(users), portal_id FK(portals), bitrix_user_id, bitrix_name | UNIQUE(user_id, portal_id), UNIQUE(portal_id, bitrix_user_id) |
| **portal_custom_stages** | id, portal_id FK(portals), title, color, sort | - |
| **portal_stage_mappings** | id, portal_id FK(portals), custom_stage_id FK(portal_custom_stages CASCADE), bitrix_stage_id FK(task_stages CASCADE) | UNIQUE(portal_id, bitrix_stage_id) |
| **tasks** | id, portal_id FK, bitrix_task_id, title, status, priority, deadline, tags (JSON) | UNIQUE(portal_id, bitrix_task_id) |
| **task_stages** | id, portal_id FK, bitrix_stage_id, title, sort, system_type | UNIQUE(portal_id, bitrix_stage_id) |
| **task_comments** | id, task_id FK, bitrix_comment_id, author_name, post_message | UNIQUE(task_id, bitrix_comment_id) |
| **task_checklist_items** | id, task_id FK, bitrix_item_id, title, sort_index, is_complete | - |
| **task_files** | id, task_id FK, bitrix_file_id, name, size, download_url | - |
| **notifications** | id, user_id FK, type, title, message, portal_id FK, task_id FK, is_read | - |
| **ai_reports** | id, user_id FK, type (daily/weekly), period_start/end, content, stats (JSON) | - |
| **ai_chat_messages** | id, user_id FK, role (user/assistant), content | - |

All tables use INTEGER PRIMARY KEY AUTOINCREMENT. Foreign keys enforce CASCADE on delete (except notifications which use SET NULL for portal_id/task_id). Timestamps stored as ISO 8601 TEXT with CURRENT_TIMESTAMP default. On DB init, existing portals are auto-migrated to user_portal_access with admin role and can_see_all=1.

---

## Auth Flow

1. **Login:** POST `/api/auth/login` with `{email, password}` -> validates credentials, returns user JSON + sets `token` HttpOnly cookie (JWT, HS256, 7d)
2. **Edge Middleware:** [middleware.ts](./src/middleware.ts) runs on every non-API/static request. Verifies JWT via jose in Edge Runtime (uses shared `getJwtSecret()` from jwt.ts). Redirects unauthenticated users to `/login` (with `?redirect=` param), authenticated users from `/login` to `/dashboard`, and root `/` based on auth state. Excludes `/api`, `/_next`, `/static`, files with extensions. Adds security headers (X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy) to all responses via `addSecurityHeaders()`.
2a. **Password Policy:** [password-policy.ts](./src/lib/auth/password-policy.ts) enforces password strength (min 8 chars, uppercase, lowercase, digit). Used in POST `/api/users` and PATCH `/api/users/[id]` when setting/updating passwords.
3. **Auth check (API):** `getAuthUser(request)` in [lib/auth/middleware.ts](./src/lib/auth/middleware.ts) reads JWT from cookie or `Authorization: Bearer` header
4. **Route protection (API):** `requireAuth()` / `requireAdmin()` guards in [guards.ts](./src/lib/auth/guards.ts) return user or 401/403 response
5. **Current user:** GET `/api/auth/me` returns user profile (requires valid JWT)
6. **Admin seed:** On DB init, creates admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars via [seed.ts](./src/lib/db/seed.ts)

---

## Layout & UI Components

### Dashboard Layout ([`(dashboard)/layout.tsx`](./src/app/(dashboard)/layout.tsx))

- **Desktop (>= 768px):** [Sidebar](./src/components/layout/Sidebar.tsx) (260px, fixed left) + main area (Header + scrollable content)
- **Mobile (< 768px):** Sidebar hidden (accessible via hamburger overlay), Header with hamburger, [BottomTabs](./src/components/layout/BottomTabs.tsx) fixed at bottom with safe-area padding
- Content area has `pb-20` on mobile for BottomTabs clearance
- [CreateTaskModal](./src/components/tasks/CreateTaskModal.tsx) rendered at layout level, opens via Zustand `activeModal='createTask'`

### Zustand Stores

| Store | File | State | Persistence |
|-------|------|-------|-------------|
| UI | [ui-store.ts](./src/stores/ui-store.ts) | `sidebarOpen`, `activeModal` (createTask/filters) | None (resets on reload) |
| Portal | [portal-store.ts](./src/stores/portal-store.ts) | `portals[]`, `activePortalId` | `activePortalId` persisted to localStorage |

### UI Components ([`components/ui/`](./src/components/ui/))

16 reusable components matching the Pencil design system. All support `className` prop for customization. Form components (InputField, SelectField, TextareaField) use `forwardRef` for react-hook-form compatibility. Includes EmptyState, ErrorState, Skeleton variants, and Toast notification system.

### Task Components ([`components/tasks/`](./src/components/tasks/))

| Component | Description |
|-----------|-------------|
| [TaskList](./src/components/tasks/TaskList.tsx) | Paginated task list with portal filter (PortalIndicator chips), status tabs, search (debounced), skeleton loading, empty state, pagination controls |
| [CreateTaskModal](./src/components/tasks/CreateTaskModal.tsx) | Modal for creating task: portal select, title, description, priority, deadline, responsible ID, tags. Uses `useCreateTask` mutation |
| [TaskDetail](./src/components/tasks/TaskDetail.tsx) | Full task view: title, description (HTML), tags, checklist, comments, files. Right sidebar: status/priority/responsible/creator/deadline/time/bitrix_url. Action buttons: start/complete/delete |
| [Comments](./src/components/tasks/Comments.tsx) | Comment list (author avatar, date, HTML content) + add comment form |
| [Checklist](./src/components/tasks/Checklist.tsx) | Checklist with progress bar, toggle checkboxes (optimistic update), add/delete items |
| [Files](./src/components/tasks/Files.tsx) | File list with name, size, content type, download link |
| [TaskSidePanel](./src/components/tasks/TaskSidePanel.tsx) | Slide-in side panel overlay (480px, full on mobile). Reads `sidePanelTaskId` from `useUIStore`. Header with portal indicator, title, close button, "open full" link. Compact info: status/priority badges, responsible avatar, deadline. Scrollable comments chat (last 5, load earlier, sanitized HTML). Comment input form with `useAddComment`, auto-scroll to new comment. Close via Escape, backdrop click, X button |

### Calendar Components ([`components/calendar/`](./src/components/calendar/))

Reusable components for the calendar feature (weekly view, team day view, free slots view). Barrel exported from [`index.ts`](./src/components/calendar/index.ts).

| Component | Description |
|-----------|-------------|
| [TimeGrid](./src/components/calendar/TimeGrid.tsx) | Reusable time grid: left gutter (56px) with hour labels 09:00-18:00, configurable columns with sticky headers, 80px hour rows (720px total), tasks rendered via `renderTask(task, allColumnTasks)` callback (passes full column tasks array for overflow support), NowIndicator support, highlighted/dimmed columns. Props: `columns`, `tasks` (Map), `renderTask`, `showNowIndicator`, `nowColumnKey` |
| [TaskBlock](./src/components/calendar/TaskBlock.tsx) | Absolute-positioned task block within TimeGrid column. Left border (3px) colored by `portalColor`, light tinted background. Overlap layout via `columnIndex`/`totalColumns`. Shows title, time range, portal dot+name (if height > 60px). Compact mode for small blocks (<40px). Click navigates to `/tasks/{id}`. Returns null for `hidden` tasks. When `overflowCount > 0`, renders `OverflowIndicator` ("+N ещё" badge) with `OverflowPopover` listing hidden tasks on click |
| [NowIndicator](./src/components/calendar/NowIndicator.tsx) | Red horizontal line (2px) + red dot (10px) indicating current time. Auto-updates position every 60s via `setInterval`. Hidden outside working hours (09:00-18:00). Uses `timeToPixelOffset` from calendar utils |
| [CalendarHeader](./src/components/calendar/CalendarHeader.tsx) | Shared calendar header: icon + title, prev/next navigation buttons, date label, "Сегодня" button, view tabs (pill buttons with active state), actions slot. Responsive flex-wrap layout. Props: `title`, `icon`, `dateLabel`, `onPrev`/`onNext`/`onToday`, `viewTabs`, `onViewChange`, `actions` |
| [WeeklyView](./src/components/calendar/WeeklyView.tsx) | Weekly calendar view: 7-column desktop grid (Mon-Sun) with mobile single-day view + DayTabs horizontal selector. Uses `useCalendarStore` (currentDate), `usePortalStore` (activePortalId), `useCalendarTasks` hook. Converts `TaskWithPortal[]` to `CalendarTask[]` via `getTaskTimeBlock()`, groups by day, resolves overlaps. Renders `TimeGrid` with `TaskBlock` callback (passes overflow tasks). Today highlighted, weekends dimmed, `NowIndicator` on today column. Loading skeleton, `ErrorState`, `EmptyState` (calendar icon when no tasks), info badge showing "N задач без дат скрыты" when tasks without dates exist |
| [TeamMemberHeader](./src/components/calendar/TeamMemberHeader.tsx) | Column header for team member in Team Day view. Displays `Avatar` (sm, 28px) + name (12px font-semibold, truncated) + position or email fallback (10px text-secondary, truncated). Horizontal flex layout, min-width 120px, height 56px. Props: `member: TeamMember` |
| [TeamDayView](./src/components/calendar/TeamDayView.tsx) | Team day view: one column per team member from `useTeamDay` hook. Tasks grouped by `responsibleId` matching `member.bitrixUserId`, overlap resolution via `resolveOverlaps()` per member. Renders `TimeGrid` with `TeamMemberHeader` column headers and `TaskBlock` callback (passes overflow tasks). `NowIndicator` shown in first column on today. Loading skeleton (4-column placeholder), `ErrorState`, `EmptyState` with users icon and CTA to `/portals` when no Bitrix mappings exist, `EmptyState` with calendar icon when no tasks for the day, info badge showing "N задач без дат скрыты" when tasks without dates exist. Horizontal scroll (`overflow-x-auto`) for mobile |
| [ParticipantSelector](./src/components/calendar/ParticipantSelector.tsx) | Horizontal row of selectable participant chips for Free Slots view. Shows "Участники" label, all/count toggle button, and member chips with Avatar (24px) + name. Selected chips: bg-primary text-white; unselected: bg-background border. Horizontal scroll for overflow. Props: `members: TeamMember[]`, `selectedIds: number[]`, `onToggle`, `onSelectAll` |
| [AvailabilityGrid](./src/components/calendar/AvailabilityGrid.tsx) | Color-coded availability grid showing busy/free status per hour for Mon-Fri. Left time column (09:00-18:00), 5 day columns with headers (day short name + number, today highlighted). Day body: green background (success-light) with absolutely positioned busy blocks. Uses `getBusyLevel()` to determine block color: 0=transparent (green), 1=zinc-300, 2+=zinc-400, all=zinc-500. Groups consecutive same-level hours into blocks. Legend at bottom. Props: `tasks: TaskWithPortal[]`, `selectedUserIds: string[]`, `weekStart: Date` |
| [SlotCard](./src/components/calendar/SlotCard.tsx) | Recommended free slot card for Free Slots view. Shows day name + date (Russian), time range + duration, and "Забронировать" button. Best slot: green border + bg-success-light, green text/button. Normal: border-border, secondary text, outline button. Duration formatted as decimal hours (e.g. "3.5 ч"). Props: `slot: FreeSlot`, `onBook?: (slot: FreeSlot) => void` |
| [FreeSlotsView](./src/components/calendar/FreeSlotsView.tsx) | Complete free slots view combining ParticipantSelector, AvailabilityGrid, and SlotCard. Two-panel layout: left (participants + grid + legend), right (340px, recommended slots). Uses `useCalendarStore` (currentDate, selectedUserIds, slotDuration), `useCalendarTasks` (week range), `useTeamDay` (members). Maps app userIds to Bitrix userIds, calls `findFreeSlots()`. Duration filter tabs (30m/1h/2h) with active green styling. Zap icon header with slot count badge. Empty states for no participants and no slots found. Mobile: panels stack vertically |

### Hooks ([`hooks/`](./src/hooks/))

| Hook | Description |
|------|-------------|
| [useDebounce](./src/hooks/useDebounce.ts) | `useDebounce<T>(value, delay)` - returns value after `delay` ms of inactivity (default 300ms) |
| [usePortals](./src/hooks/usePortals.ts) | `usePortals()` - fetches portal list with access info; `useUpdatePortal()` - PATCH; `useDisconnectPortal()` - DELETE; `useSyncPortal()` - POST sync; `usePortalAccess(portalId)` - fetch users with access; `useGrantAccess()` - grant; `useUpdateAccess()` - update permissions; `useRevokeAccess()` - revoke |
| [useTasks](./src/hooks/useTasks.ts) | `useTasks(filters)` - paginated filtered list; `useCreateTask()`, `useUpdateTask()`, `useDeleteTask()`, `useStartTask()`, `useCompleteTask()`, `useMoveTaskStage()` |
| [useTask](./src/hooks/useTask.ts) | `useTask(id)` - single task with comments/checklist/files; `useAddComment()`, `useAddChecklistItem()`, `useToggleChecklistItem()` (optimistic), `useDeleteChecklistItem()` |
| [useNotifications](./src/hooks/useNotifications.ts) | `useNotifications(params)` - paginated notification list; `useUnreadCount()` - unread count with 30s polling; `useMarkAsRead()`, `useMarkAllAsRead()` - mutations |
| [usePushNotifications](./src/hooks/usePushNotifications.ts) | `usePushNotifications()` - push subscription lifecycle: `isSupported`, `isSubscribed`, `permission`, `subscribe()`, `unsubscribe()` |
| [useReports](./src/hooks/useReports.ts) | `useDailyReport(date?)`, `useWeeklyReport(week?)` - fetch/generate reports; `useRegenerateDaily()`, `useRegenerateWeekly()` - force-regenerate mutations |
| [useWorkHours](./src/hooks/useWorkHours.ts) | `useWorkHours()` - fetch work hours ({start, end}, defaults 9-18, staleTime 5min); `useUpdateWorkHours()` - PATCH /api/settings mutation with cache invalidation |

---

## Design Tokens (Tailwind CSS 4 @theme)

Defined in [globals.css](./src/app/globals.css) via CSS variables and `@theme inline`:

- **Primary:** `#2563EB` (bg-primary, text-primary)
- **Sidebar:** `#1E293B` (bg-sidebar)
- **Background:** `#F8FAFC` (bg-background)
- **Success/Warning/Danger:** `#16A34A` / `#F59E0B` / `#DC2626`
- **Portal dots:** Purple `#8B5CF6`, Cyan `#06B6D4`, Orange `#F97316`
- **Font sizes:** h1(28px), h2(24px), h3(17px), body(14px), small(13px), xs(11px)
- **Border radius:** input(8px), card(12px), modal(16px), badge(100px)

---

## Bitrix24 Integration

### OAuth Flow

1. Admin enters portal domain, Client ID, Client Secret on `/portals` page -> clicks "Connect" -> POST `/api/portals` (requires app admin) generates OAuth URL with signed JWT state (embeds clientId + clientSecret)
2. Admin redirects to `https://{domain}/oauth/authorize/` -> authorizes -> Bitrix24 redirects to `/api/oauth/callback`
3. [Callback route](./src/app/api/oauth/callback/route.ts) verifies state JWT (extracts clientId/clientSecret), exchanges code for tokens via `oauth.bitrix.info` using per-portal credentials, creates/updates portal in DB (unique by memberId, stores encrypted clientId/clientSecret), auto-creates user_portal_access for connecting admin (role='admin', can_see_all=true)
4. Background: [registerEventHandlers](./src/lib/bitrix/events.ts) binds ONTASKADD/UPDATE/DELETE/COMMENTADD, [fetchStages](./src/lib/bitrix/stages.ts) caches stages
5. Redirect to `/portals?success=...`

### Token Management ([`lib/bitrix/token-manager.ts`](./src/lib/bitrix/token-manager.ts))

- `getValidToken(portalId)` checks expiry (with 60s buffer), returns cached token or triggers refresh
- Per-portal mutex via `Map<portalId, Promise>` prevents concurrent refresh race conditions
- Refresh hits `https://oauth.bitrix.info/oauth/token/` with `grant_type=refresh_token`
- New tokens saved to DB immediately after refresh

### API Client ([`lib/bitrix/client.ts`](./src/lib/bitrix/client.ts))

- `Bitrix24Client.call(method, params)` - POST to `{clientEndpoint}{method}` with `auth` in body
- `Bitrix24Client.callBatch(commands)` - up to 50 commands in single `batch` call
- Auto-retry once on `expired_token` error (triggers token refresh then re-executes)
- Custom `Bitrix24Error` with `code` and `message`

### Task Sync ([`lib/bitrix/sync.ts`](./src/lib/bitrix/sync.ts))

- `fullSync(portalId)` - stages + all tasks (paginated by 50) + comments/checklist/files per task + update last_sync_at; фильтрует задачи по маппингу пользователей через `getMappedBitrixUserIds` + `isTaskRelevantToUsers` (задачи без замапленных участников пропускаются, не сохраняются в БД)
- `syncSingleTask(portalId, bitrixTaskId)` - fetch and upsert single task with related data (for webhooks); фильтрует задачу по маппингу — нерелевантные задачи не сохраняются
- Helper modules: [tasks.ts](./src/lib/bitrix/tasks.ts) (mapping, upsert, fetch), [comments.ts](./src/lib/bitrix/comments.ts), [checklist.ts](./src/lib/bitrix/checklist.ts), [files.ts](./src/lib/bitrix/files.ts)
- Bitrix24 status mapping: 1=NEW, 2=PENDING, 3=IN_PROGRESS, 4=SUPPOSEDLY_COMPLETED, 5=COMPLETED, 6=DEFERRED
- `bitrix_url` generation: `/workgroups/group/{groupId}/tasks/task/view/{taskId}/` for group tasks, `/company/personal/user/{userId}/tasks/task/view/{taskId}/` otherwise

### Event Handlers ([`lib/bitrix/events.ts`](./src/lib/bitrix/events.ts))

- `registerEventHandlers(portalId)` - batch `event.bind` for 4 task events, fallback to individual calls
- `unregisterEventHandlers(portalId)` - batch `event.unbind`, called on portal disconnect
- Handler URL: `{NEXT_PUBLIC_APP_URL}/api/webhooks/bitrix`

### Stages ([`lib/bitrix/stages.ts`](./src/lib/bitrix/stages.ts))

- `fetchStages(portalId, entityId)` - calls `task.stages.get`, upserts to `task_stages` table
- `getStagesForPortal(portalId, entityId?)` - reads from local DB, sorted by `sort`
- Entity types: `entityId=0` for "My Plan", `entityId={groupId}` for project kanban

### Portal CRUD API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/portals` | GET | List user's portals via user_portal_access (optional `?active=true/false`, returns role+permissions) |
| `/api/portals` | POST | Initiate OAuth — requires app admin, body: `{domain, clientId, clientSecret}`, returns `{ authUrl }` |
| `/api/portals/[id]` | GET | Portal details (checks user_portal_access or app admin) |
| `/api/portals/[id]` | PATCH | Update name, color, isActive (requires portal admin or app admin) |
| `/api/portals/[id]` | DELETE | Soft-delete (isActive=false) + unregister events (requires portal admin or app admin) |
| `/api/portals/[id]/access` | GET | List users with access to portal (portal admin or app admin) |
| `/api/portals/[id]/access` | POST | Grant user access with permissions (portal admin or app admin) |
| `/api/portals/[id]/access/[userId]` | GET | Get access details for specific user |
| `/api/portals/[id]/access/[userId]` | PATCH | Update user permissions (portal admin or app admin) |
| `/api/portals/[id]/access/[userId]` | DELETE | Revoke user access (protects last admin) |
| `/api/portals/[id]/stages` | GET | Cached stages (optional `?refresh=true`) |
| `/api/portals/[id]/sync` | POST | Full sync: stages + tasks + comments + checklists + files |

### Task CRUD API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/tasks` | GET | Paginated list with filters: portalId, status, priority, search (LIKE title), assignee, dateFrom/dateTo, sortBy, sortOrder, page, limit |
| `/api/tasks` | POST | Create task: Bitrix24 `tasks.task.add` -> save to SQLite. Body: `{portalId, title, description?, priority?, deadline?, tags?, groupId?}` |
| `/api/tasks/[id]` | GET | Single task with optional `?include=comments,checklist,files` |
| `/api/tasks/[id]` | PATCH | Update task: Bitrix24 `tasks.task.update` -> update SQLite. Body: `{title?, description?, priority?, deadline?, status?, responsibleId?, tags?}` |
| `/api/tasks/[id]` | DELETE | Delete task: Bitrix24 `tasks.task.delete` -> delete from SQLite (cascades) |
| `/api/tasks/[id]/start` | POST | Start task: Bitrix24 `tasks.task.start` -> status=IN_PROGRESS |
| `/api/tasks/[id]/complete` | POST | Complete task: Bitrix24 `tasks.task.complete` -> status=COMPLETED |
| `/api/tasks/[id]/stage` | POST | Move stage: Bitrix24 `task.stages.movetask`. Body: `{stageId}` |
| `/api/tasks/[id]/comments` | POST | Add comment: Bitrix24 `task.commentitem.add` -> save locally. Body: `{message}` |
| `/api/tasks/[id]/checklist` | POST | Add checklist item: Bitrix24 `task.checklistitem.add` -> save locally. Body: `{title}` |
| `/api/tasks/[id]/checklist/[itemId]` | PATCH | Toggle checklist: Bitrix24 `task.checklistitem.complete/renew`. Body: `{isComplete}` |
| `/api/tasks/[id]/checklist/[itemId]` | DELETE | Delete checklist item: Bitrix24 `task.checklistitem.delete` -> delete locally |

Task GET uses permission-based filtering via `buildTaskAccessFilter()` / `buildPortalTaskFilter()` from `task-filter.ts`. Task POST verifies access via `hasPortalAccess()`. All task API routes enforce access via user_portal_access.
Two-phase write pattern: Bitrix24 API first, then SQLite. If Bitrix24 fails, SQLite is not updated.

### Webhook Handler ([`api/webhooks/bitrix/route.ts`](./src/app/api/webhooks/bitrix/route.ts))

- POST endpoint receiving Bitrix24 event callbacks
- Parses both `application/json` and `application/x-www-form-urlencoded` (nested key format)
- Rate-limited by member_id (webhookLimiter: 100/min)
- Verifies `application_token` from event `auth` against portal's encrypted `app_token` in DB
- Rejects webhooks from portals without appToken configured (no bypass fallback)
- Identifies portal by `member_id` from event `auth`
- Returns 200 OK immediately, processes event asynchronously (fire-and-forget)
- Error responses: 429 (rate limited), 403 (invalid token / no appToken), 404 (unknown portal), 400 (missing member_id)
- Supported events: ONTASKADD, ONTASKUPDATE, ONTASKDELETE, ONTASKCOMMENTADD, ONTASKCOMMENTUPDATE

### Webhook Event Handlers ([`lib/bitrix/webhook-handlers.ts`](./src/lib/bitrix/webhook-handlers.ts))

| Handler | Trigger | Action |
|---------|---------|--------|
| `handleTaskAdd` | ONTASKADD | Fetch full task via `tasks.task.get`, проверяет релевантность через `isTaskRelevantToUsers` (нерелевантные пропускаются), upsert to SQLite, sync comments/checklist/files, resolve recipients via `resolveNotificationRecipients`, push `task_add` notification to each recipient |
| `handleTaskUpdate` | ONTASKUPDATE | Fetch updated task, проверяет релевантность через `isTaskRelevantToUsers` — если нерелевантна, удаляет локальную копию из SQLite; если релевантна: upsert, sync comments/checklist, resolve recipients, push `task_update` notification to each recipient |
| `handleTaskDelete` | ONTASKDELETE | Find local task, resolve recipients from local task data, push `task_delete` notification to each, delete from SQLite (cascades) |
| `handleCommentAdd` | ONTASKCOMMENTADD | Find/create local task, проверяет релевантность через `isTaskRelevantToUsers` при создании задачи (нерелевантные пропускаются), sync comments, resolve recipients, push `comment_add` notification to each, trigger mention detection |
| `handleCommentUpdate` | ONTASKCOMMENTUPDATE | Re-sync all comments for the task |

- `PortalInfo` type: `{ id, domain }` (no userId — multi-user model)
- `createNotification()` - helper to insert notification records into DB
- `notifyUser()` - checks `notify_*` user flags via `isNotifyEnabled()` before sending push notification
- `notifyRecipients()` - resolves recipients via `resolveNotificationRecipients` and calls `notifyUser` for each
- `bitrixTaskToTaskInfo()` / `localTaskToTaskInfo()` - convert task data to format expected by notification-resolver
- All handlers use try/catch for resilience - errors are logged but don't crash the process

### Notification Resolver ([`lib/portals/notification-resolver.ts`](./src/lib/portals/notification-resolver.ts))

- `resolveNotificationRecipients(portalId, task)` - collects bitrix user IDs from task (responsible, creator, accomplices, auditors), maps to app users via `user_bitrix_mappings`, filters by `can_see_*` permissions from `user_portal_access`, fallback to portal admin (`portals.userId`) when no mappings exist
- `resolveRecipientsForMention(portalId, bitrixUserIds)` - maps mentioned Bitrix24 user IDs to app users (no permission filtering — mentions are direct references)
- Both functions fallback to portal admin when no mappings exist for the portal

### Mention Detection ([`lib/notifications/mention-detector.ts`](./src/lib/notifications/mention-detector.ts))

- `detectMentions(text)` - parses `[user=ID]` BBCode patterns, returns unique Bitrix user IDs
- `detectAndNotifyMentions(portalId, taskId, bitrixTaskId)` - checks latest comment for mentions, resolves mentioned Bitrix24 user IDs to app users via `resolveRecipientsForMention`, sends push `mention` notification to each with per-user 60s dedup window
- Called from `handleCommentAdd` webhook handler

### Overdue Task Detection ([`lib/notifications/overdue.ts`](./src/lib/notifications/overdue.ts))

- `checkOverdueTasks(userId?)` - finds tasks with `deadline < now` and status not COMPLETED/DEFERRED/SUPPOSEDLY_COMPLETED
- Sends push `overdue` notification per task (respects `notify_overdue` flag)
- Can check all users (for cron) or a specific user

### Notification API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/notifications` | GET | Paginated list with `?page`, `?limit`, `?is_read` filter. Joins portal name/color. Auth required |
| `/api/notifications/unread-count` | GET | Returns `{ count }` of unread notifications. Auth required |
| `/api/notifications/[id]` | PATCH | Mark single notification as read. Verifies ownership. Auth required |
| `/api/notifications/read-all` | POST | Mark all user's unread notifications as read. Auth required |
| `/api/notifications/subscribe` | POST | Save PushSubscription JSON to `users.push_subscription`. Auth required |
| `/api/notifications/subscribe` | DELETE | Remove push subscription from `users.push_subscription`. Auth required |

### Notification UI

- **NotificationDropdown** ([`components/notifications/NotificationDropdown.tsx`](./src/components/notifications/NotificationDropdown.tsx)): dropdown panel from Header bell icon, shows last 15 notifications with type icons, relative time, portal indicator, "Прочитать все" button, click navigates to task + marks read
- **Header** updated: real unread count from `useUnreadCount` hook (30s polling via TanStack Query `refetchInterval`), dropdown toggle, removed mock data
- **useNotifications** hook: `useNotifications(params)` for paginated list, `useUnreadCount()` with 30s polling, `useMarkAsRead()`, `useMarkAllAsRead()` mutations

---

## PWA & Push Notifications

### PWA Configuration

- **@ducanh2912/next-pwa** integrated in [next.config.ts](./next.config.ts)
- **Manifest:** [public/manifest.json](./public/manifest.json) — name: "TaskHub", standalone display, theme_color: `#2563EB`, start_url: `/dashboard`
- **Icons:** [public/icons/](./public/icons/) — 192x192 and 512x512 PNGs (regular + maskable), "T" in blue circle
- **Service Worker:** generated as `public/sw.js` at build time, disabled in development
- **Offline Fallback:** [~offline/page.tsx](./src/app/~offline/page.tsx) — shown when user is offline and page is not cached
- **Custom Worker:** [service-worker/index.ts](./service-worker/index.ts) — push event listener (shows notification), notificationclick listener (navigates to task URL)
- **Caching Strategies:**
  - API routes (`/api/*`): NetworkFirst, 5min cache, 10s timeout
  - Google Fonts stylesheets: StaleWhileRevalidate, 1 year cache
  - Google Fonts webfonts: CacheFirst, 1 year cache
  - Images (jpg/png/svg/webp): CacheFirst, 30 day cache
  - Next.js static (`/_next/static/*`): StaleWhileRevalidate, 30 day cache

### Web Push Notifications

- **Library:** web-push (Node.js) with VAPID authentication
- **VAPID Keys:** generated via `npm run vapid:generate` ([scripts/generate-vapid-keys.js](./scripts/generate-vapid-keys.js)), stored in env vars
- **Push Module:** [lib/notifications/push.ts](./src/lib/notifications/push.ts)
  - `sendPushNotification(params)` — creates DB notification + delivers Web Push (non-blocking)
  - `deliverPushNotification(params)` — delivers Web Push only (no DB record), used by digest for separate DB/push content
  - `deliverWebPush(userId, payload)` — encrypts and sends via `webpush.sendNotification()`, auto-removes expired subscriptions (410/404)
  - `savePushSubscription(userId, subscription)` / `removePushSubscription(userId)` — stores/clears PushSubscription JSON in `users.push_subscription`
- **Client Hook:** [hooks/usePushNotifications.ts](./src/hooks/usePushNotifications.ts)
  - `subscribe()` — requests permission, creates PushManager subscription with VAPID key, sends to server
  - `unsubscribe()` — removes PushManager subscription and server record
- **Push Payload:** `{ title, body, icon, badge, data: { url, taskId, portalId }, tag }`
- **Notification Click:** Service worker `notificationclick` handler navigates to `data.url` (e.g., `/tasks/123`)
- **Expired Subscriptions:** Automatically removed on 410/404 response from push service

### Env Vars

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_APP_URL` | Public URL for OAuth callback and webhook handler |
| `VAPID_PUBLIC_KEY` | VAPID public key for Web Push (generated via `npm run vapid:generate`) |
| `VAPID_PRIVATE_KEY` | VAPID private key for Web Push (keep secret) |
| `VAPID_SUBJECT` | VAPID subject (mailto: email for push service contact) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Client-exposed VAPID public key (same as `VAPID_PUBLIC_KEY`) |
| `ENCRYPTION_KEY` | AES-256-GCM key (64 hex chars = 32 bytes) for encrypting credentials in DB. Required in production; dev uses fallback key. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

### Security: Credential Encryption

- **Module:** [lib/crypto/encryption.ts](./src/lib/crypto/encryption.ts) — AES-256-GCM encryption/decryption using Node.js `crypto`
  - `encrypt(plaintext)` — returns `base64(iv):base64(authTag):base64(ciphertext)` format
  - `decrypt(encrypted)` — parses format and decrypts; returns plaintext as-is if not encrypted (backward compatibility)
  - `isEncrypted(value)` — checks if value matches encrypted format (3 base64 parts separated by `:`)
- **Encrypted fields:** `portals.clientId`, `portals.clientSecret`, `portals.accessToken`, `portals.refreshToken`, `portals.appToken`, `users.pushSubscription`
- **Integration points:**
  - [token-manager.ts](./src/lib/bitrix/token-manager.ts) — decrypt on read, encrypt on write (token refresh)
  - [oauth/callback/route.ts](./src/app/api/oauth/callback/route.ts) — encrypt tokens on INSERT/UPDATE + appToken
  - [webhooks/bitrix/route.ts](./src/app/api/webhooks/bitrix/route.ts) — decrypt appToken for verification
  - [notifications/push.ts](./src/lib/notifications/push.ts) — encrypt pushSubscription on save, decrypt on read
- **Migration script:** [scripts/encrypt-existing-tokens.ts](./scripts/encrypt-existing-tokens.ts) — encrypts existing plaintext tokens (`npm run db:encrypt`). Idempotent, uses transactions

### Security: XSS Protection

- **Module:** [lib/utils/sanitize.ts](./src/lib/utils/sanitize.ts) — HTML sanitization via `isomorphic-dompurify` (works in SSR and client)
  - `sanitizeHtml(dirty)` — sanitizes HTML keeping whitelisted tags (b, i, u, s, em, strong, a, br, p, ul, ol, li, span, div, img, table, tr, td, th, thead, tbody, h1-h4, pre, code, blockquote) and attributes (href, target, rel, src, alt, class, style, width, height, colspan, rowspan). Removes script tags, event handlers, and other XSS vectors
  - `sanitizeText(dirty)` — strips all HTML tags, returns plain text
- **Integration points:**
  - [Comments.tsx](./src/components/tasks/Comments.tsx) — `comment.postMessage` sanitized before `dangerouslySetInnerHTML`
  - [TaskDetail.tsx](./src/components/tasks/TaskDetail.tsx) — `task.descriptionHtml` sanitized before `dangerouslySetInnerHTML`
  - [TaskSidePanel.tsx](./src/components/tasks/TaskSidePanel.tsx) — `comment.postMessage` sanitized before `dangerouslySetInnerHTML`

---

## Admin Panel & User Management

### Admin Layout Guard ([`(dashboard)/admin/layout.tsx`](./src/app/(dashboard)/admin/layout.tsx))

- Client component that checks `/api/auth/me` for `isAdmin` flag
- Redirects non-admin users to `/dashboard`
- Shows loading spinner while checking permissions

### Admin Users Page ([`(dashboard)/admin/users/page.tsx`](./src/app/(dashboard)/admin/users/page.tsx))

- Full CRUD for users: create, edit (inline), delete (with confirmation), view details
- UserTable: desktop table layout + mobile card layout, responsive
- CreateUserForm: validated form with email, password, name, isAdmin toggle
- UserDetailModal: shows StatCards (task stats), portal list, account info

### User API

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/users` | GET | Admin | List all users with portal counts |
| `/api/users` | POST | Admin | Create user (email, password, name, isAdmin) |
| `/api/users/[id]` | GET | Admin/Self | User details with notification prefs |
| `/api/users/[id]` | PATCH | Admin/Self | Update profile, notifications, role (admin fields admin-only) |
| `/api/users/[id]` | DELETE | Admin | Delete user (cannot delete self, cascades) |
| `/api/users/[id]/stats` | GET | Admin | Task statistics: total, inProgress, completed, overdue |
| `/api/users/[id]/portals` | GET | Admin | User's portals (public fields only) |

### Settings Page ([`(dashboard)/settings/page.tsx`](./src/app/(dashboard)/settings/page.tsx))

3 tabs (+ 1 admin-only):
- **Profile:** Edit first name, last name, email, timezone, language. Saved via PATCH `/api/users/[id]`
- **Notifications:** 7 toggle switches (notifyTaskAdd, notifyTaskUpdate, notifyTaskDelete, notifyCommentAdd, notifyMention, notifyOverdue, notifyDigest), digest time picker, push notification enable/disable via `usePushNotifications` hook
- **Portals:** Reuses PortalList component with sync/edit/disconnect actions
- **Система** (admin only): Work hours configuration via [`SystemSettings`](./src/components/settings/SystemSettings.tsx) — start/end hour selects, validation, PATCH `/api/settings`

### Sidebar Admin Link

- [Sidebar](./src/components/layout/Sidebar.tsx) fetches current user via `/api/auth/me` on mount
- Shows real user name and email in bottom section
- Conditionally renders "Пользователи" admin link when `isAdmin` is true

---

## Error Handling & Loading States

### Error Boundaries

- **Global:** [`app/error.tsx`](./src/app/error.tsx) — catches root-level errors, full-page error UI with retry
- **Dashboard:** [`(dashboard)/error.tsx`](./src/app/(dashboard)/error.tsx) — catches dashboard errors, inline error UI with retry + go to dashboard

### Loading States (Suspense Fallbacks)

Each main route has a `loading.tsx` that renders appropriate skeletons:
- [`dashboard/loading.tsx`](./src/app/(dashboard)/dashboard/loading.tsx) — DashboardSkeleton (4 StatCards + 5 TaskRows)
- [`tasks/loading.tsx`](./src/app/(dashboard)/tasks/loading.tsx) — Скелетон списка задач (заголовок + поиск + фильтры + 8 TaskRowSkeleton)
- [`tasks/[id]/loading.tsx`](./src/app/(dashboard)/tasks/[id]/loading.tsx) — Task detail skeleton
- [`portals/loading.tsx`](./src/app/(dashboard)/portals/loading.tsx) — Form + portal card skeletons
- [`settings/loading.tsx`](./src/app/(dashboard)/settings/loading.tsx) — Tab + form field skeletons
- [`reports/loading.tsx`](./src/app/(dashboard)/reports/loading.tsx) — ReportSkeleton
- [`admin/users/loading.tsx`](./src/app/(dashboard)/admin/users/loading.tsx) — User card skeletons

### Reusable Components

- **EmptyState** ([`components/ui/EmptyState.tsx`](./src/components/ui/EmptyState.tsx)): icon + title + description + CTA button
- **ErrorState** ([`components/ui/ErrorState.tsx`](./src/components/ui/ErrorState.tsx)): error icon + message + retry button
- **Toast** ([`components/ui/Toast.tsx`](./src/components/ui/Toast.tsx)): `ToastProvider` wraps app via providers.tsx, `useToast()` hook returns `toast(type, message)` function, auto-dismiss after 4s, slide-in animation, 4 types: success/error/warning/info
- **Skeleton** ([`components/ui/Skeleton.tsx`](./src/components/ui/Skeleton.tsx)): `Skeleton`, `TaskRowSkeleton`, `StatCardSkeleton`, `DashboardSkeleton`, `PortalListSkeleton`, `ReportSkeleton`, `NotificationSkeleton`

---

## AI Reports & Chat

### AI Client ([`lib/ai/client.ts`](./src/lib/ai/client.ts))

- Singleton `OpenAI` client configured for OpenRouter (`https://openrouter.ai/api/v1`)
- `generateCompletion(systemPrompt, userMessage, options?)` - returns text response from Claude
- `streamCompletion(systemPrompt, userMessage, history?, options?)` - returns `ReadableStream<string>` of text chunks
- `isAIAvailable()` - checks if `OPENROUTER_API_KEY` is configured
- `AIError` class with error codes: `missing_api_key`, `rate_limited`, `invalid_api_key`, `bad_request`, `timeout`, `server_error`
- SDK handles retry with exponential backoff (maxRetries: 3) for rate limits and server errors
- Default model: `x-ai/grok-4.1-fast`, temperature: 0.3, max_tokens: 4096

### Report Generation ([`lib/ai/reports.ts`](./src/lib/ai/reports.ts))

- `generateDailyReport(userId, date?)` - generates or returns cached daily report for YYYY-MM-DD date
- `generateWeeklyReport(userId, week?)` - generates or returns cached weekly report for YYYY-WNN week
- `regenerateReport(userId, type, params?)` - force-regenerate (deletes cached, creates new)
- `getUserReports(userId, options?)` - paginated list of reports from `ai_reports` table
- **Process**: Fetches user's tasks from SQLite (active during period), calculates stats (total, completed, inProgress, overdue, newTasks, commentsCount), sends to Claude with structured prompt, saves result to `ai_reports` table
- **Fallback**: When AI unavailable, generates structured markdown report without AI recommendations
- Stats stored as JSON in `ai_reports.stats` column

### AI Chat ([`lib/ai/chat.ts`](./src/lib/ai/chat.ts))

- `chatAboutTasks(userId, message)` - returns `ReadableStream<Uint8Array>` for streaming HTTP response
- System prompt includes up to 200 most relevant tasks (non-completed prioritized, sorted by changed_date)
- Last 20 messages from `ai_chat_messages` included as conversation history
- Both user and assistant messages saved to `ai_chat_messages` table
- `getChatHistory(userId, limit?)` - returns chat messages (oldest first)
- `clearChatHistory(userId)` - deletes all chat messages

### App Settings API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/settings` | GET | All settings as `{key: value}` (auth required) |
| `/api/settings` | PATCH | Update work hours `{work_hours_start?, work_hours_end?}` (admin only, validates ranges) |

### AI Reports API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/reports` | GET | Paginated list of user's reports (?type=daily/weekly, ?page, ?limit) |
| `/api/reports/daily` | GET | Get or generate daily report (?date=YYYY-MM-DD) |
| `/api/reports/daily` | POST | Force-regenerate daily report. Body: `{date?}` |
| `/api/reports/weekly` | GET | Get or generate weekly report (?week=YYYY-WNN) |
| `/api/reports/weekly` | POST | Force-regenerate weekly report. Body: `{week?}` |
| `/api/reports/chat` | POST | AI chat - streaming response. Body: `{message}` |
| `/api/reports/chat` | GET | Get chat history (?limit) |
| `/api/reports/chat` | DELETE | Clear chat history |

### AI Reports UI

- **Reports Page** ([`(dashboard)/reports/page.tsx`](./src/app/(dashboard)/reports/page.tsx)): Daily/Weekly tabs, report summary + AI chat
- **ReportSummary** ([`components/reports/ReportSummary.tsx`](./src/components/reports/ReportSummary.tsx)): 4 StatCards, AI markdown content via react-markdown, regenerate button, loading skeleton
- **ReportChat** ([`components/reports/ReportChat.tsx`](./src/components/reports/ReportChat.tsx)): message bubbles with markdown, streaming typing effect, suggestion chips, auto-scroll, clear history
- **useReports** hook: `useDailyReport()`, `useWeeklyReport()`, `useRegenerateDaily()`, `useRegenerateWeekly()`

---

## Cron Scheduler

### Instrumentation ([`instrumentation.ts`](./src/instrumentation.ts))

- Next.js instrumentation hook, runs `register()` on server start
- Conditionally imports and initializes cron only in Node.js runtime
- Enabled in production by default, or when `ENABLE_CRON=true`

### Scheduler ([`lib/cron/scheduler.ts`](./src/lib/cron/scheduler.ts))

| Schedule | Job | Description |
|----------|-----|-------------|
| `0 * * * *` (every hour) | Overdue check | Scans for tasks with deadline passed in last hour, creates `overdue` notifications + push |
| `* * * * *` (every minute) | Digest delivery | Checks if current HH:MM matches any user's `digest_time`, sends rich daily digest notification |
| `0 0 * * *` (00:00 daily) | Daily task snapshots | Generates task snapshots for all digest-enabled users via `generateAllSnapshots()` |
| `5 0 * * *` (00:05 daily) | Report pre-generation | Generates previous day's daily report for all users |

### Daily Snapshot ([`lib/notifications/snapshot.ts`](./src/lib/notifications/snapshot.ts))

- `generateDailySnapshot(userId)` - builds per-user snapshot: `{todayTasks, overdueTasks, stats}` using `buildTaskAccessFilter` + portal JOIN. Returns `SnapshotTask[]` with id, title, deadline, priority, status, portalName, portalId
- `generateAllSnapshots()` - iterates all digest-enabled users with portal access, returns `Map<userId, DailySnapshot>`

### Digest ([`lib/notifications/digest.ts`](./src/lib/notifications/digest.ts))

- `generateDigest(userId)` - generates rich daily digest: calls `generateDailySnapshot` on-the-fly, builds full message (task names, priorities `ВЫСОКИЙ`/`НИЗКИЙ`, deadlines in Russian format) for DB notification + truncated push body (~200 chars, max 5 tasks with "...ещё N"). Title: "Ежедневная сводка". Empty digest (no today/overdue tasks) is silently skipped
- `checkOverdueTasks()` - scans all users with `notify_overdue=true`, finds newly overdue tasks (1h window), sends `overdue` notifications

### Env Vars (AI & Cron)

| Variable | Description |
|----------|-------------|
| `OPENROUTER_API_KEY` | OpenRouter API key for AI features (Grok 4.1 Fast) |
| `ENABLE_CRON` | Set to `true` to enable cron in development (auto-enabled in production) |
