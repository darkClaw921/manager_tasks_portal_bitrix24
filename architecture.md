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
- **PDF:** pdfmake (server-side PDF generation with Roboto fonts for Cyrillic)
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
│   │   ├── payments/
│   │   │   ├── page.tsx           # Payments page: PaymentSummaryCards + PaymentFilters + batch actions bar + PaymentTable + pagination + PDF export. Uses usePayments, useUpdatePaymentStatus, useBatchUpdatePaymentStatus hooks. Admin sees user filter. Admin-only additions (Phase 6): header button "Отправить запрос оплаты" (opens PaymentRequestCreateDialog with presetUserId from filters.userId and presetRateIds from current selection), and tabs "Все платежи" | "Исходящие запросы" (OutgoingRequestsList). Non-admins never see the button or the tab switcher
│   │   │   └── loading.tsx        # Payments skeleton: 3 StatCardSkeleton + filters + 5 table row skeletons
│   │   ├── wallet/
│   │   │   └── page.tsx           # Wallet page: header "Кошелёк" + WalletSummaryCards + 4 табы (Заработано/Ожидается/Отложено/Запросы оплаты) с синхронизацией через ?tab= search param. Табы earned/expected/deferred рендерят WalletRatesTable через useWalletRates({ group }); клик "Изменить" открывает CustomPaymentDialog. Таб 'requests' рендерит PaymentRequestInbox (входящие payment requests). Использует useWalletSummary, useWalletRates из useWallet
│   │   └── admin/
│   │       ├── layout.tsx         # Admin layout guard: checks isAdmin via /api/auth/me, redirects non-admins to /dashboard
│   │       └── users/
│   │           ├── page.tsx       # Admin users page: UserTable + CreateUserForm + UserDetailModal + ChangePasswordModal, full CRUD
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
│       │       ├── renew/route.ts     # POST: tasks.task.update STATUS=3 on Bitrix24, set status=IN_PROGRESS + clear closedDate locally (resume completed/deferred task)
│       │       ├── stage/route.ts     # POST: task.stages.movetask on Bitrix24, update stageId locally
│       │       ├── comments/
│       │       │   ├── route.ts                 # POST: add comment. Accepts JSON ({message}) or multipart/form-data (content + files[]). Bitrix mode: task.commentitem.add. Local mode: insert with synthetic -Date.now() bitrixCommentId; multipart files saved to data/task-comment-files/<taskId>/<uuid>_<safeName> and persisted as CommentFile[] JSON in task_comments.attached_files
│       │       │   └── files/[fileId]/route.ts  # GET: stream local comment attachment (searches attached_files JSON across task's comments by UUID id, serves Content-Disposition: attachment). Bitrix-sync rows have their own downloadUrl — not served here
│       │       ├── checklist/
│       │       │   ├── route.ts       # POST: task.checklistitem.add on Bitrix24, save item locally
│       │       │   └── [itemId]/route.ts # PATCH: toggle complete/renew on Bitrix24; DELETE: delete on Bitrix24 + locally
│       │       └── files/
│       │           ├── route.ts                 # GET: list task_files rows (metadata). POST: upload file(s) — local portal only (Bitrix24 → 400). Accepts `file` or `files[]`/`files`, validates via safe-upload, stores at data/task-files/<taskId>/<uuid>_<safeName>, inserts task_files row with uploaded_by/file_path/file_name/file_size/mime_type
│       │           └── [fileId]/route.ts        # GET: stream download for local task file (sets Content-Disposition: attachment; filename=...). DELETE: remove row + on-disk payload; allowed for file author (uploaded_by === userId), portal admin, or global admin; ENOENT on unlink is swallowed
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
│       ├── time-tracking/
│       │   ├── active/route.ts    # GET: active timers for current user (stoppedAt IS NULL), JOIN tasks+portals for taskTitle/portalColor/portalName
│       │   ├── start/route.ts     # POST: start timer. Body: {taskId}. Checks task access via tasks+portals JOIN, 409 if already running
│       │   ├── stop/route.ts      # POST: stop timer. Body: {taskId}. Finds active entry, calculates duration in seconds, updates stoppedAt+duration
│       │   ├── [id]/route.ts      # DELETE: delete time tracking entry. Checks ownership (userId), 404 for missing/other user's entries
│       │   └── task/
│       │       └── [taskId]/route.ts # GET: task time tracking summary — all entries, totalDuration, activeEntry. Returns TaskTimeTrackingSummary
│       ├── wallet/
│       │   ├── summary/route.ts     # GET: aggregated wallet figures for current user — calls getWalletSummary. Returns { data: WalletSummary }. 401 unauth, 500 on DB error
│       │   └── rates/
│       │       ├── route.ts          # GET: user's rates enriched with paidAmount/expectedAmount/paymentStatus — calls getWalletRates(userId, { group? }). Validates ?group ∈ earned|expected|deferred (400 on invalid). Returns { data: WalletRate[] }
│       │       └── [id]/paid-amount/route.ts # PATCH: update paidAmount on a rate the caller owns. Body: { paidAmount: number } (finite, >=0). Ownership check via getTaskRateById (404/403). Delegates to setPaidAmount which auto-syncs isPaid/paidAt. Returns { data: TaskRate }
│       ├── payment-requests/
│       │   ├── route.ts              # POST: admin creates a payment request (isAdmin required, body {toUserId, items[{taskRateId, proposedAmount}], note?}, validation inline, returns 201 + created PaymentRequest). GET: ?direction=incoming|outgoing — incoming returns requests where toUserId=current user; outgoing returns fromUserId=current user (admin only, 403 otherwise). Exports mapPaymentRequestError helper for sibling routes
│       │   └── [id]/
│       │       ├── route.ts              # GET: returns full PaymentRequest detail (sender or recipient only). 404 if missing, 403 if caller is neither from/to user
│       │       ├── accept/route.ts       # POST: recipient accepts pending request. Optional body { overrides?: Record<itemIdStr, number> }. Accumulates applied amount onto taskRates.paidAmount, recomputes isPaid, status becomes 'modified' if overrides present else 'accepted'. 409 if not pending, 403 if not recipient
│       │       └── reject/route.ts       # POST: recipient rejects pending request. No body. Status='rejected', respondedAt=now. 409 if not pending, 403 if not recipient
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
│   │   ├── Sidebar.tsx            # Sidebar: 260px, bg #1E293B, logo, portal list with PortalIndicator, 8+1 NavItems (Dashboard/Задачи/Календарь/Порталы/AI Отчёты/Оплата/Кошелёк/Настройки + admin link conditional), real user name/email from /api/auth/me; mobile overlay via Zustand. Icons: DashboardIcon, TasksIcon, CalendarIcon, PortalsIcon, ReportsIcon, PaymentsIcon, WalletIcon (кошелёк — прямоугольник с кармашком), SettingsIcon, AdminIcon
│   │   ├── Header.tsx             # Header: SearchInput (desktop), filters button, "Создать задачу" primary button, ActiveTimersWidget, notification bell with real unread count + NotificationDropdown, avatar; mobile hamburger
│   │   └── BottomTabs.tsx         # BottomTabs: 7 tabs (Задачи/Мои/Календарь/Порталы/AI/Оплата/Настройки), SVG icons, active state, uses BottomTabBar wrapper
│   ├── tasks/
│   │   ├── index.ts               # Barrel export: TaskList, CreateTaskModal, TaskDetail, Comments, Checklist, Files, TaskSidePanel, TaskRateWidget
│   │   ├── TaskList.tsx           # Task list: uses useTasks hook, portal filter (PortalIndicator chips), status tabs, search with debounce, pagination, skeleton loading, empty state
│   │   ├── CreateTaskModal.tsx    # Modal: portal select, title, description, priority, deadline, responsible ID, tags; uses useCreateTask; opens via Zustand activeModal='createTask'. При открытии читает createTaskPrefill из ui-store (однократно через prefillAppliedRef-гард, чтобы не затирать пользовательский ввод) и предзаполняет title/description. При закрытии вызывает clearCreateTaskPrefill() и сбрасывает форму. Для локального портала виден блок «Вложения» с мультивыбором файлов (превью + удалить до отправки); после успешного `createTask.mutate` файлы последовательно POST-ятся в `/api/tasks/{newId}/files`, ошибки отдельных файлов не откатывают задачу, показываются toast-ом
│   │   ├── TaskDetail.tsx         # Full task detail: title, description (HTML), tags, right sidebar (status/priority/responsible/creator/deadline/time/TaskTimerControls/accomplices/auditors/TaskRateWidget/dates/Bitrix24 link), start/complete/delete buttons. Fetches `/api/auth/me` once to resolve isAdmin + currentUserId and forwards them to `<Files>` (для проверки прав на удаление) и `<Comments>` (`isLocal` флаг для paperclip-кнопки)
│   │   ├── TaskRateWidget.tsx     # Compact rate widget for TaskDetail sidebar: 4 states (loading skeleton, no-rate button, view mode with type/amount/hours/total/payment badge/note, inline edit form). Uses useTaskRate, useUpsertTaskRate, useDeleteTaskRate hooks. Props: taskId, timeSpent
│   │   ├── Comments.tsx           # Comment list (author avatar + date + HTML content) + add-comment form. Для локальных задач (`isLocal` prop) в форме видна paperclip-кнопка: pendingFiles в локальном state, превью-chips с удалением, submit передаёт `files` в `useAddComment` (multipart). Отрендеренные `attachedFiles` у существующих комментариев: `downloadUrl` → внешняя ссылка (Bitrix-sync), иначе — линк на `/api/tasks/[id]/comments/files/[fileId]` (локальный stream)
│   │   ├── Checklist.tsx          # Checklist: progress bar, checkbox toggle (optimistic), add/delete items, completed count/total
│   │   ├── Files.tsx              # Секция «Вложения». Для Bitrix24 — прежний рендер списка с `downloadUrl`. Для локальной задачи (isLocal): через `useTaskFiles` живой список, кнопка «Добавить файл» → `useUploadTaskFile`, кнопка удаления для автора файла или админа → `useDeleteTaskFile`. MIME-based иконки (image/pdf/archive/generic). Принимает props: files (initial), taskId, isLocal, currentUserId, isAdmin
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
│   ├── payments/
│   │   ├── index.ts               # Barrel export: PaymentSummaryCards, PaymentFilters, PaymentTable, PaymentRequestCreateDialog
│   │   ├── PaymentSummaryCards.tsx # 3 StatCards in grid (Всего заработано/Оплачено/Не оплачено) with RUB currency formatting, loading skeleton. Props: summary: PaymentSummary, loading?: boolean
│   │   ├── PaymentFilters.tsx     # Horizontal filter panel: portal select, date range (from/to), paid status, task status, user (admin only), reset button. Props: filters, onFiltersChange, portals, isAdmin, users
│   │   ├── PaymentTable.tsx       # Desktop HTML table + mobile cards: checkbox selection, task link, portal indicator, rate type, rate amount, hours, total, task status badge, clickable paid/unpaid badge. Empty state, skeleton loading. Props: rates, selectedIds, onToggleSelect, onSelectAll, onTogglePaid, loading
│   │   └── PaymentRequestCreateDialog.tsx # Admin-only dialog (Phase 6) to create a payment request. Props: { open, onOpenChange, presetUserId?, presetRateIds? }. Flow: pick recipient via useUsers dropdown → fetch his rates from /api/wallet/rates?userId=X (admin branch) → filter to outstanding (paidAmount < expectedAmount) → render checkbox list with per-rate numeric input pre-filled to remaining amount → optional note textarea → live total → submit via useCreatePaymentRequest. Validation: ≥1 item selected, each proposedAmount > 0. Esc/backdrop close, toast feedback on success/error
│   ├── wallet/
│   │   ├── index.ts               # Barrel export: WalletSummaryCards, WalletRatesTable, CustomPaymentDialog, PaymentRequestInbox, PaymentRequestCard, PaymentRequestModifyDialog, OutgoingRequestsList
│   │   ├── WalletSummaryCards.tsx # 4 StatCards in grid (Заработано/Ожидается/Оплачено/К получению) with RUB currency formatting, loading skeleton (StatCardSkeleton × 4). Props: summary: WalletSummary, loading?: boolean. Each card uses inline SVG icon (Wallet/Hourglass/CheckCircle/AlertCircle); 'Оплачено'/'К получению' have success/danger border tint
│   │   ├── WalletRatesTable.tsx   # Desktop HTML table + mobile cards rendering WalletRate[]: task link, portal indicator, expectedAmount, paidAmount, progress bar (paid/expected %) color-coded by paymentStatus, status badge (unpaid=danger, partial=warning, paid=success, overpaid=primary), "Изменить" button. Empty state, skeleton loading. Props: rates, loading?, onEdit(rate)
│   │   ├── CustomPaymentDialog.tsx # Modal manual paidAmount editor. Props: { rate: WalletRate | null, onClose }. Shows task title + expectedAmount (read-only), 3 quick-pick buttons (Полностью/Не оплачено/Своё), free-form numeric InputField, live progress bar, Save/Cancel footer. Uses useSetPaidAmount mutation + useToast. Esc/backdrop close, validation (finite >= 0). Returns null when rate is null (caller-controlled open state)
│   │   ├── PaymentRequestInbox.tsx # User-side inbox of incoming payment requests. Uses useIncomingRequests(). Splits list into "Ожидают ответа" (status=pending, sorted by createdAt DESC) and "История" (accepted/modified/rejected, sorted by respondedAt DESC). Loading state: 2 card skeletons. Error state: EmptyState with ErrorIcon + message. Empty state: EmptyState with InboxIcon. Rendered inside /wallet?tab=requests
│   │   ├── PaymentRequestCard.tsx # One PaymentRequest card. Props: { request: PaymentRequest, hideActions?: boolean }. Shows fromUserName, createdAt (+ respondedAt for non-pending), colored status badge, items list (taskTitle + proposedAmount + expectedAmount + appliedAmount-if-set), optional note block, totalAmount. For status='pending' renders 3 actions (unless hideActions=true, used by OutgoingRequestsList where the caller is the sender, not the recipient): "Принять как есть" (useAcceptPaymentRequest without overrides), "Изменить и принять" (opens PaymentRequestModifyDialog), "Отклонить" (window.confirm + useRejectPaymentRequest). For non-pending hides actions. Uses useToast for feedback
│   │   ├── PaymentRequestModifyDialog.tsx # Modal for per-item override editing. Props: { request: PaymentRequest | null, onClose }. Seeds form with proposedAmount per item, shows expectedAmount read-only, live-computes total, warns visually when appliedAmount > expectedAmount (overpaid). Submit builds `overrides` map containing ONLY items whose value differs from proposedAmount, then calls useAcceptPaymentRequest({ overrides }). If no diffs, sends plain accept. Esc/backdrop close, validation (finite >= 0). Returns null when request is null
│   │   └── OutgoingRequestsList.tsx # Admin-only outgoing payment requests view (Phase 6). Uses useOutgoingRequests(). Desktop: HTML table (Получатель / Сумма / Статус / Создан / Ответил); Mobile: card list. Rows sorted by createdAt DESC. Click row → modal with PaymentRequestCard (hideActions=true so pending requests do not surface accept/reject buttons to the sender). Loading skeletons, error and empty states. Rendered inside the 'Исходящие запросы' tab on /payments
│   ├── time-tracking/
│   │   ├── index.ts               # Barrel export: ActiveTimersWidget, TaskTimerControls
│   │   ├── ActiveTimersWidget.tsx  # Header dropdown widget: clock icon trigger with active timer count badge, dropdown with timer list (portal indicator, task title, portal name, live HH:MM:SS via useElapsedTime, stop button), click navigates to task, close on outside click/Escape, empty state, loading skeleton. Uses useActiveTimers, useStopTimer, useElapsedTime hooks
│   │   └── TaskTimerControls.tsx   # Task detail sidebar widget: section header, live timer display + Stop button (red) when active, Start button (primary) when idle, total accumulated time via formatDuration, expandable history list with date/duration/delete per completed session. Props: { taskId: number }. Uses useTaskTimeTracking, useStartTimer, useStopTimer, useDeleteTimeEntry, useElapsedTime, formatDuration
│   ├── admin/
│   │   ├── index.ts               # Barrel export: UserTable, CreateUserForm, UserDetailModal, ChangePasswordModal
│   │   ├── UserTable.tsx           # Admin user table: email, name, role badge, portal count, created date; inline edit, delete with confirm; mobile cards layout
│   │   ├── CreateUserForm.tsx      # Create user form: email, password, first/last name, isAdmin checkbox; client validation
│   │   ├── UserDetailModal.tsx     # User detail modal: StatCards (tasks stats), portal list with role/Active badges, account info; portals fetched via useUserPortals (admin endpoint), grant-access dropdown + "Добавить" button listing portals the user does NOT have via usePortals() − current portals, calls useGrantUserPortalAccess (POST /api/portals/{portalId}/access with { userId, role: 'viewer', canSeeResponsible: true }), toast + inline error feedback, invalidates user-portals/users/portal-access query keys on success
│   │   └── ChangePasswordModal.tsx # Admin change-password modal: new password + confirm inputs, client policy validation (len/upper/lower/digit), calls PATCH /api/users/[id] with password field
│   └── settings/
│       └── SystemSettings.tsx     # System settings tab (admin only): work hours configuration with start (0-23) and end (1-24) select fields, client-side validation (start < end), useUpdateWorkHours mutation, toast notifications
├── lib/
│   ├── settings.ts                # App settings CRUD: getSetting(key), setSetting(key, value), getAllSettings(), getWorkHours() -> {start, end}, setWorkHours(start, end); uses Drizzle ORM upsert (onConflictDoUpdate)
│   ├── utils.ts                   # cn() utility: merge CSS class names, filtering falsy values
│   ├── utils/
│   │   └── sanitize.ts            # HTML sanitization via isomorphic-dompurify: sanitizeHtml() (whitelist of safe tags/attrs), sanitizeText() (strip all tags)
│   ├── uploads/
│   │   └── safe-upload.ts         # Shared upload validation + persistence. Exports: `validateUpload(file, opts?)` (checks size≤25 MiB, blocks dangerous extensions .exe/.bat/.cmd/.sh/.ps1/…, sanitizes name via `sanitizeFileName`, returns { valid, safeName, mime, size, ext } | { valid:false, reason, status }); `saveUploadToDisk(buffer, { dir, fileName, mime? })` (mkdir recursive, writes `{uuid}_{safeName}`, path-traversal guard, returns { path, size, mime, storedName }); constants `MAX_UPLOAD_BYTES`, `DEFAULT_BLOCKED_EXTENSIONS`, `DEFAULT_BLOCKED_MIMES`. Used by meetings/messages upload, task files routes (POST /api/tasks/[id]/files) and comments multipart route
│   ├── db/
│   │   ├── index.ts               # DB initialization: creates SQLite connection, 19 tables (incl. app_settings, time_tracking_entries, payment_requests, payment_request_items), migrates existing portals to user_portal_access, runtime ALTER migrations (paid_amount on task_rates; uploaded_by/file_path/file_name/file_size/mime_type + idx_task_files_task_id on task_files), runs seed
│   │   ├── schema.ts              # Drizzle ORM schema: tables with types (users, portals, user_portal_access, user_bitrix_mappings, portal_custom_stages, portal_stage_mappings, tasks, task_stages, task_comments, task_checklist_items, task_files, task_rates (with paidAmount for partial payments), time_tracking_entries, payment_requests, payment_request_items, notifications, ai_reports, ai_chat_messages, app_settings, meetings, meeting_participants, meeting_recordings, meeting_annotations, meeting_guest_tokens, meeting_messages, workspaces, workspace_participants, workspace_ops, workspace_chat_messages, workspace_assets)
│   │   └── seed.ts                # seedAdmin (admin from ADMIN_EMAIL/PASSWORD env vars), default app settings seed (work_hours_start=9, work_hours_end=18), seedLocalPortal (idempotent bootstrap of synthetic local portal with memberId=LOCAL_PORTAL_MEMBER_ID, domain='local', placeholder 'LOCAL' tokens; owned by first admin user; creates user_portal_access + user_bitrix_mappings rows for every existing user so local tasks are accessible on upgrade)
│   ├── auth/
│   │   ├── jwt.ts                 # JWT sign/verify with jose (HS256, 7d expiry); getJwtSecret() — environment-aware secret enforcement (throws in production if JWT_SECRET missing, warns+fallback in dev); shared by middleware.ts and oauth.ts
│   │   ├── password.ts            # bcryptjs hash/verify
│   │   ├── password-policy.ts    # validatePassword(): enforces min 8 chars, uppercase, lowercase, digit; returns { valid, message } with Russian error messages
│   │   ├── middleware.ts          # getAuthUser(): extract JWT from cookie/Bearer header
│   │   └── guards.ts             # requireAuth(), requireAdmin(), isAuthError() helpers
│   ├── bitrix/
│   │   ├── client.ts              # Bitrix24Client class: call(method, params), callBatch(commands, max 50), auto token refresh on expired_token, retry once
│   │   ├── token-manager.ts       # getValidToken(portalId): checks expiry, per-portal mutex refresh via Promise chain, reads clientId/clientSecret from portal DB record (encrypted), saves new tokens (encrypted) to DB; throws Bitrix24Error('LOCAL_PORTAL') when portal.memberId===LOCAL_PORTAL_MEMBER_ID (last-mile guard — local portal has no Bitrix24 OAuth); redactSensitiveData() strips tokens from error logs; Bitrix24Error class
│   │   ├── oauth.ts               # getAuthUrl(domain, userId, clientId, clientSecret, name?, color?): signed JWT state carries per-portal credentials + portal metadata (name/color), returns OAuth URL; verifyOAuthState(state) -> {userId, clientId, clientSecret, name?, color?}; exchangeCode(code, clientId, clientSecret): token exchange via oauth.bitrix.info
│   │   ├── events.ts              # registerEventHandlers(portalId): batch event.bind for ONTASKADD/UPDATE/DELETE/COMMENTADD; unregisterEventHandlers: batch event.unbind
│   │   ├── stages.ts              # fetchStages(portalId, entityId): calls task.stages.get, upserts to DB; getStagesForPortal(portalId, entityId?): local DB query sorted by sort
│   │   ├── stage-settings.ts     # Custom stage CRUD + Bitrix24 mapping: getCustomStages(portalId) with mappings JOIN, createCustomStage, updateCustomStage, deleteCustomStage (cascade), mapBitrixStageToCustom, unmapBitrixStage, getCustomStageForTask, reorderCustomStages, getCustomStageById, getCustomStageMappingsForPortal
│   │   ├── tasks.ts               # TASK_SELECT_FIELDS, mapBitrixStatus/mapStatusToBitrix, generateBitrixUrl (returns string | null — null when bitrixTaskId<0, i.e. local synthetic tasks, so UI can hide "Открыть в Bitrix24" link), mapBitrixTaskToLocal, isTaskRelevantToUsers (checks task roles against mapped user IDs Set, returns false if empty set), upsertTask, fetchAllTasks (pagination), fetchSingleTask, getPortalDomain
│   │   ├── users.ts               # fetchBitrixUsers(portalId): paginated user.get API (50/page); searchBitrixUsers(portalId, query): user.get with FIND filter
│   │   ├── comments.ts            # mapBitrixCommentToLocal, fetchComments, syncComments, addComment (task.commentitem.add)
│   │   ├── checklist.ts           # mapBitrixChecklistItemToLocal, fetchChecklist, syncChecklist, addChecklistItem, toggleChecklistItem (complete/renew), deleteChecklistItem
│   │   ├── files.ts               # mapBitrixFileToLocal, fetchFiles, syncFiles
│   │   ├── sync.ts                # fullSync(portalId): early-return {tasksCount:0, errors:[]} when isLocalPortalId(portalId) (no network call); otherwise stages + all tasks with pagination + comments/checklist/files per task + update last_sync_at; фильтрует задачи по маппингу пользователей (задачи без замапленных участников пропускаются через isTaskRelevantToUsers). syncSingleTask(portalId, bitrixTaskId): early-return null for local portal; otherwise фильтрует задачу по маппингу — нерелевантные задачи не сохраняются
│   │   └── webhook-handlers.ts    # handleWebhookEvent dispatcher + handlers: handleTaskAdd, handleTaskUpdate, handleTaskDelete, handleCommentAdd, handleCommentUpdate; handleTaskAdd/handleTaskUpdate/handleCommentAdd проверяют релевантность задачи замапленным пользователям через isTaskRelevantToUsers (нерелевантные пропускаются); handleTaskUpdate удаляет локальную задачу если она стала нерелевантна; createNotification helper; notifyUser() checks notify_* flags; notifyRecipients() resolves multi-user dispatch via notification-resolver; PortalInfo is { id, domain } (no userId)
│   ├── portals/
│   │   ├── access.ts              # Portal access CRUD: getUserPortals, getPortalUsers, hasPortalAccess, isPortalAdmin, getPortalAccess, grantPortalAccess, updatePortalAccess, revokePortalAccess (last-admin protection), getAccessiblePortalIds
│   │   ├── local.ts               # Local (non-Bitrix24) portal helpers: LOCAL_PORTAL_MEMBER_ID='__local__' constant, getLocalPortalId() (cached DB lookup), invalidateLocalPortalCache(), isLocalPortal({memberId}) strict check, isLocalPortalId(portalId) async check
│   │   ├── mappings.ts            # User-Bitrix24 mapping CRUD: getBitrixUserIdForUser, getUserForBitrixUserId, getUsersForBitrixUserIds (bulk inArray), getAllMappingsForPortal (with user info JOIN), getMappedBitrixUserIds (returns Set<string> of all mapped bitrix user IDs for portal, no JOIN), createMapping, deleteMapping, updateMapping
│   │   ├── notification-resolver.ts # Notification recipient resolution: resolveNotificationRecipients(portalId, task) — collects bitrix user IDs from task, maps to app users, filters by can_see_* permissions, fallback to portal admin; resolveRecipientsForMention(portalId, bitrixUserIds) — maps mentioned bitrix IDs to app users without permission filtering
│   │   └── task-filter.ts         # Task access filtering: buildTaskAccessFilter(userId) — builds parameterized SQL WHERE using Drizzle ORM operators (eq, like, or, and) based on user_portal_access permissions + user_bitrix_mappings; buildPortalTaskFilter(userId, portalId) — single portal variant; returns SQL type; uses like() for JSON array fields (accomplices, auditors); getAccessiblePortalIds(userId) — returns portal ID list
│   ├── payments/
│   │   ├── calc.ts                # Shared expected-amount helper: computeExpectedAmount(rate, task, trackedTime?) -> number. Formula: hourly = amount * (hoursOverride ?? trackedTime/3600 ?? timeSpent/3600 ?? 0), fixed = amount. Used by getPaymentSummary and (downstream) wallet layer to keep expected-amount math in one place. Exports ExpectedAmountRate, ExpectedAmountTask structural types
│   │   ├── rates.ts               # Payment data access layer: getTaskRateForUser (single rate), getTaskRatesForUser (paginated with JOIN tasks+portals), getAllTaskRates (admin, with JOIN users), upsertTaskRate (INSERT ON CONFLICT UPDATE on user_id+task_id), updatePaymentStatus/updatePaymentStatusAdmin (toggle isPaid+paidAt), batchUpdatePaymentStatus/batchUpdatePaymentStatusAdmin (bulk toggle), getPaymentSummary (JS aggregation via computeExpectedAmount: totalEarned/totalPaid/totalUnpaid/taskCount), deleteTaskRate, isUserParticipant (checks via userBitrixMappings -> responsibleId/creatorId/accomplices/auditors), getTaskRateById. Exports rateWithTaskSelect (shared Drizzle select shape with subquery for trackedTime) and mapRowToTaskRateWithTask (row → TaskRateWithTask mapper) for reuse by wallet layer
│   │   └── pdf-generator.ts       # PDF report generator using pdfmake. Exports generatePaymentReport(params) -> Promise<Buffer>. Generates A4 landscape PDF with: title, user info (name/email/date), applied filters, summary cards (total/paid/unpaid in RUB), data table (task/portal/rate type/amount/hours/total/status/payment), total row, page numbers footer. Uses Roboto fonts for Cyrillic support. Calculates totals: hourly=amount*hours(hoursOverride ?? timeSpent/3600), fixed=amount. Russian status translations.
│   ├── wallet/
│   │   ├── payment-requests.ts    # Payment request service layer. PaymentRequestError class (codes: NOT_FOUND, FORBIDDEN, CONFLICT, VALIDATION). createPaymentRequest(adminId, input) — validates items non-empty, toUserId!==adminId, proposedAmount>0, all taskRateIds exist and belong to toUserId; in db.transaction inserts paymentRequests + paymentRequestItems + notifications row (type='payment_request', title='Новый запрос оплаты', message=note, portalId/taskId null). listIncomingRequests(userId) / listOutgoingRequests(adminId) — ordered by createdAt DESC, batch-load items + joined user names + taskTitle + expectedAmount (computed via computeExpectedAmount over task + rate + trackedTime subquery). getPaymentRequestDetail(requestId, userId) — sender or recipient only, throws NOT_FOUND/FORBIDDEN. acceptPaymentRequest(userId, requestId, overrides?) — validates pending + recipient + override keys reference valid item ids; in db.transaction: for each item applies (override ?? proposedAmount) to taskRates.paidAmount cumulatively (NOT overwriting), sets isPaid = (paidAmount >= expectedAmount), persists paymentRequestItems.appliedAmount, status='modified' if any override else 'accepted'. rejectPaymentRequest(userId, requestId) — pending+recipient check, status='rejected', respondedAt=now. Private helpers loadPaymentRequestById / loadPaymentRequestsByIds assemble PaymentRequest by joining users for names and taskRates+tasks+timeTrackingEntries for expectedAmount
│   │   └── wallet.ts              # Wallet service layer. getWalletSummary(userId) — single JOIN query + JS aggregation via computeExpectedAmount, buckets rates by parent task status (COMPLETED/SUPPOSEDLY_COMPLETED → earned; NEW/PENDING/IN_PROGRESS → expected; DEFERRED → deferred), sums paidAmount on earned bucket, returns { earned, expected, deferred, paid, outstanding, tasksEarnedCount, tasksExpectedCount } rounded to 2dp. getWalletRates(userId, { group? }) — returns WalletRate[] reusing rateWithTaskSelect/mapRowToTaskRateWithTask from payments/rates.ts, enriched with paidAmount/expectedAmount and derivePaymentStatus (unpaid|partial|paid|overpaid, epsilon-tolerant). setPaidAmount(userId, rateId, paidAmount) — ownership-checked UPDATE on task_rates, derives isPaid from paidAmount vs computed expectedAmount, sets/clears paidAt accordingly. Exports WalletGroup union and TASK_STATUS_GROUP constant.
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
│   │   ├── structured.ts          # generateStructured<T>({schema: ZodSchema, systemPrompt, userPrompt, model?, maxRetries?, schemaName?, maxTokens?, temperature?}) — wraps OpenRouter chat completions with response_format: { type: 'json_schema', strict: true } using z.toJSONSchema (Zod 4 built-in, draft-7); extractJson strips markdown fences; on parse OR safeParse failure retries with error feedback prepended to system prompt; throws AIError after maxRetries (default 2). Uses own OpenAI singleton mirrored from client.ts
│   │   ├── reports.ts             # generateDailyReport(userId, date?), generateWeeklyReport(userId, week?), regenerateReport(), getUserReports(); fetches tasks from SQLite, builds AI prompt, caches in ai_reports; fallback if AI unavailable
│   │   └── chat.ts                # chatAboutTasks(userId, message) -> ReadableStream<Uint8Array> for streaming; getChatHistory(), clearChatHistory(); task context (200 tasks), 20-message history
│   ├── crypto/
│   │   └── encryption.ts          # AES-256-GCM encryption: encrypt(plaintext)->iv:authTag:ciphertext (base64), decrypt(encrypted)->plaintext (backward compatible with plaintext), isEncrypted(value)->boolean; ENCRYPTION_KEY from env (64 hex chars), dev fallback key with warning, production throws if not set
│   ├── security/
│   │   └── rate-limiter.ts        # In-memory sliding-window rate limiter: RateLimiter class (Map<string, number[]>, check/consume methods, periodic cleanup); pre-configured instances: loginLimiter (5/15min per IP), webhookLimiter (100/min per member_id), aiLimiter (10/min per userId); rateLimitResponse() helper for 429 + Retry-After
│   └── cron/
│       ├── scheduler.ts           # initializeCron(): node-cron jobs — hourly overdue check, per-minute digest delivery (matches user digest_time), 00:00 daily task snapshots, 00:05 daily report pre-generation; shouldEnableCron()
│       └── meetings-cleanup.ts    # registerMeetingsCleanupCron(): every-minute tick calling tickEmptyMeetings() (see lib/meetings/cleanup.ts), idempotent registration, errors logged and swallowed
├── hooks/
│   ├── useDebounce.ts             # useDebounce<T>(value, delay): returns debounced value after delay ms of inactivity
│   ├── usePortals.ts              # TanStack Query hooks: usePortals (list), useUpdatePortal (PATCH), useDisconnectPortal (DELETE), useSyncPortal (POST sync), usePortalAccess, useGrantAccess, useUpdateAccess, useRevokeAccess
│   ├── usePortalSettings.ts       # TanStack Query hooks: useBitrixMappings(portalId), useCreateMapping(), useDeleteMapping(), useBitrixUsers(portalId, search?); custom stages: useCustomStages(portalId), useCreateCustomStage(), useUpdateCustomStage(), useDeleteCustomStage(), useMapBitrixStage(), useUnmapBitrixStage(), usePortalStages(portalId)
│   ├── useCalendarTasks.ts         # TanStack Query hooks: useCalendarTasks(dateFrom, dateTo, portalId?) — fetches calendar tasks for date range, queryKey ['calendar-tasks', ...]; useTeamDay(date, portalId?) — fetches team members + tasks for a day, queryKey ['calendar-team', ...]. Both staleTime: 30_000
│   ├── useTasks.ts                # TanStack Query hooks: useTasks (filtered list), useCreateTask, useUpdateTask, useDeleteTask, useStartTask, useCompleteTask, useRenewTask, useMoveTaskStage
│   ├── useTask.ts                 # TanStack Query hooks: useTask (single with comments/checklist/files), useAddComment (supports optional files?: File[] → multipart POST for local tasks, JSON otherwise), useAddChecklistItem, useToggleChecklistItem (optimistic), useDeleteChecklistItem
│   ├── useTaskFiles.ts            # TanStack Query hooks for task attachments: useTaskFiles(taskId) GET list, useUploadTaskFile(taskId) multipart POST, useDeleteTaskFile(taskId) DELETE. Query key: ['task-files', taskId]. Mutations invalidate both ['task-files', taskId] and ['task', taskId]
│   ├── usePayments.ts             # TanStack Query hooks: useTaskRate(taskId), useUpsertTaskRate(), useDeleteTaskRate(), usePayments(filters), useUpdatePaymentStatus(), useBatchUpdatePaymentStatus()
│   ├── useWallet.ts               # TanStack Query hooks for the user wallet: useWalletSummary() — GET /api/wallet/summary, queryKey ['wallet','summary']; useWalletRates(filters?: { group?: 'earned'|'expected'|'deferred' }) — GET /api/wallet/rates[?group=...], queryKey ['wallet','rates', filters]; useSetPaidAmount() — PATCH /api/wallet/rates/[id]/paid-amount mutation, onSuccess invalidates ['wallet'] и ['payments']. Exports WalletRatesFilters и SetPaidAmountInput types
│   ├── usePaymentRequests.ts      # TanStack Query hooks for payment requests: useIncomingRequests() — GET /api/payment-requests?direction=incoming, queryKey ['payment-requests','incoming']; useOutgoingRequests() — GET ?direction=outgoing, queryKey ['payment-requests','outgoing']; useCreatePaymentRequest() — POST /api/payment-requests, invalidates ['payment-requests'], ['wallet'], ['payments']; useAcceptPaymentRequest() — POST /api/payment-requests/[id]/accept with optional body { overrides }, invalidates ['payment-requests'], ['wallet'], ['payments']; useRejectPaymentRequest() — POST /api/payment-requests/[id]/reject, invalidates only ['payment-requests']. Exports AcceptPaymentRequestVariables { id, input? } and RejectPaymentRequestVariables { id }
│   ├── useNotifications.ts        # TanStack Query hooks: useNotifications (paginated list), useUnreadCount (30s polling), useMarkAsRead, useMarkAllAsRead
│   ├── usePushNotifications.ts    # Push notification hook: isSupported, isSubscribed, permission, subscribe(), unsubscribe(); handles service worker + PushManager lifecycle
│   ├── useReports.ts             # TanStack Query hooks: useDailyReport(date?), useWeeklyReport(week?), useRegenerateDaily(), useRegenerateWeekly()
│   ├── useWorkHours.ts           # TanStack Query hooks: useWorkHours() — fetches work hours from /api/settings (queryKey ['settings', 'work-hours'], staleTime 5min, defaults {start:9, end:18}); useUpdateWorkHours() — PATCH /api/settings mutation with cache invalidation
│   ├── useTimeTracking.ts        # TanStack Query hooks: useActiveTimers() (10s polling), useTaskTimeTracking(taskId) (10s polling), useStartTimer(), useStopTimer(), useDeleteTimeEntry(); utility hook useElapsedTime(startedAt) — live HH:MM:SS; utility function formatDuration(seconds) — HH:MM:SS
│   └── useUsers.ts               # TanStack Query hooks: useUsers (admin list), useUser(id), useUserPortals(id) (portals via user_portal_access incl. role+permissions), useCreateUser, useUpdateUser, useDeleteUser, useGrantUserPortalAccess (POST /api/portals/{portalId}/access, invalidates user-portals/users/portal-access); AdminUser, UserDetail, UserPortalEntry types
├── stores/
│   ├── ui-store.ts                # Zustand store: sidebarOpen, activeModal (createTask/filters), sidePanelTaskId, global filter state, createTaskPrefill ({title?, description?} | null); actions: toggle/setSidebarOpen, openModal/closeModal, openSidePanel/closeSidePanel, setGlobal* / clearFilters, hasActiveFilters, setCreateTaskPrefill/clearCreateTaskPrefill
│   ├── portal-store.ts            # Zustand store with persist: portals[], activePortalId, CRUD actions; persists activePortalId to localStorage
│   └── calendar-store.ts          # Zustand store with persist: view (CalendarView), currentDate (ISO string), selectedUserIds, slotDuration (30/60/120); actions: setView, setCurrentDate, goToToday, navigateWeek(±1), navigateDay(±1), toggleUser, setSelectedUserIds, setSlotDuration; persists view, slotDuration, selectedUserIds to localStorage key 'taskhub-calendar-store'
└── types/
    ├── index.ts                   # Re-exports all types (user, portal, task, calendar, notification, bitrix, api, payment, payment-request, time-tracking, wallet, meeting)
    ├── user.ts                    # User, UserWithoutPassword, LoginInput, CreateUserInput, UpdateUserInput
    ├── portal.ts                  # Portal, PortalPublic, CreatePortalInput, UpdatePortalInput, PortalAccessRole, PortalAccessPermissions, UserPortalAccess, UserBitrixMapping, PortalMappingCreate, PortalCustomStage, PortalStageMapping
    ├── task.ts                    # Task, TaskWithPortal, TaskStage, TaskComment, TaskChecklistItem, CommentFile (id: number | string with optional filePath/mime for local attachments), TaskFile (hybrid — Bitrix-sync fields bitrixFileId/name/size/downloadUrl/contentType + local-upload fields uploadedBy/filePath/fileName/fileSize/mimeType, all nullable), TaskFilters, Create/UpdateTaskInput
    ├── calendar.ts                # CalendarView ('week'|'team-day'|'free-slots'), CalendarTask (extends TaskWithPortal + startY/height/startTime/endTime/columnIndex/totalColumns/hidden/overflowCount), FreeSlot, TeamMember
    ├── notification.ts            # Notification, NotificationType, AIReport, AIChatMessage
    ├── bitrix.ts                  # BitrixResponse, BitrixTask, BitrixStage, BitrixComment, BitrixChecklistItem, BitrixFile, BitrixUser, BitrixTokenResponse, BitrixWebhookEvent
    ├── payment.ts                 # RateType, TaskRate, TaskRateWithTask, UpsertTaskRateInput, PaymentFilters, PaymentSummary
    ├── payment-request.ts         # Payment-request types: PaymentRequestStatus ('pending'|'accepted'|'modified'|'rejected'), PaymentRequestItem (id/taskRateId/taskTitle/proposedAmount/appliedAmount?/expectedAmount), PaymentRequest (id/fromUserId+Name/toUserId+Name/totalAmount/note/status/respondedAt/createdAt/items[]), CreatePaymentRequestInput ({toUserId, items:[{taskRateId, proposedAmount}], note?}), AcceptPaymentRequestInput ({overrides?: Record<itemIdStr, number>})
    ├── time-tracking.ts           # TimeTrackingEntry, ActiveTimerEntry (extends TimeTrackingEntry), TaskTimeTrackingSummary
    ├── wallet.ts                  # Wallet types: WalletPaymentStatus ('unpaid'|'partial'|'paid'|'overpaid'), WalletRate (extends TaskRateWithTask + paidAmount/expectedAmount/paymentStatus), WalletSummary (earned/expected/deferred/paid/outstanding/tasksEarnedCount/tasksExpectedCount)
    ├── meeting.ts                 # Meeting types: MeetingStatus ('scheduled'|'live'|'ended'), ParticipantRole ('host'|'participant'), RecordingTrackType ('audio'|'video'|'mixed'|'final_mkv'), RecordingStatus ('recording'|'processing'|'done'|'failed'); Meeting / MeetingParticipant / MeetingRecording (alias Recording) / MeetingAnnotation (+ New* variants) inferred from Drizzle schema; StrokeEvent / UndoEvent / ClearEvent and DrawingPayload (discriminated union on `type` for LiveKit data channel)
    ├── workspace.ts               # Workspace types: ElementKind ('rect'|'ellipse'|'line'|'arrow'|'text'|'sticky'|'freehand'|'image'|'table'), Element discriminated union (Rect/Ellipse/Line/Arrow/Text/Sticky/Freehand/Image/Table) with type-guards (isRectElement, isTextElement, etc.), BaseElement, ElementStyle; WorkspaceOp discriminated union (OpAdd|OpUpdate|OpTransform|OpDelete|OpZ) with isOp* guards; CursorPresence (normalised [0..1] coords + colour); WorkspaceSnapshot ({ elements: Record<id,Element> }); topic constants WORKSPACE_OPS_TOPIC ('workspace.ops') / WORKSPACE_CURSOR_TOPIC ('workspace.cursor'); WorkspaceRole ('owner'|'editor'|'viewer'), WorkspaceChatRole, WorkspaceAssetKind; DB row re-exports (Workspace/WorkspaceParticipant/WorkspaceOpRow/WorkspaceChatMessage/WorkspaceAsset)
    └── api.ts                     # ApiResponse<T>, PaginatedResponse<T>, ApiError
```

---

## Root Config Files

| File | Description |
|------|-------------|
| [package.json](./package.json) | Dependencies, scripts (dev, build, type-check, db:push/studio/generate, vapid:generate, db:encrypt) |
| [tsconfig.json](./tsconfig.json) | TypeScript strict mode, path alias `@/*` -> `./src/*`, excludes `service-worker/` and `meeting-server/` dirs (the worker has its own tsconfig with ES2022 target for BigInt/top-level await) |
| [next.config.ts](./next.config.ts) | Next.js + @ducanh2912/next-pwa config (caching strategies, offline fallback, custom worker), `output: "standalone"` for Docker |
| [postcss.config.mjs](./postcss.config.mjs) | PostCSS with @tailwindcss/postcss plugin |
| [eslint.config.mjs](./eslint.config.mjs) | ESLint flat config with next/core-web-vitals + typescript |
| [drizzle.config.ts](./drizzle.config.ts) | Drizzle Kit config: SQLite dialect, schema path, DB credentials |
| [Dockerfile](./Dockerfile) | Multi-stage production build: deps (npm ci) → builder (next build) → runner (node:20-alpine, standalone output, better-sqlite3 native) |
| [docker-compose.yml](./docker-compose.yml) | Production Docker Compose: single `taskhub` service, .env.production, named volume `taskhub-data` for SQLite persistence, healthcheck |
| [.dockerignore](./.dockerignore) | Excludes node_modules, .next, .git, .env*, data/, drizzle/ from Docker context |
| [.env.example](./.env.example) | Template for all env vars (JWT_SECRET, ADMIN_*, BITRIX_*, OPENROUTER_*, VAPID_*, ENCRYPTION_KEY) |
| [.env.local](./.env.local) | Local development env vars |

---

## Database Schema (23 tables)

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
| **task_files** | id, task_id FK(tasks CASCADE), bitrix_file_id, name, size, download_url, content_type, uploaded_by? FK(users SET NULL), file_path?, file_name?, file_size?, mime_type?, created_at — hybrid table: Bitrix-synced rows fill bitrix_file_id/download_url/content_type; local uploads (Phase 4) fill uploaded_by/file_path/file_name/file_size/mime_type; same row never mixes both | INDEX(task_id) |
| **task_rates** | id, user_id FK(users), task_id FK(tasks), rate_type ('fixed'\|'hourly'), amount, hours_override?, is_paid, paid_amount (REAL, DEFAULT 0 — Wallet feature for partial payments), paid_at?, note? | UNIQUE(user_id, task_id) |
| **time_tracking_entries** | id, user_id FK(users), task_id FK(tasks), started_at, stopped_at?, duration? (seconds) | - |
| **payment_requests** | id, from_user_id FK(users, admin), to_user_id FK(users, recipient), total_amount, note?, status ('pending'\|'accepted'\|'modified'\|'rejected'), responded_at? | - |
| **payment_request_items** | id, request_id FK(payment_requests CASCADE), task_rate_id FK(task_rates CASCADE), proposed_amount, applied_amount? (filled on accept) | - |
| **notifications** | id, user_id FK, type (`task_add`/`task_update`/`task_delete`/`comment_add`/`mention`/`overdue`/`digest`/`meeting_invite`/`payment_request`), title, message, portal_id FK, task_id FK, link? (arbitrary click-through URL, overrides the type-default route), is_read | - |
| **ai_reports** | id, user_id FK, type (daily/weekly), period_start/end, content, stats (JSON) | - |
| **ai_chat_messages** | id, user_id FK, role (user/assistant), content | - |
| **app_settings** | id, key UNIQUE, value | UNIQUE(key) |
| **meetings** | id, title, host_id FK(users CASCADE), room_name (LiveKit UUID), status ('scheduled'\|'live'\|'ended' — default 'scheduled'), recording_enabled, created_at, started_at?, ended_at?, empty_since? (ISO timestamp — armed when last participant leaves, nulled on rejoin; drives 5-min auto-close cron) | UNIQUE(room_name) |
| **meeting_participants** | id, meeting_id FK(meetings CASCADE), user_id FK(users CASCADE), role ('host'\|'participant' — default 'participant'), joined_at, left_at? | - |
| **meeting_recordings** | id, meeting_id FK(meetings CASCADE), track_type ('audio'\|'video'\|'mixed'\|'final_mkv'), user_id? (nullable — for per-user audio), file_path, egress_id (LiveKit), status ('recording'\|'processing'\|'done'\|'failed' — default 'recording'), started_at, ended_at?, size_bytes? | UNIQUE(egress_id) |
| **meeting_annotations** | id, meeting_id FK(meetings CASCADE), user_id FK(users CASCADE), payload (JSON stroke snapshot), created_at | - |
| **meeting_guest_tokens** | id, meeting_id FK(meetings CASCADE), token, created_by FK(users CASCADE), created_at, revoked_at? | UNIQUE(token) |
| **meeting_messages** | id, meeting_id FK(meetings CASCADE), user_id FK(users CASCADE), kind ('text'\|'file'\|'image'), content?, file_path?, file_name?, file_size?, mime_type?, width?, height?, created_at | INDEX(meeting_id, created_at) |

All tables use INTEGER PRIMARY KEY AUTOINCREMENT. Foreign keys enforce CASCADE on delete (except notifications which use SET NULL for portal_id/task_id). Timestamps stored as ISO 8601 TEXT with CURRENT_TIMESTAMP default. On DB init, existing portals are auto-migrated to user_portal_access with admin role and can_see_all=1. Runtime migrations in [`db/index.ts`](./src/lib/db/index.ts) idempotently add `task_rates.paid_amount`, `tasks.responsible_photo/creator_photo/exclude_from_ai`, `task_comments.author_photo/attached_files`, `portals.client_id/client_secret`, `notifications.link`, `meetings.empty_since`, `task_files.uploaded_by/file_path/file_name/file_size/mime_type` (+ `idx_task_files_task_id`) via guarded `ALTER TABLE` / `CREATE INDEX IF NOT EXISTS`. `payment_requests` and `payment_request_items` are provisioned via `CREATE TABLE IF NOT EXISTS` so pre-existing databases pick them up on next boot.

---

## Auth Flow

1. **Login:** POST `/api/auth/login` with `{email, password}` -> validates credentials, returns user JSON + sets `token` HttpOnly cookie (JWT, HS256, 7d)
2. **Edge Middleware:** [middleware.ts](./src/middleware.ts) runs on every non-API/static request. Verifies JWT via jose in Edge Runtime (uses shared `getJwtSecret()` from jwt.ts). Redirects unauthenticated users to `/login` (with `?redirect=` param), authenticated users from `/login` to `/dashboard`, and root `/` based on auth state. Excludes `/api`, `/_next`, `/static`, files with extensions. Adds security headers (X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy) to all responses via `addSecurityHeaders()`.
2a. **Password Policy:** [password-policy.ts](./src/lib/auth/password-policy.ts) enforces password strength (min 8 chars, uppercase, lowercase, digit). Used in POST `/api/users` and PATCH `/api/users/[id]` when setting/updating passwords.
3. **Auth check (API):** `getAuthUser(request)` in [lib/auth/middleware.ts](./src/lib/auth/middleware.ts) reads JWT from cookie or `Authorization: Bearer` header
4. **Route protection (API):** `requireAuth()` / `requireAdmin()` guards in [guards.ts](./src/lib/auth/guards.ts) return user or 401/403 response
5. **Current user:** GET `/api/auth/me` returns user profile (requires valid JWT)
5a. **Logout:** POST `/api/auth/logout` clears `token` cookie (maxAge 0). Route at [logout/route.ts](./src/app/api/auth/logout/route.ts). Sidebar bottom has "Выйти" button that calls this then redirects to `/login`.
6. **Admin seed:** On DB init, creates admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars via [seed.ts](./src/lib/db/seed.ts)
7. **Local portal seed:** After admin seed, [seedLocalPortal()](./src/lib/db/seed.ts) bootstraps the synthetic local portal (idempotent, owned by the first admin) and backfills `user_portal_access` + `user_bitrix_mappings` for existing users

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
| UI | [ui-store.ts](./src/stores/ui-store.ts) | `sidebarOpen`, `activeModal` (createTask/filters), `sidePanelTaskId`, global filters (search/status/priority/date), `createTaskPrefill` ({title?, description?}) | None (resets on reload) |
| Portal | [portal-store.ts](./src/stores/portal-store.ts) | `portals[]`, `activePortalId` | `activePortalId` persisted to localStorage |

### UI Components ([`components/ui/`](./src/components/ui/))

16 reusable components matching the Pencil design system. All support `className` prop for customization. Form components (InputField, SelectField, TextareaField) use `forwardRef` for react-hook-form compatibility. Includes EmptyState, ErrorState, Skeleton variants, and Toast notification system.

### Task Components ([`components/tasks/`](./src/components/tasks/))

| Component | Description |
|-----------|-------------|
| [TaskList](./src/components/tasks/TaskList.tsx) | Paginated task list with portal filter (PortalIndicator chips), status tabs, search (debounced), skeleton loading, empty state, pagination controls |
| [CreateTaskModal](./src/components/tasks/CreateTaskModal.tsx) | Modal for creating task: portal select, title, description, priority, deadline, responsible ID, tags. Uses `useCreateTask` mutation. On open consumes `createTaskPrefill` from `useUIStore` (once per open via `prefillAppliedRef` latch so the user's subsequent edits are preserved), clears the prefill and resets the form on close. For local portal also shows an «Вложения» block: multi-select file input, chip preview with remove, uploads after task creation via sequential POST to `/api/tasks/{newId}/files` |
| [TaskDetail](./src/components/tasks/TaskDetail.tsx) | Full task view: title, description (HTML), tags, checklist, comments, files. Right sidebar: status/priority/responsible/creator/deadline/time/TaskTimerControls/accomplices/auditors/TaskRateWidget/dates/bitrix_url. Action buttons: start/complete/delete. Fetches current user via `/api/auth/me` to pass isAdmin + currentUserId into `<Files>` + isLocal into `<Comments>` |
| [TaskRateWidget](./src/components/tasks/TaskRateWidget.tsx) | Compact rate widget: loading skeleton, "Указать ставку" button, view mode (type/amount/hours/total/payment badge/note + edit/delete), inline edit form (SelectField type, InputField amount, InputField hours, TextareaField note, live total preview). Uses `useTaskRate`, `useUpsertTaskRate`, `useDeleteTaskRate` |
| [Comments](./src/components/tasks/Comments.tsx) | Comment list (author avatar, date, HTML content) + add comment form. Accepts `isLocal` prop — when true, the form renders a paperclip-button + pending-file chips; submit passes `files` into `useAddComment` (multipart). `attachedFiles` are rendered via the local `CommentFiles` helper: Bitrix-sync links open `downloadUrl`, local attachments route to `/api/tasks/[id]/comments/files/[fileId]` |
| [Checklist](./src/components/tasks/Checklist.tsx) | Checklist with progress bar, toggle checkboxes (optimistic update), add/delete items |
| [Files](./src/components/tasks/Files.tsx) | «Вложения» section. Dual-mode: Bitrix24 (passthrough list with `downloadUrl`) or local portal (`isLocal` prop) — live list via `useTaskFiles`, «Добавить файл» uploader via `useUploadTaskFile`, trash button for the author/admin via `useDeleteTaskFile`. MIME-based icon picker (image/pdf/archive/generic). Local downloads route through `/api/tasks/[id]/files/[fileId]` (cookie-authed stream with `Content-Disposition: attachment`) |
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

### Payment Components ([`components/payments/`](./src/components/payments/))

Reusable components for the payments page. Barrel exported from [`index.ts`](./src/components/payments/index.ts).

| Component | Description |
|-----------|-------------|
| [PaymentSummaryCards](./src/components/payments/PaymentSummaryCards.tsx) | 3 StatCards in responsive grid (1 col mobile, 3 cols desktop): Всего заработано (banknote icon), Оплачено (check icon, green trend), Не оплачено (clock icon). Currency formatted via `Intl.NumberFormat('ru-RU', {currency: 'RUB'})`. Loading state shows StatCardSkeleton. Props: `summary: PaymentSummary`, `loading?: boolean` |
| [PaymentFilters](./src/components/payments/PaymentFilters.tsx) | Horizontal flex-wrap filter panel: portal SelectField, date range (from/to InputField type=date), paid status SelectField, task status SelectField, user SelectField (admin only), ghost "Сбросить" button. Resets page to 1 on filter change. Props: `filters: PaymentFilters`, `onFiltersChange`, `portals: PortalPublic[]`, `isAdmin?: boolean`, `users?` |
| [PaymentTable](./src/components/payments/PaymentTable.tsx) | Desktop: HTML table with checkbox, task link, portal indicator+name, rate type, rate amount, hours (hourly: hoursOverride ?? timeSpent/3600, fixed: dash), total, task status badge, clickable paid/unpaid badge. Mobile: card layout with same data. Empty state via EmptyState component. Skeleton rows for loading. Props: `rates: TaskRateWithTask[]`, `selectedIds: Set<number>`, `onToggleSelect`, `onSelectAll`, `onTogglePaid`, `loading?` |
| [PaymentRequestCreateDialog](./src/components/payments/PaymentRequestCreateDialog.tsx) | Admin-only dialog for creating a payment request. Recipient dropdown (useUsers), outstanding rates list loaded from `/api/wallet/rates?userId=X`, per-rate checkbox + proposedAmount input (default = expectedAmount − paidAmount), optional note textarea, live total, submit via `useCreatePaymentRequest`. Props: `open`, `onOpenChange`, `presetUserId?`, `presetRateIds?` |

### Wallet Components ([`components/wallet/`](./src/components/wallet/))

Reusable components for the `/wallet` page and the admin outgoing-requests tab. Barrel exported from [`index.ts`](./src/components/wallet/index.ts).

| Component | Description |
|-----------|-------------|
| [WalletSummaryCards](./src/components/wallet/WalletSummaryCards.tsx) | 4 StatCards (Заработано / Ожидается / Оплачено / К получению) in responsive grid; RUB formatting via `Intl.NumberFormat('ru-RU', {currency: 'RUB'})`; inline SVG icons (Wallet / Hourglass / CheckCircle / AlertCircle); success/danger border tint on "Оплачено" / "К получению"; `StatCardSkeleton × 4` loading state. Props: `summary: WalletSummary`, `loading?` |
| [WalletRatesTable](./src/components/wallet/WalletRatesTable.tsx) | Desktop HTML table + mobile cards for `WalletRate[]`: task link, portal indicator, expectedAmount, paidAmount, progress bar color-coded by `paymentStatus`, status badge (unpaid=danger / partial=warning / paid=success / overpaid=primary), "Изменить" action. Empty + skeleton states. Props: `rates`, `loading?`, `onEdit(rate)` |
| [CustomPaymentDialog](./src/components/wallet/CustomPaymentDialog.tsx) | Modal editor for manual `paidAmount`. Props: `{ rate: WalletRate \| null, onClose }`. Shows task title + read-only expectedAmount, 3 quick-pick buttons (Полностью / Не оплачено / Своё), free-form numeric input, live progress bar, Save/Cancel footer. Uses `useSetPaidAmount` + `useToast`. Esc/backdrop close, validation (finite ≥ 0). Returns `null` when rate is null |
| [PaymentRequestInbox](./src/components/wallet/PaymentRequestInbox.tsx) | User-side inbox rendered inside `/wallet?tab=requests`. Uses `useIncomingRequests()`. Splits list into "Ожидают ответа" (pending, createdAt DESC) and "История" (accepted/modified/rejected, respondedAt DESC). Loading (2 card skeletons), error and empty states |
| [PaymentRequestCard](./src/components/wallet/PaymentRequestCard.tsx) | Single PaymentRequest card. Props: `{ request, hideActions? }`. Shows sender, dates, colored status badge, items (taskTitle + proposedAmount + expectedAmount + appliedAmount), optional note, total. For `status='pending'` (and `hideActions` not set — used by `OutgoingRequestsList` where the caller is the sender) renders 3 actions: "Принять как есть" (`useAcceptPaymentRequest`), "Изменить и принять" (opens `PaymentRequestModifyDialog`), "Отклонить" (window.confirm + `useRejectPaymentRequest`). Uses `useToast` |
| [PaymentRequestModifyDialog](./src/components/wallet/PaymentRequestModifyDialog.tsx) | Modal for per-item override editing. Props: `{ request, onClose }`. Seeds with `proposedAmount`, shows `expectedAmount` read-only, live total, visual warning when applied > expected. Submit builds `overrides` containing ONLY items whose value differs from proposed, then calls `useAcceptPaymentRequest({ overrides })`. If no diffs, sends plain accept. Esc/backdrop close, validation (finite ≥ 0) |
| [OutgoingRequestsList](./src/components/wallet/OutgoingRequestsList.tsx) | Admin-only view of outgoing payment requests rendered inside the "Исходящие запросы" tab on `/payments`. Uses `useOutgoingRequests()`. Desktop: HTML table (Получатель / Сумма / Статус / Создан / Ответил). Mobile: card list. Rows sorted by createdAt DESC. Click row → modal with `PaymentRequestCard hideActions=true`. Loading skeletons, error and empty states |

### Hooks ([`hooks/`](./src/hooks/))

| Hook | Description |
|------|-------------|
| [useDebounce](./src/hooks/useDebounce.ts) | `useDebounce<T>(value, delay)` - returns value after `delay` ms of inactivity (default 300ms) |
| [usePortals](./src/hooks/usePortals.ts) | `usePortals()` - fetches portal list with access info; `useUpdatePortal()` - PATCH; `useDisconnectPortal()` - DELETE; `useSyncPortal()` - POST sync; `usePortalAccess(portalId)` - fetch users with access; `useGrantAccess()` - grant; `useUpdateAccess()` - update permissions; `useRevokeAccess()` - revoke |
| [useTasks](./src/hooks/useTasks.ts) | `useTasks(filters)` - paginated filtered list; `useCreateTask()`, `useUpdateTask()`, `useDeleteTask()`, `useStartTask()`, `useCompleteTask()`, `useMoveTaskStage()` |
| [useTask](./src/hooks/useTask.ts) | `useTask(id)` - single task with comments/checklist/files; `useAddComment()` (accepts optional `files?: File[]` → multipart POST; JSON otherwise), `useAddChecklistItem()`, `useToggleChecklistItem()` (optimistic), `useDeleteChecklistItem()` |
| [useTaskFiles](./src/hooks/useTaskFiles.ts) | `useTaskFiles(taskId)` - attachments list; `useUploadTaskFile(taskId)` - multipart upload; `useDeleteTaskFile(taskId)` - delete by fileId. Mutations invalidate `['task-files', taskId]` + `['task', taskId]` |
| [usePayments](./src/hooks/usePayments.ts) | `useTaskRate(taskId)` - fetch rate for task; `useUpsertTaskRate()` - create/update rate; `useDeleteTaskRate()` - delete rate; `usePayments(filters)` - paginated list with summary; `useUpdatePaymentStatus()` - toggle paid; `useBatchUpdatePaymentStatus()` - batch toggle |
| [useWallet](./src/hooks/useWallet.ts) | `useWalletSummary()` — `GET /api/wallet/summary`, queryKey `['wallet','summary']`; `useWalletRates(filters?)` — `GET /api/wallet/rates[?group=earned\|expected\|deferred]`, queryKey `['wallet','rates', filters]`; `useSetPaidAmount()` — `PATCH /api/wallet/rates/[id]/paid-amount`, on success invalidates `['wallet']` and `['payments']`. Exports `WalletRatesFilters`, `SetPaidAmountInput` |
| [usePaymentRequests](./src/hooks/usePaymentRequests.ts) | `useIncomingRequests()` — `GET /api/payment-requests?direction=incoming`, queryKey `['payment-requests','incoming']`; `useOutgoingRequests()` — `GET ?direction=outgoing`, admin-only, queryKey `['payment-requests','outgoing']`; `useCreatePaymentRequest()` — `POST /api/payment-requests`, invalidates `['payment-requests']`, `['wallet']`, `['payments']`; `useAcceptPaymentRequest()` — `POST /api/payment-requests/[id]/accept` with optional `{ overrides }`, invalidates `['payment-requests']`, `['wallet']`, `['payments']`; `useRejectPaymentRequest()` — `POST /api/payment-requests/[id]/reject`, invalidates only `['payment-requests']`. Exports `AcceptPaymentRequestVariables`, `RejectPaymentRequestVariables` |
| [useNotifications](./src/hooks/useNotifications.ts) | `useNotifications(params)` - paginated notification list; `useUnreadCount()` - unread count with 30s polling; `useMarkAsRead()`, `useMarkAllAsRead()` - mutations |
| [usePushNotifications](./src/hooks/usePushNotifications.ts) | `usePushNotifications()` - push subscription lifecycle: `isSupported`, `isSubscribed`, `permission`, `subscribe()`, `unsubscribe()` |
| [useReports](./src/hooks/useReports.ts) | `useDailyReport(date?)`, `useWeeklyReport(week?)` - fetch/generate reports; `useRegenerateDaily()`, `useRegenerateWeekly()` - force-regenerate mutations |
| [useWorkHours](./src/hooks/useWorkHours.ts) | `useWorkHours()` - fetch work hours ({start, end}, defaults 9-18, staleTime 5min); `useUpdateWorkHours()` - PATCH /api/settings mutation with cache invalidation |
| [useTimeTracking](./src/hooks/useTimeTracking.ts) | `useActiveTimers()` - active timers with 10s polling; `useTaskTimeTracking(taskId)` - task summary with 10s polling; `useStartTimer()`, `useStopTimer()`, `useDeleteTimeEntry()` - mutations with cache invalidation; `useElapsedTime(startedAt)` - live HH:MM:SS display; `formatDuration(seconds)` - format seconds to HH:MM:SS |

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
- Local portal guard: if `portal.memberId === LOCAL_PORTAL_MEMBER_ID`, throws `Bitrix24Error('LOCAL_PORTAL', 'Local portal has no Bitrix24 integration')` before any OAuth branch runs

### API Client ([`lib/bitrix/client.ts`](./src/lib/bitrix/client.ts))

- `Bitrix24Client.call(method, params)` - POST to `{clientEndpoint}{method}` with `auth` in body
- `Bitrix24Client.callBatch(commands)` - up to 50 commands in single `batch` call
- Auto-retry once on `expired_token` error (triggers token refresh then re-executes)
- Custom `Bitrix24Error` with `code` and `message`

### Task Sync ([`lib/bitrix/sync.ts`](./src/lib/bitrix/sync.ts))

- `fullSync(portalId)` - early-return `{tasksCount:0, errors:[]}` without any network call when `isLocalPortalId(portalId)` is true; otherwise stages + all tasks (paginated by 50) + comments/checklist/files per task + update last_sync_at; фильтрует задачи по маппингу пользователей через `getMappedBitrixUserIds` + `isTaskRelevantToUsers` (задачи без замапленных участников пропускаются, не сохраняются в БД)
- `syncSingleTask(portalId, bitrixTaskId)` - early-return `null` for local portal; otherwise fetches and upserts single task with related data (for webhooks); фильтрует задачу по маппингу — нерелевантные задачи не сохраняются
- Helper modules: [tasks.ts](./src/lib/bitrix/tasks.ts) (mapping, upsert, fetch), [comments.ts](./src/lib/bitrix/comments.ts), [checklist.ts](./src/lib/bitrix/checklist.ts), [files.ts](./src/lib/bitrix/files.ts)
- Bitrix24 status mapping: 1=NEW, 2=PENDING, 3=IN_PROGRESS, 4=SUPPOSEDLY_COMPLETED, 5=COMPLETED, 6=DEFERRED
- `bitrix_url` generation: `/workgroups/group/{groupId}/tasks/task/view/{taskId}/` for group tasks, `/company/personal/user/{userId}/tasks/task/view/{taskId}/` otherwise; `null` when `bitrixTaskId < 0` (synthetic local tasks have no Bitrix24 counterpart)

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
| `/api/portals/[id]/sync` | POST | Full sync: stages + tasks + comments + checklists + files. Returns 400 `Local portal cannot be synced` when portal is local (`isLocalPortal(portal)`) |

### Task CRUD API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/tasks` | GET | Paginated list with filters: portalId, status, priority, search (LIKE title), assignee, dateFrom/dateTo, sortBy, sortOrder, page, limit |
| `/api/tasks` | POST | Create task. Dual-mode: **bitrix portal** — Bitrix24 `tasks.task.add` → upsertTask → SQLite; **local portal** — DB-only insert with synthetic negative `bitrixTaskId = min(-1, MIN(bitrixTaskId)-1)`, creatorName/responsibleName snapshotted from `users` table. Body: `{portalId, title, description?, priority?, deadline?, tags?, groupId?, responsibleId?}` |
| `/api/tasks/[id]` | GET | Single task with optional `?include=comments,checklist,files` |
| `/api/tasks/[id]` | PATCH | Update task. Dual-mode: **bitrix** — `tasks.task.update` then SQLite; **local** — SQLite only, re-snapshots `responsibleName` when `responsibleId` changes. Body: `{title?, description?, priority?, deadline?, status?, responsibleId?, tags?, accomplices?, auditors?, excludeFromAi?}` |
| `/api/tasks/[id]` | DELETE | Delete task. Dual-mode: **bitrix** — `tasks.task.delete` then SQLite; **local** — SQLite only (cascades to comments/checklist/files) |
| `/api/tasks/[id]/start` | POST | Set status=IN_PROGRESS. Dual-mode: **bitrix** — `tasks.task.start`; **local** — SQLite only |
| `/api/tasks/[id]/complete` | POST | Set status=COMPLETED + closedDate. Dual-mode: **bitrix** — `tasks.task.complete`; **local** — SQLite only |
| `/api/tasks/[id]/renew` | POST | Resume task: status=IN_PROGRESS, clear closedDate. Dual-mode: **bitrix** — `tasks.task.update STATUS=3`; **local** — SQLite only |
| `/api/tasks/[id]/stage` | POST | Move stage. Dual-mode: **bitrix** — `task.stages.movetask`; **local** — update tasks.stageId only. Body: `{stageId}` |
| `/api/tasks/[id]/comments` | POST | Add comment. Accepts **JSON** (`{message}`) for backward compatibility or **multipart/form-data** (`content` + `files[]`). Dual-mode: **bitrix** — `task.commentitem.add` + snapshot Bitrix author; **local** — insert with synthetic `bitrixCommentId = -Date.now()`, authorName snapshotted from `users`. Multipart only allowed for local tasks — files saved to `data/task-comment-files/<taskId>/<uuid>_<safeName>` via `saveUploadToDisk`, metadata written as `CommentFile[]` JSON into `task_comments.attached_files`; for Bitrix24 tasks with files — 400 |
| `/api/tasks/[id]/comments/files/[fileId]` | GET | Stream local comment attachment. Looks up the file by UUID id across the task's `task_comments.attached_files` arrays, serves bytes with `Content-Disposition: attachment`. Only local portal attachments have bytes on disk — Bitrix-sync attachments use their own `downloadUrl` field on the client |
| `/api/tasks/[id]/files` | GET | List task file attachments (metadata only). Access: `hasPortalAccess` or admin |
| `/api/tasks/[id]/files` | POST | Upload file(s). **Local portal only** — 400 for Bitrix24 tasks (use Bitrix24 UI). Accepts `file` (single) or `files[]`/`files` (multi). Validates via `validateUpload`, stores at `data/task-files/<taskId>/<uuid>_<safeName>` via `saveUploadToDisk`, inserts `task_files` row with `uploaded_by`, `file_path`, `file_name`, `file_size`, `mime_type`. Returns `{ data: TaskFile }` for single upload or `{ data: TaskFile[] }` for multi |
| `/api/tasks/[id]/files/[fileId]` | GET | Stream download of a local task file. Sets `Content-Type: <mime_type>` and `Content-Disposition: attachment; filename="<name>"`. Bitrix-sync rows (no `file_path`) return 404 here — client uses `downloadUrl` directly instead |
| `/api/tasks/[id]/files/[fileId]` | DELETE | Delete file row + on-disk payload. Allowed for the file author (`uploaded_by === userId`), portal admin (`isPortalAdmin`), or global admin. `ENOENT` on unlink is swallowed to keep the DB row deletion authoritative |
| `/api/tasks/[id]/checklist` | POST | Add checklist item. Dual-mode: **bitrix** — `task.checklistitem.add` with bitrixItemId; **local** — `bitrixItemId=null`. Body: `{title}` |
| `/api/tasks/[id]/checklist/[itemId]` | PATCH | Toggle checklist item isComplete. Dual-mode: **bitrix** — `task.checklistitem.complete/renew`; **local** — SQLite only. Body: `{isComplete}` |
| `/api/tasks/[id]/checklist/[itemId]` | DELETE | Delete checklist item. Dual-mode: **bitrix** — `task.checklistitem.delete`; **local** — SQLite only |

Task GET uses permission-based filtering via `buildTaskAccessFilter()` / `buildPortalTaskFilter()` from `task-filter.ts`. Task POST verifies access via `hasPortalAccess()`. All task API routes enforce access via user_portal_access.
Two-phase write pattern for bitrix portal: Bitrix24 API first, then SQLite. If Bitrix24 fails, SQLite is not updated. For local portal (`memberId='__local__'`) all mutations are single-phase SQLite writes — no network calls. Local branch is gated by `isLocalPortal()` from `@/lib/portals/local`. Accomplices/auditors updates flow through PATCH `/api/tasks/[id]` (no dedicated sub-routes).

### Payment / Rate API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/tasks/[id]/rate` | GET | Get current user's rate for a task. Returns `{ data: TaskRate \| null }` |
| `/api/tasks/[id]/rate` | PUT | Upsert rate. Body: `{rateType, amount, hoursOverride?, note?}`. Checks isUserParticipant. Returns `{ data: TaskRate }` |
| `/api/tasks/[id]/rate` | DELETE | Delete rate. Returns `{ data: { deleted: true } }` |
| `/api/payments` | GET | List rates with filters (portalId, dateFrom, dateTo, isPaid, taskStatus, userId (admin), page, limit). Admin sees all users, regular user sees own. Returns data + pagination + PaymentSummary |
| `/api/payments/[id]` | PATCH | Toggle payment status. Body: `{isPaid}`. Owner or admin. Returns `{ data: TaskRate }` |
| `/api/payments/batch` | PATCH | Batch toggle payment status. Body: `{rateIds[], isPaid}`. Checks ownership. Returns `{ data: { updated: number } }` |
| `/api/payments/export` | GET | Export payments as PDF via pdfmake. Same filters as /api/payments. Fetches rates, summary, user info, portal name; calls generatePaymentReport; returns PDF buffer with Content-Type: application/pdf and Content-Disposition: attachment filename="payment-report-YYYY-MM-DD.pdf" |

Route files: [`tasks/[id]/rate/route.ts`](./src/app/api/tasks/[id]/rate/route.ts), [`payments/route.ts`](./src/app/api/payments/route.ts), [`payments/[id]/route.ts`](./src/app/api/payments/[id]/route.ts), [`payments/batch/route.ts`](./src/app/api/payments/batch/route.ts), [`payments/export/route.ts`](./src/app/api/payments/export/route.ts)

### Wallet API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/wallet/summary` | GET | Aggregated wallet figures for current user. Calls `getWalletSummary(userId)`. Returns `{ data: WalletSummary }` with earned/expected/deferred/paid/outstanding/tasksEarnedCount/tasksExpectedCount |
| `/api/wallet/rates` | GET | Returns rates enriched with paidAmount, expectedAmount, paymentStatus. Default: current user's rates. Admins may pass `?userId=N` to fetch another user's rates (used by PaymentRequestCreateDialog); 403 for non-admins, 400 if userId malformed. Optional `?group=earned\|expected\|deferred` filter (400 on invalid). Returns `{ data: WalletRate[] }` |
| `/api/wallet/rates/[id]/paid-amount` | PATCH | Update paidAmount on a rate owned by caller. Body: `{ paidAmount: number }` (finite, >=0; 400 otherwise). 404 if rate missing, 403 if rate belongs to another user. `setPaidAmount` auto-syncs `isPaid` (paidAmount >= expectedAmount) and paidAt. Returns `{ data: TaskRate }` |

Wallet routes always operate on the authenticated user's own data — no admin override. Monetary math uses the shared `computeExpectedAmount` helper from [`lib/payments/calc.ts`](./src/lib/payments/calc.ts). Rate row shape is reused from [`lib/payments/rates.ts`](./src/lib/payments/rates.ts) via exported `rateWithTaskSelect` + `mapRowToTaskRateWithTask`.

Route files: [`wallet/summary/route.ts`](./src/app/api/wallet/summary/route.ts), [`wallet/rates/route.ts`](./src/app/api/wallet/rates/route.ts), [`wallet/rates/[id]/paid-amount/route.ts`](./src/app/api/wallet/rates/[id]/paid-amount/route.ts)

### Payment Requests API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/payment-requests` | POST | Admin creates a payment request for a user. Body: `{toUserId, items: [{taskRateId, proposedAmount}], note?}`. 403 if not admin. 400 on validation failure (empty items, non-positive amount, taskRateId not owned by toUserId, self-request). Returns 201 + full PaymentRequest |
| `/api/payment-requests` | GET | List payment requests. Query `?direction=incoming\|outgoing` (required). `incoming`: where toUserId=current user. `outgoing`: where fromUserId=current user, admin-only (403 otherwise). Returns `{ data: PaymentRequest[] }` ordered by createdAt desc |
| `/api/payment-requests/[id]` | GET | Full request detail. Sender (from) or recipient (to) only; 404 if missing, 403 otherwise. Returns `{ data: PaymentRequest }` with items (taskTitle + expectedAmount joined) |
| `/api/payment-requests/[id]/accept` | POST | Recipient accepts pending request. Body optional: `{ overrides?: Record<itemIdStr, number> }`. Applies amounts cumulatively to `taskRates.paidAmount` (does not overwrite), recomputes `isPaid = paidAmount >= expectedAmount`, persists `paymentRequestItems.appliedAmount`, status becomes `'modified'` if overrides present else `'accepted'`, `respondedAt=now`. 409 if not pending, 403 if not recipient, 400 on unknown override keys/invalid amounts |
| `/api/payment-requests/[id]/reject` | POST | Recipient rejects pending request. No body. Status=`'rejected'`, respondedAt=now. 409 if not pending, 403 if not recipient |

On creation, a row is inserted into `notifications` (type=`'payment_request'`, title=`'Новый запрос оплаты'`, message=note, portalId/taskId null) for the recipient. Expected-amount math reuses `computeExpectedAmount` from [`lib/payments/calc.ts`](./src/lib/payments/calc.ts). `PaymentRequestError` codes map to HTTP: VALIDATION→400, FORBIDDEN→403, NOT_FOUND→404, CONFLICT→409 via shared `mapPaymentRequestError` helper exported from [`payment-requests/route.ts`](./src/app/api/payment-requests/route.ts).

Route files: [`payment-requests/route.ts`](./src/app/api/payment-requests/route.ts), [`payment-requests/[id]/route.ts`](./src/app/api/payment-requests/[id]/route.ts), [`payment-requests/[id]/accept/route.ts`](./src/app/api/payment-requests/[id]/accept/route.ts), [`payment-requests/[id]/reject/route.ts`](./src/app/api/payment-requests/[id]/reject/route.ts)

### Wallet Feature Overview

The Wallet feature gives each user a personal payment inbox plus admin-driven payment-request workflow. It reuses existing payment primitives rather than duplicating them.

**Service layer** ([`src/lib/wallet/`](./src/lib/wallet/)):
- [wallet.ts](./src/lib/wallet/wallet.ts) — `getWalletSummary(userId)`, `getWalletRates(userId, { group? })`, `setPaidAmount(userId, rateId, paidAmount)`. Rate shape shared with payments layer via `rateWithTaskSelect` / `mapRowToTaskRateWithTask` from [rates.ts](./src/lib/payments/rates.ts). Expected amounts computed via [computeExpectedAmount](./src/lib/payments/calc.ts). Status buckets: `COMPLETED`/`SUPPOSEDLY_COMPLETED` → earned; `NEW`/`PENDING`/`IN_PROGRESS` → expected; `DEFERRED` → deferred. `derivePaymentStatus` (epsilon-tolerant) yields `unpaid | partial | paid | overpaid`
- [payment-requests.ts](./src/lib/wallet/payment-requests.ts) — `PaymentRequestError` (codes NOT_FOUND / FORBIDDEN / CONFLICT / VALIDATION), `createPaymentRequest`, `listIncomingRequests`, `listOutgoingRequests`, `getPaymentRequestDetail`, `acceptPaymentRequest`, `rejectPaymentRequest`. Accept is cumulative (adds to `task_rates.paid_amount`, never overwrites); status becomes `'modified'` when overrides are provided, else `'accepted'`. Notification row (`type='payment_request'`) inserted in the same transaction as create

**Types** ([`src/types/`](./src/types/)):
- [wallet.ts](./src/types/wallet.ts) — `WalletPaymentStatus`, `WalletRate` (extends `TaskRateWithTask` + `paidAmount` / `expectedAmount` / `paymentStatus`), `WalletSummary`
- [payment-request.ts](./src/types/payment-request.ts) — `PaymentRequestStatus`, `PaymentRequestItem`, `PaymentRequest`, `CreatePaymentRequestInput`, `AcceptPaymentRequestInput`

**API routes:** see the "Wallet API" and "Payment Requests API" sections above.

**Hooks:** [useWallet.ts](./src/hooks/useWallet.ts), [usePaymentRequests.ts](./src/hooks/usePaymentRequests.ts).

**Pages and UI:**
- [`/wallet` page](./src/app/(dashboard)/wallet/page.tsx) — header + `WalletSummaryCards` + 4 tabs (Заработано / Ожидается / Отложено / Запросы) synced via `?tab=` query. Group tabs render `WalletRatesTable` fed by `useWalletRates({ group })`; "Изменить" opens `CustomPaymentDialog`. The `requests` tab renders `PaymentRequestInbox`
- `Wallet Components` section below — 7 components under [`src/components/wallet/`](./src/components/wallet/)
- [PaymentRequestCreateDialog](./src/components/payments/PaymentRequestCreateDialog.tsx) — admin entry point on `/payments` (header button "Отправить запрос оплаты") and the "Исходящие запросы" tab (renders `OutgoingRequestsList`)
- [Sidebar](./src/components/layout/Sidebar.tsx) exposes a "Кошелёк" nav item with `WalletIcon`

### Time Tracking API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/time-tracking/active` | GET | Active timers for current user (stoppedAt IS NULL). JOIN tasks+portals for taskTitle, portalColor, portalName. Returns `{ data: ActiveTimerEntry[] }` |
| `/api/time-tracking/start` | POST | Start timer. Body: `{taskId}`. Checks task access via tasks+portals JOIN, 409 if timer already running for this task+user. Returns `{ data: TimeTrackingEntry }` (201) |
| `/api/time-tracking/stop` | POST | Stop timer. Body: `{taskId}`. Finds active entry, calculates duration in seconds (Date.now - startedAt). Returns `{ data: TimeTrackingEntry }` |
| `/api/time-tracking/task/[taskId]` | GET | Task time tracking summary: all entries (DESC), totalDuration (sum of completed), activeEntry. Returns `{ data: TaskTimeTrackingSummary }` |
| `/api/time-tracking/[id]` | DELETE | Delete entry. Ownership check (userId), 404 for missing/other user. Returns `{ data: { message: 'Deleted' } }` |

Route files: [`time-tracking/active/route.ts`](./src/app/api/time-tracking/active/route.ts), [`time-tracking/start/route.ts`](./src/app/api/time-tracking/start/route.ts), [`time-tracking/stop/route.ts`](./src/app/api/time-tracking/stop/route.ts), [`time-tracking/task/[taskId]/route.ts`](./src/app/api/time-tracking/task/[taskId]/route.ts), [`time-tracking/[id]/route.ts`](./src/app/api/time-tracking/[id]/route.ts)

### Time Tracking UI

- **ActiveTimersWidget** ([`components/time-tracking/ActiveTimersWidget.tsx`](./src/components/time-tracking/ActiveTimersWidget.tsx)): header dropdown widget with clock icon trigger, badge showing active timer count (hidden at 0), dropdown with timer list showing portal color, task title, portal name, live elapsed time (HH:MM:SS via useElapsedTime), stop button per timer, click navigates to task page, close on outside click + Escape, loading skeleton, empty state
- **TaskTimerControls** ([`components/time-tracking/TaskTimerControls.tsx`](./src/components/time-tracking/TaskTimerControls.tsx)): task detail sidebar section with Start/Stop timer buttons, live elapsed time display, total accumulated duration, expandable session history with date, duration, and delete button per completed entry. Props: `{ taskId: number }`
- Hooks used: `useActiveTimers`, `useTaskTimeTracking`, `useStartTimer`, `useStopTimer`, `useDeleteTimeEntry`, `useElapsedTime`, `formatDuration` from [`useTimeTracking.ts`](./src/hooks/useTimeTracking.ts)

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

- **NotificationDropdown** ([`components/notifications/NotificationDropdown.tsx`](./src/components/notifications/NotificationDropdown.tsx)): dropdown panel from Header bell icon, shows last 15 notifications with type icons (including `meeting_invite` with a camera/screen glyph), relative time, portal indicator, "Прочитать все" button, click marks read and navigates to `notification.link` when present (used by `meeting_invite` → `/meetings/<id>`), else falls back to `/tasks/<taskId>`
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
  - `sendPushNotification(params)` — creates DB notification + delivers Web Push (non-blocking). Accepts optional `link` to override the click-through URL (stored on the notifications row and set as `data.url` in the push payload); falls back to `/tasks/<taskId>` or `/dashboard`
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
- UserDetailModal: shows StatCards (task stats), portal list (role + active badges), grant-portal dropdown listing portals user does not yet have + "Добавить" button (POST /api/portals/{portalId}/access), account info
- ChangePasswordModal: admin-only, triggered from UserTable row action — sets new password via PATCH /api/users/[id] (backend validates via `validatePassword`)

### User API

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/users` | GET | Admin | List all users with portal counts |
| `/api/users` | POST | Admin | Create user (email, password, name, isAdmin); auto-grants local portal access (role:'viewer', canSeeAll:false, canSeeResponsible/Creator/Accomplice/Auditor:true) + creates user_bitrix_mappings row (bitrixUserId=String(newUserId)) — failures logged, do not block creation |
| `/api/users/[id]` | GET | Admin/Self | User details with notification prefs |
| `/api/users/[id]` | PATCH | Admin/Self | Update profile, notifications, role (admin fields admin-only) |
| `/api/users/[id]` | DELETE | Admin | Delete user (cannot delete self, cascades) |
| `/api/users/[id]/stats` | GET | Admin | Task statistics: total, inProgress, completed, overdue |
| `/api/users/[id]/portals` | GET | Admin | Portals the user has access to (via user_portal_access JOIN portals, uses `getUserPortals` from `src/lib/portals/access.ts`); public portal fields (id, domain, name, color, memberId, isActive, lastSyncAt, createdAt) + role + permissions (canSeeResponsible/Accomplice/Auditor/Creator/All) |

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
- Registers two cron modules: `initializeCron()` (general scheduler) and `registerMeetingsCleanupCron()` (Phase 4 empty-meeting auto-close)

### Scheduler ([`lib/cron/scheduler.ts`](./src/lib/cron/scheduler.ts))

| Schedule | Job | Description |
|----------|-----|-------------|
| `0 * * * *` (every hour) | Overdue check | Scans for tasks with deadline passed in last hour, creates `overdue` notifications + push |
| `* * * * *` (every minute) | Digest delivery | Checks if current HH:MM matches any user's `digest_time`, sends rich daily digest notification |
| `0 0 * * *` (00:00 daily) | Daily task snapshots | Generates task snapshots for all digest-enabled users via `generateAllSnapshots()` |
| `5 0 * * *` (00:05 daily) | Report pre-generation | Generates previous day's daily report for all users |

### Meetings Cleanup Cron ([`lib/cron/meetings-cleanup.ts`](./src/lib/cron/meetings-cleanup.ts))

- `registerMeetingsCleanupCron()` — idempotent registration (isRegistered flag). Schedules `* * * * *` that calls `tickEmptyMeetings()` from [`lib/meetings/cleanup.ts`](./src/lib/meetings/cleanup.ts). Try/catch around the tick — errors are logged, cron keeps running.

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

---

## Docker Production Deployment

### Files

| File | Description |
|------|-------------|
| [Dockerfile](./Dockerfile) | Multi-stage build: `deps` (npm ci + native compilation) → `builder` (next build with standalone output) → `runner` (node:20-alpine, minimal image) |
| [docker-compose.yml](./docker-compose.yml) | Single service `taskhub`: builds from Dockerfile, mounts `taskhub-data` volume for SQLite, reads `.env.production`, healthcheck via `/api/auth/me` |
| [.dockerignore](./.dockerignore) | Excludes node_modules, .next, .git, env files, data/ from build context |
| [scripts/deploy-prod.sh](./scripts/deploy-prod.sh) | Production deploy script. Subcommands: `preflight` (server+env checks), default (preflight + план + автоисправления + build + up), `stop/restart/logs/status/rebuild/backup`. Проверяет Docker, nginx, certbot, ufw (7881/tcp + 50000-50100/udp), DNS A-записи для `NEXT_PUBLIC_APP_URL` и `NEXT_PUBLIC_LIVEKIT_URL`, TLS-сертификаты в `/etc/letsencrypt/live/<host>`, nginx `server_name` для обоих хостов, совпадение `LIVEKIT_API_KEY` в `infra/livekit.yaml`, синхронизацию `VAPID_PUBLIC_KEY`↔`NEXT_PUBLIC_VAPID_PUBLIC_KEY`. Валидирует обязательные env (`JWT_SECRET`, `ENCRYPTION_KEY` (64 hex), `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `NEXT_PUBLIC_APP_URL`, `LIVEKIT_API_KEY/SECRET`, `LIVEKIT_URL`, `NEXT_PUBLIC_LIVEKIT_URL` (wss:// при https), `MEETING_WORKER_URL`). При отсутствии значений — интерактивный ввод с сохранением через `env_set` (awk in-place). Автоисправления (`offer_fixes`) — каждое требует отдельного апрува: `ufw allow 7881/tcp`, `ufw allow 50000:50100/udp`, генерация nginx `server_name` файла для livekit-хоста (proxy → 127.0.0.1:7880 с WebSocket upgrade + `nginx -t` + `systemctl reload`), `certbot --nginx -d <host>` для выпуска TLS, `node scripts/sync-livekit-keys.mjs` для синхронизации `infra/livekit.yaml`, синхронизация VAPID. Показывает план действий и запрашивает подтверждение. Флаг `FORCE_NOCACHE` автоматически включает `docker compose build --no-cache` при изменении любой `NEXT_PUBLIC_*` переменной (инлайнятся в Next.js билде). Флаги: `--yes`/`-y` (skip confirm), `--non-interactive` (fail вместо промпта), `--port N`, `--attached` |

### Usage

```bash
# First run — generates .env.production template, edit it, then re-run
./scripts/deploy-prod.sh

# With options
./scripts/deploy-prod.sh --port 8080 --attached

# Management
./scripts/deploy-prod.sh logs       # tail logs
./scripts/deploy-prod.sh status     # container status
./scripts/deploy-prod.sh restart    # restart
./scripts/deploy-prod.sh stop       # stop
./scripts/deploy-prod.sh backup     # backup SQLite from volume
./scripts/deploy-prod.sh rebuild    # force rebuild + restart
```

### How It Works

1. `deploy-prod.sh` validates Docker is installed, checks/creates `.env.production` with auto-generated secrets
2. `docker compose up --build -d` builds the multi-stage Dockerfile:
   - **deps**: installs npm dependencies with native compilation (python3, make, g++ for better-sqlite3)
   - **builder**: copies deps + source, runs `next build` producing standalone output
   - **runner**: minimal Alpine image, copies standalone build + public + static assets
3. Container starts `node server.js` — Next.js standalone server on port 3000
4. Database migrations run automatically via `db/index.ts` on first connection (CREATE TABLE IF NOT EXISTS + ALTER TABLE + seed)
5. SQLite data persisted in named Docker volume `taskhub-data` mounted at `/app/data`
6. Cron jobs enabled via `ENABLE_CRON=true` environment variable in compose

---

## Meetings Feature Overview

Built-in video meetings powered by LiveKit. The feature is composed of five cooperating processes, all orchestrated via the root [docker-compose.yml](./docker-compose.yml) alongside the main app service:

- **Next.js app** (`taskhub-next`) — hosts the meeting UI, mints LiveKit access tokens, and persists meeting metadata through Drizzle.
- **LiveKit server** (`taskhub-livekit`) — SFU for audio/video/data channels; configured via `infra/livekit.yaml`.
- **LiveKit egress** (`taskhub-livekit-egress`) — standalone egress worker (image `livekit/egress:latest`) that executes `RoomCompositeEgress` / `TrackEgress` jobs dispatched over Redis psrpc; writes output files into `/app/data/recordings/` on the shared volume.
- **Redis** (`taskhub-redis`) — psrpc bus shared by the LiveKit server and the egress worker for job dispatch and worker registration.
- **meeting-worker** (`taskhub-meeting-worker`) — standalone Fastify service responsible for LiveKit egress orchestration, webhook ingestion, and post-mux (ffmpeg) of recordings. Shares the SQLite file with Next.js via a bind-mounted `./data` volume.

### Domain Types

| File | Description |
|------|-------------|
| [src/types/meeting.ts](./src/types/meeting.ts) | Domain aliases over the Drizzle select/insert types for `meetings`, `meetingParticipants`, `meetingRecordings`, `meetingAnnotations`, `meetingMessages`; enums `MeetingStatus`, `ParticipantRole`, `RecordingTrackType`, `RecordingStatus`, `MeetingMessageKind`; wire types for the drawing data channel (`StrokeEvent` with optional `createdAt: number` used by the receiver's local clock for fade timing, `UndoEvent`, `ClearEvent`, `DrawingPayload`) and chat (`MeetingMessage`, `MeetingMessageUser`, `ChatPayload`) |

Underlying DB schema lives in [src/lib/db/schema.ts](./src/lib/db/schema.ts) (tables `meetings`, `meeting_participants`, `meeting_recordings`, `meeting_annotations`, `meeting_guest_tokens`, `meeting_messages`).

### Infrastructure — `infra/`

| File | Description |
|------|-------------|
| [infra/livekit.yaml](./infra/livekit.yaml) | LiveKit server config: port 7880 (signalling), rtc.tcp_port 7881, UDP range 50000–50100, `keys:` map (dev-hardcoded, replace in prod), `redis.address: redis:6379` (psrpc bus to egress worker), `webhook.urls: [http://meeting-worker:3100/webhook]`, log_level info, room defaults (auto_create, empty_timeout 300s, max_participants 50) |
| [infra/egress.yaml](./infra/egress.yaml) | LiveKit egress worker config: `api_key`/`api_secret` matching `livekit.yaml`, `ws_url: ws://livekit:7880`, `redis.address: redis:6379` (psrpc registration), `file_outputs: [/app/data/recordings]` allowlist, enables `room_composite`, `track`, `track_composite`. Consumed by the `livekit-egress` container via `EGRESS_CONFIG_FILE=/etc/egress.yaml` |
| [docker-compose.yml](./docker-compose.yml) | Full stack at repo root: services `taskhub` (Next.js + cron, depends on livekit+meeting-worker), `redis` (image `redis:7-alpine`, psrpc bus, no persistence), `livekit` (image `livekit/livekit-server:latest`, mounts `infra/livekit.yaml`, exposes 7880/7881/50000-50100/udp, depends on redis), `livekit-egress` (image `livekit/egress:latest`, `SYS_ADMIN` cap for headless Chrome, mounts `infra/egress.yaml` + `taskhub-data`, depends on redis+livekit), `meeting-worker` (builds from `./meeting-server`, port 3100, healthcheck `/health`). Shared named volume `taskhub-data` for SQLite + recordings. Run: `docker compose --env-file .env.production up --build` |

### `meeting-server/` — LiveKit worker

Fastify-based Node.js service (compiled TypeScript, NodeNext ESM). Runs on port 3100. Shares the SQLite file with Next.js through WAL mode so both processes can coexist without corruption. Uses the same JWT secret as Next.js to verify internal session tokens.

| File | Description |
|------|-------------|
| [meeting-server/package.json](./meeting-server/package.json) | Manifest (`type: "module"`): deps `livekit-server-sdk@^2`, `fastify@^5`, `better-sqlite3@^12`, `jose@^6`, `zod@^4`; devDeps `tsx`, `typescript`, `pino-pretty`, `@types/node`, `@types/better-sqlite3`. Scripts `dev` (tsx watch), `build` (tsc), `start` (node dist/index.js), `type-check`, `test` (`tsx --test src/__tests__/*.test.mts`) |
| [meeting-server/tsconfig.json](./meeting-server/tsconfig.json) | Strict TS config: target ES2022, module/moduleResolution NodeNext, outDir `dist/`, rootDir `src/`, `strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, source maps on |
| [meeting-server/Dockerfile](./meeting-server/Dockerfile) | Three stages: `deps` (node:20-alpine + python3/make/g++ for better-sqlite3, `npm ci`), `builder` (copies deps + src, runs `npm run build` then `npm prune --omit=dev`), `runner` (node:20-alpine + ffmpeg, non-root `worker` uid 1001, EXPOSE 3100, `CMD ["node","dist/index.js"]`) |
| [meeting-server/.dockerignore](./meeting-server/.dockerignore) | Excludes `node_modules`, `dist`, `.git`, logs and `.env*` (keeps `.env.example`) from the build context |
| [meeting-server/src/index.ts](./meeting-server/src/index.ts) | Entrypoint: pre-opens SQLite (fail-fast if missing), creates Fastify instance with pino logger (pretty-dev/json-prod) and `trustProxy`, exposes `GET /health` (returns `{status, service, version, uptime}`), registers `webhooksPlugin` (LiveKit webhook receiver) and `recordingsRoutesPlugin` (egress control API), installs SIGTERM/SIGINT graceful shutdown (server.close → onClose hook → closeDb), traps `unhandledRejection` and `uncaughtException` to force exit |
| [meeting-server/src/config.ts](./meeting-server/src/config.ts) | Zod-validated env loader. Fields: `NODE_ENV`, `PORT` (3100), `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `DB_PATH` (/app/data/taskhub.db), `RECORDINGS_DIR` (/app/data/recordings), `JWT_SECRET` (required, no fallback). Exports typed `config` with grouped namespaces `livekit`, `paths`, `auth`. Prints all zod issues and calls `process.exit(1)` on failure |
| [meeting-server/src/db.ts](./meeting-server/src/db.ts) | Direct `better-sqlite3` connection to the shared SQLite file. Pragmas: `journal_mode = WAL`, `foreign_keys = ON`, `synchronous = NORMAL`, `busy_timeout = 5000`. Row types: `MeetingRow` (includes `empty_since: string \| null`), `RecordingRow`, `RecordingTrackType`, `RecordingStatus`. Prepared-statement accessors: `getMeeting(id)`, `getMeetingByRoomName(roomName)`, `getRecordingByEgressId(egressId)`, `insertRecording(input)`, `updateRecordingStatus(egressId, status, sizeBytes?, endedAt?)`, `listRecordingsByMeeting(meetingId)`, `getActiveTrackEgressForMeeting(meetingId)` (all rows still in `recording` state), `listDoneAudioForMeeting(meetingId)`, `listDoneMixedForMeeting(meetingId)`, `insertFinalRecording(meetingId, filePath, egressId, sizeBytes?)`, `markParticipantJoined(meetingId, userId)` (upsert), `markParticipantLeft(meetingId, userId)`, `setMeetingEmptySince(meetingId, isoOrNull)` (Phase 4 — webhook timer anchor), `countLiveParticipantsLocal(meetingId)` (Phase 4 — DB-only count for webhook fast path), `getUserDisplayName(userId)` (joins `users.first_name + last_name`). `closeDb()` for graceful shutdown |
| [meeting-server/src/auth.ts](./meeting-server/src/auth.ts) | Verifies TaskHub session JWTs using the shared `JWT_SECRET`. `verifyToken(token)` throws on failure and returns `{userId, email, isAdmin}` typed payload (mirrors `src/lib/auth/jwt.ts` issuer `taskhub`, audience `taskhub-users`). `tryVerifyToken` is the non-throwing variant. `extractBearer(header)` pulls the token out of `Authorization: Bearer …` |
| [meeting-server/src/egress.ts](./meeting-server/src/egress.ts) | Thin wrappers over `EgressClient` from `livekit-server-sdk` with lazy singleton. Path helpers: `meetingRecordingsDir(meetingId)`, `audioTrackFilePath(meetingId, userId, egressId)`, `roomCompositeFilePath(meetingId)`. API: `startTrackEgress({roomName, trackId, userId, meetingId})` — `DirectFileOutput` OGG, inserts `track_type='audio'` row with canonical path; `startRoomCompositeEgress({roomName, meetingId})` — `EncodedFileOutput` MP4 (`H264_720P_30`, layout `speaker`), inserts `track_type='mixed'` row; `stopEgress(egressId)` (idempotent: suppresses errors when local row is already terminal); `stopAllForMeeting(meetingId)` iterates active rows, marks them `processing`, returns `{stoppedEgressIds, failed[]}`. `setEgressClient(client)` test seam |
| [meeting-server/src/webhooks.ts](./meeting-server/src/webhooks.ts) | Fastify plugin registering `POST /webhook`. `WebhookReceiver` verifies LiveKit signature (401 on miss/invalid). Adds `application/webhook+json` raw-text content parser so the verifier sees exact signed bytes. `parseUserIdFromIdentity(identity)` extracts numeric id from `"user:<id>"`. `dispatchWebhookEvent(event, ctx)` routes by `event.event`: `track_published` (starts per-track audio egress for late joiners when recording is active), `participant_joined` (Phase 4: unconditionally clears `meetings.empty_since` — any join, user or guest, resets the 5-min timer — then upserts `meeting_participants` for `user:*` identities), `participant_left` (marks DB participant left for `user:*` identities, then recounts via `countLiveParticipantsLocal`; when 0 arms `empty_since = now` so the Next cron will auto-end after 5 min), `egress_ended` (flips row to `done` or `failed`, stores size + endedAt; for `track_type='mixed'` successes also calls `remuxFaststartInPlace` on the MP4 so the `moov` atom moves to the head of the file for Safari/iOS progressive playback, then refreshes the DB size; finally triggers `muxer.runForMeeting` once every active egress for the meeting has settled), `room_finished` (best-effort `stopAllForMeeting`). Unknown events are logged and acked. Handler errors return 200 to prevent retry storms. Phase 4 DB writes are each try/catch-wrapped so a hiccup never fails the webhook |
| [meeting-server/src/muxer.ts](./meeting-server/src/muxer.ts) | ffmpeg post-mux pipeline. `buildFfmpegArgs({videoFilePath, audioTracks, outputFilePath})` pure argv builder: emits `-y`, inputs video first then audios, `-map 0:v -c:v copy` (when video), `-map N:a -c:a copy` per audio + `-metadata:s:a:<i> title=<userName>` and `-metadata:s:a:<i> language=<lang>` (defaults `rus`). Throws when both inputs empty. `runFfmpeg(args, {ffmpegPath?})` spawn wrapper resolving `{exitCode, stderr}`. `remuxFaststartInPlace(filePath, {ffmpegPath?})` rewrites the MP4 container in place with `-c copy -movflags +faststart` via a sibling `*.faststart.tmp` and atomic rename — used to move the `moov` atom to the file head so Safari/iOS can stream progressively. `runForMeeting(meetingId)` orchestrator: reads `listDoneMixedForMeeting` + `listDoneAudioForMeeting`, resolves user display names via `getUserDisplayName` (numeric ids) or falls back to the raw id, writes `final_<meetingId>.mkv` + sibling `final_<meetingId>.manifest.json` (`{finalMkv, tracks: [{userId, userName, trackIndex}]}`), inserts a `track_type='final_mkv'` row, marks it `done` with file size; non-zero exit codes mark the row `failed` and rethrow |
| [meeting-server/src/routes.ts](./meeting-server/src/routes.ts) | Fastify plugin registering egress control endpoints. Auth: every route requires `Authorization: Bearer <service-jwt>` verified via `auth.ts`. `POST /recordings/start` (body `{meetingId, roomName}`) validates meeting existence + `roomName` match, calls `startRoomCompositeEgress` then enumerates `RoomServiceClient.listParticipants` and starts `startTrackEgress` for each unmuted audio `TrackInfo` (`TrackType.AUDIO`), returns `{ok, egressIds[]}`. `POST /recordings/stop` (body `{meetingId}`) → `stopAllForMeeting`, returns `{ok, stoppedEgressIds[]}`. `GET /recordings/status?meetingId=N` → `{meetingId, activeEgress, processing, done, failed}`. Aliases `POST /egress/start`, `POST /egress/stop` mirror the infra plan paths |
| [meeting-server/src/\_\_tests\_\_/muxer.test.mts](./meeting-server/src/__tests__/muxer.test.mts) | `node:test` unit tests for `buildFfmpegArgs`: input ordering (video first), map flags (`0:v`, `N:a`), metadata stream-index accounting (counts *output audio streams*, always 0-based), per-track title/language overrides, video-only and audio-only permutations, empty-input throw. Sets minimum required env vars before dynamic import |

### Next.js side — LiveKit bindings

- Root `package.json` adds `livekit-client@^2` (browser SDK for the meeting UI), `livekit-server-sdk@^2` (token minting, egress orchestration from Next API routes), `msgpackr` (wire format for drawing strokes over the data channel), and devDep `tsx` (runs the `node:test` unit suite under TypeScript).
- [next.config.ts](./next.config.ts) — `env.NEXT_PUBLIC_LIVEKIT_URL` is inlined into the client bundle (default `ws://localhost:7880`).
- [.env.example](./.env.example) — documents the new vars: `LIVEKIT_URL`, `NEXT_PUBLIC_LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `MEETING_WORKER_URL`.
- [package.json](./package.json) — `scripts.test` runs `tsx --test src/lib/meetings/__tests__/*.test.mts`.

### Meetings Service Layer ([`src/lib/meetings/`](./src/lib/meetings/))

| File | Description |
|------|-------------|
| [access.ts](./src/lib/meetings/access.ts) | `isHost(userId, meetingId)` — compares `meetings.hostId`. `canJoinMeeting(userId, meetingId)` — returns true when the user is the host, is listed in `meeting_participants`, or has `users.isAdmin = true`. Both return false for non-existent meetings |
| [tokens.ts](./src/lib/meetings/tokens.ts) | `issueLiveKitToken({userId, userName, roomName, isHost, ttl?})` — wraps `livekit-server-sdk` `AccessToken`. Always grants `roomJoin`, `room`, `canPublish`, `canSubscribe`, `canPublishData`; for `isHost` also grants `roomAdmin` and `roomRecord`. Default TTL `DEFAULT_TOKEN_TTL = '6h'`. Reads `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` at call time (easy to mock in tests). `issueGuestLiveKitToken({identity, userName, roomName, ttl?})` — guest variant: arbitrary identity string (e.g. `guest:<uuid>`), no roomAdmin/roomRecord grants |
| [guest-tokens.ts](./src/lib/meetings/guest-tokens.ts) | Guest invite-link service against the `meeting_guest_tokens` table. `createGuestToken(meetingId, createdBy)` inserts a fresh `randomBytes(24).toString('base64url')`. `listActiveGuestTokens(meetingId)` returns non-revoked rows. `findActiveGuestToken(token)` resolves token → row (or null). `revokeGuestToken(token)` stamps `revoked_at`, idempotent. `buildGuestIdentity()` returns `guest:<randomUUID>`; `isGuestIdentity(identity)` checks the prefix |
| [meetings.ts](./src/lib/meetings/meetings.ts) | CRUD + lifecycle: `createMeeting({hostId, title, recordingEnabled})` (generates UUID roomName, inserts host participant row), `getMeeting(id)`, `getMeetingDetail(id)` (participants joined with user display names), `listMeetings({userId})` (host ∪ participant, newest first), `addParticipant(meetingId, userId, role?)` (idempotent), `removeParticipant(meetingId, userId)` (throws when target is the host), guest-link service at [guest-tokens.ts](./src/lib/meetings/guest-tokens.ts), `markParticipantJoined` (flips `scheduled` → `live`, stamps `startedAt`), `markParticipantLeft`, `endMeeting(meetingId)` (idempotent; transitions to `ended`, stamps `endedAt`, calls `stopAllForMeeting` best-effort). Re-exports `isHost` and the `anyMeetingFilter` helper |
| [egress-client.ts](./src/lib/meetings/egress-client.ts) | HTTP client for the meeting-worker. `startRecording(meetingId, roomName)`, `stopRecording(meetingId)` (+ alias `stopAllForMeeting`), `getRecordingStatus(meetingId)`. Signs a short-lived service JWT (`jose`, same `JWT_SECRET`, `taskhub` issuer/`taskhub-users` audience, 60 s TTL, `sub: 'next-server'`) and sends it as `Authorization: Bearer …`. 10 s fetch timeout via `AbortController`. Surfaces failures as `EgressClientError` with `status`/`body`/`cause` |
| [recordings.ts](./src/lib/meetings/recordings.ts) | Playback side. `listRecordings(meetingId)` (all statuses, ASC by `startedAt`), `listDoneRecordings(meetingId)`, `getRecording(id)`, `getStreamPath(id)` (resolves abs/relative against `RECORDINGS_DIR`, returns null if file missing), `buildManifest(meetingId)` → `RecordingsManifest { meetingId, status: 'empty'\|'processing'\|'ready', finalMkv, roomComposite, perUserAudio[] }`. `perUserAudio` entries are enriched with `userName` via a `users` lookup and carry a stable `trackIndex` |
| [messages.ts](./src/lib/meetings/messages.ts) | Chat service against `meeting_messages`. `listMessages(meetingId, {limit?, before?})` — newest-first, cursor-paginated by `before` (Date or ISO string); joins `users` for the `MeetingMessageUser` snapshot; default limit 50, max 100 (`DEFAULT_LIMIT`/`MAX_LIMIT`). `getMessage(id)` — hydrated single row. `createTextMessage(meetingId, userId, content)` — validates non-empty and `MAX_TEXT_LENGTH=4000`. `createFileMessage(meetingId, userId, {filePath, fileName, fileSize, mimeType, kind?, width?, height?})` — derives `kind` from mimeType via `inferKindFromMime` (image/* → 'image'), rejects kind/mime mismatch, requires positive width/height for images. `toIsoString` normalises SQLite `CURRENT_TIMESTAMP` to RFC 3339 |
| [cleanup.ts](./src/lib/meetings/cleanup.ts) | Empty-meeting auto-close service (Phase 4). `EMPTY_MEETING_TTL_MS = 5*60*1000`. `countLiveParticipants(meetingId, roomName)` merges DB rows (`meeting_participants` WHERE `joined_at NOT NULL AND left_at IS NULL`, identities formatted as `user:<id>`) with LiveKit `RoomServiceClient.listParticipants(roomName)` output (identities include `guest:*`), deduping by identity string. LiveKit errors are logged and swallowed (under-count over over-close). `tickEmptyMeetings()` iterates `meetings WHERE status='live'` and for each: count>0 → null-out `empty_since`; count=0 & `empty_since` null → arm with `now()`; count=0 & elapsed > TTL → call `endMeeting(id)` (idempotent). `setRoomClientForTests(client)` dependency-injection hook for unit tests. LiveKit client built lazily from `LIVEKIT_URL`/`LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` (falls back to `NEXT_PUBLIC_LIVEKIT_URL`) |
| [__tests__/tokens.test.mts](./src/lib/meetings/__tests__/tokens.test.mts) | `node:test` unit tests for `issueLiveKitToken`: JWT shape, participant vs host grants, identity/name encoding, input validation, TTL constant |
| [__tests__/access.test.mts](./src/lib/meetings/__tests__/access.test.mts) | `node:test` unit tests for `isHost` and `canJoinMeeting`. Boots an isolated tmp SQLite file via `DATABASE_PATH` override, creates meeting tables inline (legacy `db/index.ts` bootstrap only covers pre-meeting tables), covers host/listed/admin/stranger/missing scenarios |
| [__tests__/cleanup.test.mts](./src/lib/meetings/__tests__/cleanup.test.mts) | `node:test` unit tests for `tickEmptyMeetings`. Isolated tmp SQLite, stubbed `RoomServiceClient` via `setRoomClientForTests`. Covers: empty room arms `empty_since`; DB-participant rejoin clears; LiveKit-only guest:* presence clears; elapsed TTL flips to `status='ended'` with `ended_at` stamp; within-grace stays live; ended meetings skipped (idempotent); `status!='live'` meetings ignored |
| [invite-notifications.ts](./src/lib/meetings/invite-notifications.ts) | `notifyInvitedUsers(meetingId, userIds[], inviterId)` — fans out a `meeting_invite` notification + Web Push per invitee. Looks up meeting title and inviter display name once, composes a localized title/message, de-duplicates userIds, excludes the inviter from the recipient set, delegates each DB write + push to `sendPushNotification` from `src/lib/notifications/push.ts`. Per-recipient errors are logged but never propagated |
| [__tests__/invite-notifications.test.mts](./src/lib/meetings/__tests__/invite-notifications.test.mts) | `node:test` integration tests for `notifyInvitedUsers`. Isolated tmp SQLite with meetings DDL replayed inline. Covers: one notification per invitee with correct `type`/`link`/`title`/`message`, inviter excluded from self-notify, duplicate userIds collapsed, empty-array no-op, missing-meeting no-op |

### Meetings API ([`src/app/api/meetings/`](./src/app/api/meetings/))

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/meetings` | GET | `requireAuth`; returns `{ data: Meeting[] }` from `listMeetings({userId})` |
| `/api/meetings` | POST | `requireAuth`; body `{title: string (1..200), recordingEnabled?: boolean}`; creates meeting via `createMeeting`; responds 201 `{ data: Meeting }` |
| `/api/meetings/[id]` | GET | `requireAuth` + `canJoinMeeting` (403). Returns `{ data: MeetingDetail }` (meeting + participants[] with `userName`). 404 if meeting missing, 400 on invalid id |
| `/api/meetings/[id]` | DELETE | `requireAuth` + `isHost` (admins also allowed) else 403. Calls `endMeeting` which flips status to `ended` and fires best-effort `stopAllForMeeting` to the worker. Returns `{ data: Meeting }` |
| `/api/meetings/[id]/token` | POST | `requireAuth` + `canJoinMeeting` (403). 409 if meeting already `ended`. Resolves display name from `users.firstName/lastName` (falls back to email), upserts participant row, `markParticipantJoined` (`scheduled` → `live`), returns `{ data: { token, url, roomName } }`. `url` prefers `NEXT_PUBLIC_LIVEKIT_URL` then `LIVEKIT_URL` |
| `/api/meetings/[id]/recordings` | GET | `requireAuth` + `canJoinMeeting` (403). Returns `{ data: RecordingsManifest }` — status `processing` is returned (not an error) while egress/mux is in progress |
| `/api/meetings/[id]/recordings/[trackId]` | GET | `requireAuth` + `canJoinMeeting` (403). Ensures the recording belongs to the given meeting (else 404). 409 if `status !== 'done'`. Streams file via `fs.createReadStream` wrapped in a `ReadableStream`. Supports HTTP `Range` (`bytes=start-end` and suffix `bytes=-N`) → 206 with `Content-Range`/`Content-Length`. Malformed range → 416. `Content-Type` derived from extension (mkv/mp4/webm/ogg/mp3/m4a/wav), fallback `application/octet-stream`. `Cache-Control: private, no-store`, RFC5987-encoded `Content-Disposition: inline; filename*` |
| `/api/meetings/[id]/recordings/start` | POST | `requireAuth` + host-only (403 non-host, 404 missing). Proxies to the meeting-worker via `egress-client.startRecording(meetingId, roomName)`. Surfaces worker failures as HTTP 502 (`EgressClientError`). Returns `{ data: StartRecordingResponse }` |
| `/api/meetings/[id]/recordings/stop` | POST | `requireAuth` + host-only (403 non-host, 404 missing). Idempotent proxy to `egress-client.stopRecording(meetingId)`. Worker errors → 502. Returns `{ data: StopRecordingResponse }` |
| `/api/meetings/[id]/participants` | POST | `requireAuth` + host-only (admins allowed) else 403. Body `{ userIds: number[] }`. Idempotently calls `addParticipant(meetingId, uid, 'participant')` per id. Diffs the participant set before/after to identify newly added users and fire-and-forgets `notifyInvitedUsers(meetingId, newlyAddedIds, inviterId)` from [src/lib/meetings/invite-notifications.ts](./src/lib/meetings/invite-notifications.ts); notification errors never block the response. Returns 201 `{ data: MeetingParticipant[] }`. 404 if meeting missing |
| `/api/meetings/[id]/participants/[userId]` | DELETE | `requireAuth` + host-only (admins allowed) else 403. Calls `removeParticipant(meetingId, userId)` — refuses host removal (400). 404 if meeting missing. Returns `{ data: { removed: true } }` |
| `/api/meetings/invitable-users` | GET | `requireAuth`; returns `{ data: {id, firstName, lastName}[] }` — all users except the caller, ordered by first/last name. Deliberately omits email/admin flag so any authenticated user can drive an invite picker |
| `/api/meetings/[id]/invite-links` | GET | Host-only (admins allowed). Returns `{ data: {token, url, createdAt}[] }` for active guest invite tokens on the meeting. `url` is built from `x-forwarded-origin`/`origin`/`request.nextUrl.origin` + `/join/<token>` |
| `/api/meetings/[id]/invite-links` | POST | Host-only (admins allowed). Mints a fresh guest token (`randomBytes(24).toString('base64url')`). Returns 201 `{ data: {token, url, createdAt} }` |
| `/api/meetings/[id]/invite-links` | DELETE | Host-only. `?token=<value>` query param required. Idempotently marks the token revoked (stamps `revoked_at`). Returns `{ data: {revoked: boolean} }` |
| `/api/meetings/guest/[token]` | GET | **Public** (no auth). Resolves an invite token to `{ data: {meetingId, title, status} }`. 404 when token is missing/revoked/the meeting does not exist; 410 when the meeting `status === 'ended'` |
| `/api/meetings/guest/[token]/token` | POST | **Public** (no auth). Body `{ displayName: string (1..60) }`. Validates the invite token + meeting state, generates a fresh `guest:<uuid>` LiveKit identity, mints a guest-scope LiveKit JWT (no roomAdmin/roomRecord) via `issueGuestLiveKitToken`, returns `{ data: {token, url, roomName, identity, displayName, meetingId, title} }`. No DB participant row is written — the host sees guests only while they are live in the LiveKit room |
| `/api/meetings/[id]/messages` | GET | `requireAuth` + `canJoinMeeting` (403). Query `limit` (1..100, default 50), `before` (ISO 8601 cursor). Returns `{ items: MeetingMessage[], nextBefore: string \| null }` newest-first. `nextBefore` is the oldest row's `createdAt` when the page is full, else `null` |
| `/api/meetings/[id]/messages` | POST | `requireAuth` + `canJoinMeeting` (403). Body `{ content: string (trimmed, 1..4000) }`. Creates a `text` message via `createTextMessage`. Returns 201 `{ data: MeetingMessage }` |
| `/api/meetings/[id]/messages/upload` | POST | `requireAuth` + `canJoinMeeting` (403). multipart/form-data with `file` part (max 25 MiB → 413). Rejects MIME `application/x-msdownload`/x-sh/etc and extensions `.exe/.bat/.cmd/.ps1/...` (415). Writes to `data/meeting-uploads/<meetingId>/<uuid>_<safeName>` via `MEETING_UPLOADS_DIR`. For `image/*` probes dimensions via dynamic-imported `sharp`; rejects undecodable images (400). Calls `createFileMessage`. Returns 201 `{ data: MeetingMessage }`. Orphan file cleanup on DB failure |
| `/api/meetings/[id]/messages/files/[fileId]` | GET | `requireAuth` + `canJoinMeeting` (403). `fileId` is `meeting_messages.id`; must belong to URL meeting and be kind `file`/`image` (404 otherwise). Path-containment check against `MEETING_UPLOADS_DIR`. Supports HTTP `Range` → 206 with `Content-Range`/`Content-Length`; malformed range → 416. `Content-Disposition` is `inline` for images, `attachment` for everything else. `Content-Type` comes from the stored `mime_type`. RFC5987-encoded filename |

Route files: [`route.ts`](./src/app/api/meetings/route.ts), [`[id]/route.ts`](./src/app/api/meetings/[id]/route.ts), [`[id]/token/route.ts`](./src/app/api/meetings/[id]/token/route.ts), [`[id]/recordings/route.ts`](./src/app/api/meetings/[id]/recordings/route.ts), [`[id]/recordings/[trackId]/route.ts`](./src/app/api/meetings/[id]/recordings/[trackId]/route.ts), [`[id]/recordings/start/route.ts`](./src/app/api/meetings/[id]/recordings/start/route.ts), [`[id]/recordings/stop/route.ts`](./src/app/api/meetings/[id]/recordings/stop/route.ts), [`[id]/participants/route.ts`](./src/app/api/meetings/[id]/participants/route.ts), [`[id]/participants/[userId]/route.ts`](./src/app/api/meetings/[id]/participants/[userId]/route.ts), [`invitable-users/route.ts`](./src/app/api/meetings/invitable-users/route.ts), [`[id]/invite-links/route.ts`](./src/app/api/meetings/[id]/invite-links/route.ts), [`guest/[token]/route.ts`](./src/app/api/meetings/guest/[token]/route.ts), [`guest/[token]/token/route.ts`](./src/app/api/meetings/guest/[token]/token/route.ts), [`[id]/messages/route.ts`](./src/app/api/meetings/[id]/messages/route.ts), [`[id]/messages/upload/route.ts`](./src/app/api/meetings/[id]/messages/upload/route.ts), [`[id]/messages/files/[fileId]/route.ts`](./src/app/api/meetings/[id]/messages/files/[fileId]/route.ts)

Uploaded meeting files live under `data/meeting-uploads/<meetingId>/<uuid>_<safeName>` (overrideable via `MEETING_UPLOADS_DIR`). The directory is inside the shared `taskhub-data` Docker volume (same volume as `taskhub.db` and `recordings/`) so both the Next app and meeting-worker share the same view. `.dockerignore` excludes `data/` from the build context so user uploads never end up in the image.

### Meetings Frontend State

| File | Description |
|------|-------------|
| [src/stores/meetingStore.ts](./src/stores/meetingStore.ts) | Zustand store (in-memory, no persist) with `participants: Map<sid, ParticipantInfo>`, `localTracks: {mic, cam, screen}` (LocalTrackPublication refs), `tools: {color, width, mode: 'pen'\|'eraser'}`, `annotations: StrokeEvent[]`, `recordingState: 'idle'\|'recording'\|'stopping'`. Actions: `setParticipant`, `removeParticipant`, `clearParticipants`, `setLocalTrack`, `addStroke`, `undoStroke`, `clearStrokes`, `pruneExpiredStrokes(now)` (drops strokes older than 2400ms = 2000ms hold + 400ms fade; ref-stable when nothing is pruned), `setTool`, `setRecordingState`, `reset` (called by MeetingRoom on unmount) |

### Meetings Frontend Hooks

| File | Description |
|------|-------------|
| [src/hooks/useMeeting.ts](./src/hooks/useMeeting.ts) | React Query hooks: `useMeetings()` (list, queryKey `['meetings']`), `useMeetingDetail(id)` (queryKey `['meetings', id]`), `useCreateMeeting()` (POST `/api/meetings`, invalidates list), `useEndMeeting(id)` (DELETE `/api/meetings/[id]`), `useMeetingToken(id)` (mutation POST `/api/meetings/[id]/token` — returns `{token, url, roomName}`), `useMeetingRecordings(id)` (manifest, polls every 3s while `status === 'processing'`), `useStartRecording(id)` / `useStopRecording(id)` (POST `/api/meetings/[id]/recordings/start\|stop`, invalidate manifest), `useInvitableUsers(enabled)` (GET `/api/meetings/invitable-users`, queryKey `['meetings','invitable-users']`), `useInviteMeetingParticipants(meetingId)` (POST `/api/meetings/[id]/participants`, invalidates detail + list), `useRemoveMeetingParticipant(meetingId)` (DELETE `/api/meetings/[id]/participants/[userId]`, invalidates detail + list), `useMeetingInviteLinks(meetingId, enabled)` (GET `/api/meetings/[id]/invite-links`, queryKey `['meetings', meetingId, 'invite-links']`), `useCreateInviteLink(meetingId)` (POST, invalidates link list), `useRevokeInviteLink(meetingId)` (DELETE with `?token=`, invalidates link list) |
| [src/hooks/useMeetingRoom.ts](./src/hooks/useMeetingRoom.ts) | Owns the `Room` lifecycle. Inputs `{token, url, isHost, enableMedia=true}`. Creates `new Room({adaptiveStream, dynacast, audioCaptureDefaults})`, connects via `room.connect(url, token, {autoSubscribe, maxRetries:3})`, on connect publishes mic+cam (`setMicrophoneEnabled`, `setCameraEnabled`). Subscribes to `RoomEvent.Connected/Disconnected/ConnectionStateChanged/ParticipantConnected/Disconnected/TrackPublished/TrackSubscribed/Unsubscribed/Muted/Unmuted/LocalTrackPublished/LocalTrackUnpublished` and projects participant + local-track snapshots into `meetingStore`. Cleanup unhooks all listeners, disconnects the room, clears the store. Returns `{room, isConnected, connectionState, error, reconnect}` |
| [src/hooks/useLiveKitData.ts](./src/hooks/useLiveKitData.ts) | Generic typed wrapper around the LiveKit data channel scoped to a single `topic`. Inputs `(room: Room \| null, topic: string)`. Returns `{publish(data, opts?), subscribe(handler) -> unsubscribe}`. Uses module-singleton `Packr`/`Unpackr` (msgpackr) for binary serialization. Listens once to `RoomEvent.DataReceived`, filters by topic, decodes payload, fans out to every registered handler (snapshot-iterated to allow handlers to subscribe/unsubscribe synchronously). Handler set drains on unmount. `publish` calls `room.localParticipant.publishData(bytes, {reliable: true (default), topic, destinationIdentities?})` |
| [src/hooks/useDrawingSync.ts](./src/hooks/useDrawingSync.ts) | Bridges `meetingStore.annotations` with `DrawingPayload` over data-channel topic `"draw"`. Inputs `{room, userId}`. Returns `{publishStroke, publishUndo, publishClear, nextStrokeId}`. All publish verbs apply the local mutation first (optimistic) and then `data.publish(...)`. `publishStroke` stamps `createdAt = Date.now()` (local clock); incoming strokes are re-stamped with `Date.now()` on receive so the fade timer is immune to peer clock-skew. Subscriber routes by `msg.type` into `addStroke` / `undoStroke` / `clearStrokes`, dropping echoes whose `participant.identity === String(userId)` to avoid duplicating optimistic state. `nextStrokeId` uses `crypto.randomUUID()` with timestamp+random fallback |
| [src/hooks/useMeetingChat.ts](./src/hooks/useMeetingChat.ts) | Owns in-meeting chat state. Inputs `{meetingId, room, userId}`. Returns `{messages (chronological), isLoadingInitial, isLoadingMore, hasMore, error, loadEarlier, sendText, sendFile}`. On mount fetches `GET /api/meetings/[id]/messages?limit=50` and stores reversed. Subscribes to `useLiveKitData<ChatPayload>(topic='chat')`, dedupes by `id`, filters mismatched `meetingId`. `sendText` POSTs `/messages`, applies + broadcasts returned row. `sendFile` uses `XMLHttpRequest` to `/messages/upload` for `upload.onprogress` reporting via `UploadProgress {loaded, total, fraction}`. `loadEarlier` advances a `before` cursor. Self-echoes (matching `localIdentity = String(userId)`) ignored by the dedupe set |

### Meetings UI Components ([`src/components/meetings/`](./src/components/meetings/))

| File | Description |
|------|-------------|
| [icons.tsx](./src/components/meetings/icons.tsx) | Inline SVG icons (no icon library is bundled): `MicIcon`, `MicOffIcon`, `VideoIcon`, `VideoOffIcon`, `ScreenShareIcon`, `ScreenShareOffIcon`, `PhoneOffIcon`, `RecordCircleIcon`, `StopSquareIcon`, `DownloadIcon`, `SettingsIcon`, `FullscreenEnterIcon`, `FullscreenExitIcon`, `HostBadgeIcon`. All accept `SVGProps<SVGSVGElement>` and use `currentColor` |
| [VideoTile.tsx](./src/components/meetings/VideoTile.tsx) | Single participant tile. Props `{participant, label?, highlighted?, className?}`. Attaches the participant's `Track.Source.Camera` track to a `<video>` ref via `track.attach(el)` and the microphone track to a hidden `<audio>` (skipped for the local participant). Reacts to `ParticipantEvent.TrackSubscribed/Unsubscribed/Muted/Unmuted/LocalTrackPublished/Unpublished` to re-attach. Drives an animated audio-level border via `requestAnimationFrame` reading `participant.audioLevel`. Renders camera-off placeholder + mute badge |
| [ScreenShareView.tsx](./src/components/meetings/ScreenShareView.tsx) | Fullscreen presenter view. Props `{track: VideoTrack, participant, overlayContainerRef?, room?: Room \| null, userId?: number, className?}`. Attaches the screen-share track to `<video>` with `object-fit: contain`. Mounts `DrawingOverlay` (covering the visible video rect) inside the absolutely-positioned overlay slot, and a bottom-center `DrawingToolbar`. Both are gated on `room && typeof userId === 'number'` (when missing, the component degrades to read-only). Local `drawingEnabled` state (default off) is toggled by the toolbar; while off the canvas keeps `pointer-events: none` so the underlying video is interactive. Renders a "Демонстрация: <name>" badge and a top-right fullscreen toggle button using the Fullscreen API (`requestFullscreen`/`exitFullscreen` with webkit fallbacks) |
| [DrawingOverlay.tsx](./src/components/meetings/DrawingOverlay.tsx) | Canvas drawing layer placed over a screen-share `<video>`. Props `{videoElement: HTMLVideoElement \| null, room: Room \| null, userId: number, enabled: boolean, className?}`. Tracks the visible video rect via `ResizeObserver` (on the video, its parent, and the wrapper) plus `loadedmetadata`/`resize` events; sizes/positions an absolute `<canvas>` to that rect. Backing store sized to `rect * devicePixelRatio` for crisp HiDPI lines. Pointer handlers use `setPointerCapture` and convert clientX/Y → normalized `[0..1]` via the canvas bounding rect (clamped). Rendering is driven by a continuous `requestAnimationFrame` loop: each tick clears the canvas, computes per-stroke `alpha = age < 2000ms ? 1 : max(0, 1 - (age-2000)/400)` (in-progress polyline always at alpha=1), draws all strokes, then calls `pruneExpiredStrokes(Date.now())`. The loop self-starts when strokes appear (store subscription or pointerdown) and self-terminates when `annotations.length === 0 && inProgress === null`, so idle meetings spend zero CPU. Final pointerup builds a stroke (id from `nextStrokeId`) and calls `publishStroke` from `useDrawingSync` |
| [DrawingToolbar.tsx](./src/components/meetings/DrawingToolbar.tsx) | Floating pill toolbar bound to `meetingStore.tools` and `useDrawingSync`. Props `{room, userId, enabled, onToggleEnabled, className?}`. Toggle button "Рисовать"/"Рисую" (drives `enabled`). 7-color palette swatches (red/orange/amber/green/blue/violet/white) → `setTool({color})`. Width range slider 1..10 → `setTool({width})`. `Undo` button removes the last stroke whose `userId` matches local (derived from `annotations`); disabled when nothing of ours exists. `Очистить` calls `publishClear` after `window.confirm`; disabled when `annotations` empty |
| [MeetingControls.tsx](./src/components/meetings/MeetingControls.tsx) | Bottom action bar. Props `{room, isHost, meetingId, onLeft?}`. Buttons: mic/cam/screen toggles (call `room.localParticipant.setMicrophoneEnabled\|setCameraEnabled\|setScreenShareEnabled`), device-settings gear (opens `DeviceSettingsModal`), leave (`room.disconnect()` + `router.back()` or `onLeft`), record start/stop (host only — uses `useStartRecording` / `useStopRecording`, drives `meetingStore.recordingState`), "Завершить для всех" (host only — `useEndMeeting` then leave). Reads enabled flags from `meetingStore.localTracks` for instant UI feedback |
| [DeviceSettingsModal.tsx](./src/components/meetings/DeviceSettingsModal.tsx) | Device picker for mic/cam/speaker. Props `{room, open, onClose}`. Enumerates via `Room.getLocalDevices('audioinput'\|'videoinput'\|'audiooutput')`, reads current via `room.getActiveDevice(kind)`, switches via `room.switchActiveDevice(kind, deviceId)`. Subscribes to `RoomEvent.ActiveDeviceChanged` + `RoomEvent.MediaDevicesChanged` to keep the UI in sync (hot-plug). "Обновить" button re-enumerates on demand |
| [ParticipantsList.tsx](./src/components/meetings/ParticipantsList.tsx) | Right-sidebar list. Props `{participants?, className?}`. When `participants` not supplied, reads from `meetingStore.participants`. Each row: avatar initial, display name, host badge (`HostBadgeIcon`), `(вы)` suffix for local, mic/cam state icons computed from `participant.getTrackPublication(Track.Source.Microphone\|Camera).isMuted` |
| [RecordingsList.tsx](./src/components/meetings/RecordingsList.tsx) | Player + track selector for a meeting's recordings. Props `{meetingId, className?}`. Pulls manifest via `useMeetingRecordings` and meeting row via `useMeetingDetail` (for `startedAt`). Renders empty/processing/error states. When ready, lays out a two-column grid (stacked on mobile, 1fr + 320px on `lg+`): left column hosts `PlayerPrimary` with a shared `videoRef` (forwarded via callback-ref from inner `<video>` so seeks work even though the element lives in a child), right column hosts `RecordingChatTimeline` wired through `onMessageClick={offsetSec => video.currentTime = clamped}` (auto-plays if paused, ignores autoplay-block rejection). Primary `<video>` source is the mixed MP4 (`roomComposite`, faststart remux server-side) — chosen first for cross-browser compatibility (Safari/iOS do not play MKV); the final MKV is only used as playback fallback when `roomComposite` is absent. Audio-track selector: in browsers exposing `HTMLVideoElement.audioTracks` (Chromium) toggles `audioTracks[i].enabled` to switch speaker; elsewhere falls back to a list of per-user `<audio>` elements pointed at the OGG egress URLs. Download row exposes two links: "Скачать MP4" for the primary stream and, when present, "Скачать MKV (мультидорожка)" for the multi-audio archive |
| [RecordingChatTimeline.tsx](./src/components/meetings/RecordingChatTimeline.tsx) | Read-only chat timeline rendered next to `RecordingsList`'s player on the recordings page. Props `{meetingId, meeting?, onMessageClick?, className?}`. Fetches chat history directly from `GET /api/meetings/:id/messages` (paginated with `before` cursor, up to `MAX_PAGES=20` × `PAGE_SIZE=50`), sorts ascending by `createdAt`, renders author initial + name + `HH:mm` time + body. Text bubbles use `whitespace-pre-wrap`; `image` kind renders thumbnail via `/api/meetings/[id]/messages/files/[id]`; `file` kind renders icon + name + `formatBytes`. When `onMessageClick` is provided **and** `meeting.startedAt` is set, each bubble is a button that calls `onMessageClick((createdAt - startedAt) / 1000)` with the offset in seconds (clamped ≥ 0) and displays the offset chip in `mm:ss`/`HH:mm:ss` format; otherwise bubbles are plain divs. Placeholder "Нет сообщений" on empty state, "Загрузка сообщений…" while loading |
| [InviteParticipantsModal.tsx](./src/components/meetings/InviteParticipantsModal.tsx) | Modal for inviting users. Props `{meetingId, open, onClose, existingUserIds}`. Fetches users via `useInvitableUsers(open)`, filters out already-present ids, provides a name search box, multi-select checkboxes, and a submit button wired to `useInviteMeetingParticipants(meetingId)`. Shows toasts on success/error |
| [GuestInviteLinksModal.tsx](./src/components/meetings/GuestInviteLinksModal.tsx) | Host-only modal managing guest invite links. Props `{meetingId, open, onClose}`. Calls `useMeetingInviteLinks(meetingId, open)` to list active links, `useCreateInviteLink(meetingId)` to mint, `useRevokeInviteLink(meetingId)` to revoke. Copy-to-clipboard via `navigator.clipboard.writeText` with `execCommand('copy')` fallback. Creating a link auto-copies the URL |
| [ChatPanel.tsx](./src/components/meetings/ChatPanel.tsx) | In-meeting chat sidebar. Props `{meetingId, room, userId, onNewMessage?, isActive?, className?}`. Uses `useMeetingChat`. Renders `Bubble` per message: avatar initial + name + HH:mm time; text (whitespace-pre-wrap), `image` (inline thumbnail clamped to 240×180 preserving aspect, click → `Lightbox`), `file` (icon + name + formatBytes + download anchor to `/api/meetings/[id]/messages/files/[fileId]`). Auto-scrolls on arrival if user was within 80px of bottom. "Показать раньше" button calls `loadEarlier` preserving scroll position via `scrollHeight` delta. `Lightbox` dismisses on Esc + click-on-backdrop + close button. Delegates input to `<ChatInput>` footer |
| [ChatInput.tsx](./src/components/meetings/ChatInput.tsx) | Chat footer. Props `{onSendText, onSendFile, disabled?, className?}`. Auto-resizing textarea (up to ~6 lines, `maxLength=4000`). `Enter` sends, `Shift+Enter` newline, IME composing guard. Paperclip button opens hidden `<input type=file multiple>`. `onPaste` uploads any `image/*` clipboard entries. Drag & drop zone covers the footer with visual overlay while `isDragActive`. Per-file upload tiles with progress bar + cancel; tiles disappear once the upload completes and the bubble shows in the panel. Client-side validates size ≤ 25 MiB and rejects `.exe/.bat/...` extensions (BLOCKED_EXTENSIONS) |
| [MeetingRoom.tsx](./src/components/meetings/MeetingRoom.tsx) | Top-level meeting page composition. Props `{meetingId, token, url, isHost, userId, onLeft?}`. Calls `useMeetingRoom`, renders Loading/Reconnecting/Error states with a "Повторить попытку" button wired to `reconnect()`. Layout: when any participant has a `Track.Source.ScreenShare` track subscribed, the main pane shows `ScreenShareView` (forwarding `room` and `userId` to enable drawing) with a horizontal strip of small `VideoTile`s; otherwise a responsive grid of tiles. Right sidebar carries tab switcher `Участники / Чат / Доски`: all panels stay mounted simultaneously (ChatPanel keeps its LiveKit subscription while other tabs are visible), `hidden` toggled by CSS. Unread badge on the `Чат` tab increments via `onNewChatMessage` while chat is not active, clears on tab switch. Active tab persisted to `localStorage['taskhub.meeting-room.sidebar-tab']`. Bottom `MeetingControls`. Calls `meetingStore.reset()` on unmount |
| [MeetingWorkspacesPanel.tsx](./src/components/meetings/MeetingWorkspacesPanel.tsx) | "Доски" tab panel. Props `{meetingId, isActive}`. Lists workspaces attached to the meeting via `GET /api/meetings/[id]/workspaces` (refetch on tab activation). Each card opens `/workspaces/<id>` in a new tab (`target="_blank" rel="noopener"`). Inline form "+ Новая доска" — title input → POST `/api/meetings/[id]/workspaces` (server creates a fresh workspace already attached to this meeting + makes the caller owner) → optimistic insert + `window.open` of the new board |

### Meetings Pages ([`src/app/(dashboard)/meetings/`](./src/app/(dashboard)/meetings/))

Route protection: `src/middleware.ts` includes `/meetings` in `PROTECTED_PREFIXES` so unauthenticated visits are redirected to `/login`. Per-meeting access is enforced at the API layer (`canJoinMeeting` in the token + detail + recordings endpoints).

| File | Description |
|------|-------------|
| [page.tsx](./src/app/(dashboard)/meetings/page.tsx) | `/meetings` — meetings list + create. Client Component. Uses `useMeetings()` for the list (grid of cards: title, createdAt, status badge, recording dot, Войти / Открыть записи). Header button opens an inline modal `CreateMeetingDialog` (`InputField` title 1..200 chars, recording-enabled checkbox) that calls `useCreateMeeting` and navigates to `/meetings/[id]` on success. Uses `EmptyState` when the list is empty, `Skeleton` while loading, and toast messages via `useToast` |
| [[id]/page.tsx](./src/app/(dashboard)/meetings/[id]/page.tsx) | `/meetings/[id]` — room page. Client Component. Parses the id, resolves the current user via `/api/auth/me`, loads meeting detail via `useMeetingDetail`, computes `isHost = detail.hostId === user.userId`, mints a LiveKit token once per page visit through `useMeetingToken` (handles 403/409 errors returned by the backend's `canJoinMeeting` check). Bails to a "Требуется вход" pane when `/api/auth/me` returned `null`. When `isHost`, renders an `InviteParticipantsHeader` strip above the room: "Пригласить" button (opens `InviteParticipantsModal`) + chips of non-host invitees with ×-remove (wired to `useRemoveMeetingParticipant`). Renders `<MeetingRoom meetingId token url isHost userId={user.userId} onLeft=() => push('/meetings') />`. Shows loading/error panes while any of the three fetches are pending |
| [src/app/join/[token]/page.tsx](./src/app/join/[token]/page.tsx) | `/join/[token]` — **public** guest landing (no auth required, listed in `PUBLIC_EXCEPTIONS` of `src/middleware.ts`). Fetches meeting summary via `GET /api/meetings/guest/[token]`, shows a name input, posts to `POST /api/meetings/guest/[token]/token` on submit, then renders `<MeetingRoom>` (isHost=false, userId=0). Renders a "Нет доступа" panel on 404/410, a "Встреча уже завершена" panel on status `ended` |
| [[id]/recordings/page.tsx](./src/app/(dashboard)/meetings/[id]/recordings/page.tsx) | `/meetings/[id]/recordings` — playback page. Client Component. Back link to `/meetings`, primary "Создать задачу" button (seeds `createTaskPrefill = { title: "Задача из встречи №{id}", description: "Источник: /meetings/{id}/recordings" }` into `useUIStore` then calls `openModal('createTask')` — the dashboard-level `CreateTaskModal` picks it up and clears it on close), and a ghost "Открыть встречу" link back to the live room, then `<RecordingsList meetingId />` (polls manifest, auto-switches from "Обработка записи…" to the MKV player once post-mux finishes) |

### Meetings Navigation

- [src/components/layout/Sidebar.tsx](./src/components/layout/Sidebar.tsx) — `MeetingsIcon` (inline SVG, camera-with-arrow glyph) + `{href: '/meetings', label: 'Встречи'}` entry in `NAV_ITEMS`. `NavItem` highlights by `pathname` prefix match.
- [src/middleware.ts](./src/middleware.ts) — `/meetings` added to `PROTECTED_PREFIXES`.

---

## Workspaces (Excalidraw-like collaborative boards)

Per-board canvas with realtime peer collaboration and a side AI chat. Each workspace gets its own LiveKit room (UUID `room_name`), persists a snapshot + an append-only op log for late-join replay, and is gated by an explicit `workspace_participants` invite list (mirrors the meeting access model).

### Workspaces DB Tables

| Table | Columns | Indexes |
|-------|---------|---------|
| **workspaces** | id, owner_id FK(users CASCADE), title, room_name (LiveKit UUID), meeting_id FK(meetings SET NULL) NULL, snapshot_version (default 0), snapshot_payload TEXT (JSON, default `'{}'`), snapshot_updated_at?, thumbnail_path?, created_at, updated_at | UNIQUE(room_name); INDEX(meeting_id); INDEX(owner_id) |
| **workspace_participants** | id, workspace_id FK(workspaces CASCADE), user_id FK(users CASCADE), role ('owner'\|'editor'\|'viewer' — default 'editor'), joined_at, last_seen_at? | UNIQUE(workspace_id, user_id) |
| **workspace_ops** | id (AUTOINCREMENT, monotonic), workspace_id FK(workspaces CASCADE), user_id FK(users CASCADE), client_op_id, base_version, payload TEXT (JSON-encoded WorkspaceOp), created_at | UNIQUE(workspace_id, client_op_id); INDEX(workspace_id, id) |
| **workspace_chat_messages** | id, workspace_id FK(workspaces CASCADE), user_id FK(users CASCADE), role ('user'\|'assistant'\|'system'), content, attachments? (JSON), created_at | INDEX(workspace_id, created_at) |
| **workspace_assets** | id, workspace_id FK(workspaces CASCADE), kind ('upload'\|'ai'), file_path, mime, width?, height?, uploaded_by FK(users CASCADE) NULL, created_at | INDEX(workspace_id) |

Schema declared in [src/lib/db/schema.ts](./src/lib/db/schema.ts); runtime `CREATE TABLE IF NOT EXISTS` in [src/lib/db/index.ts](./src/lib/db/index.ts). All cascades match the meetings module pattern.

### Workspaces Service Layer ([`src/lib/workspaces/`](./src/lib/workspaces/))

| File | Description |
|------|-------------|
| [workspaces.ts](./src/lib/workspaces/workspaces.ts) | CRUD + snapshot/op-log helpers. `createWorkspace({ownerId, title, meetingId?})` (atomic in `db.transaction`: inserts `workspaces` row with fresh `randomUUID()` `roomName` + owner participant pivot). `getWorkspace(id)`, `getWorkspaceDetail(id)` (joined participants + display names), `listWorkspacesForUser(userId)` (owned ∪ participant, newest first), `listWorkspacesForMeeting(meetingId)`. `updateWorkspace(id, { title?, meetingId? })`, `deleteWorkspace(id)` (CASCADE-driven). Participant helpers: `addParticipant`/`removeParticipant` (refuses owner) / `markParticipantSeen`. Snapshot helpers: `getSnapshot(id) → {version, payload, updatedAt}`, `saveSnapshot(id, version, payload)` (atomic UPDATE + truncate `workspace_ops` WHERE id ≤ version + JSON validation). Op-log: `appendOp({workspaceId, userId, clientOpId, baseVersion, op})` — idempotent on UNIQUE(workspaceId, clientOpId), returns `{ ...row, deduped: boolean }`. `listOpsSince(workspaceId, sinceVersion)` returns ops with id > since in append order (parses payload). `getOpRow(id)` for tests |
| [access.ts](./src/lib/workspaces/access.ts) | `isOwner(userId, workspaceId)` — compares `workspaces.ownerId`. `canJoinWorkspace(userId, workspaceId)` — true when owner, listed participant, or `users.isAdmin = true`. `canEditWorkspace(userId, workspaceId)` — owner or role ∈ {owner, editor} (admin override). `getRole(userId, workspaceId) → 'owner'\|'editor'\|'viewer'\|null`. `addParticipants(workspaceId, userIds[], role='editor')` → `{added, alreadyPresent}` (idempotent). `removeParticipant(workspaceId, userId)` (throws on owner). `listParticipants(workspaceId) → WorkspaceParticipantWithUser[]` (joined `users` for display name + email, ordered by joinedAt asc) |
| [ops.ts](./src/lib/workspaces/ops.ts) | Pure reducer. `WorkspaceState = { elements: Record<id, Element> }`. `applyOp(state, op, now?) → state` — switch by `op.type` (add/update/transform/delete/z) with LWW conflict resolution by per-element `updatedAt`; reference-stable when no-op; `update`/`delete`/`z`/`transform` against missing id are no-ops. `replayOps(base, ops, now?)` folds in append order. `buildSnapshot(elements: Map\|Record) → WorkspaceSnapshot`. `parseSnapshotPayload(json)` lenient (returns empty state on bad JSON). `emptyState()` / `fromSnapshot(s)` / `toSnapshot(state)` helpers |
| [ai.ts](./src/lib/workspaces/ai.ts) | Workspace-domain AI helpers. `generateElementCommands({instruction, currentElements?, userId, baseVersion, model?}) → {text, commands: WorkspaceOp[]}` — calls `generateStructured` with a discriminated-union schema (rect/ellipse/line/arrow/text/sticky/table) and intent-detection system prompt; converts each AI element into an `add` op with fresh `randomUUID()` ids. Caps context at 50 elements (formatted as `kind @ (x,y) [WxH] "snippet"` lines). `editElementWithAI({element, instruction, model?}) → {patch: Partial<Element>, explanation}` — system prompt forbids id/kind/createdBy/updatedAt mutations; whitelist filters returned patch keys (`x/y/w/h/rot/z/style/content/fontSize/color/rows/cols/cells/points`). `generateImage({prompt, model?}) → {buffer: Buffer, mime, width, height}` — calls `google/gemini-2.5-flash-image-preview` via OpenRouter (`modalities: ['image', 'text']`), parses data URL from `message.images[0].image_url.url` OR `message.content` (string/array), decodes base64. Models: text=`x-ai/grok-4.1-fast`, image=`google/gemini-2.5-flash-image-preview`. Throws `AIError` on missing API key, transport errors, decode failures |
| [assets.ts](./src/lib/workspaces/assets.ts) | Asset persistence + serving. `saveAsset({workspaceId, buffer, mime, uploadedBy, kind, fileName?, width?, height?}) → WorkspaceAsset` — sharp-probes dimensions when not provided, MIME whitelist (PNG/JPEG/WebP/GIF), 25 MiB cap, writes to `data/workspace-assets/<workspaceId>/<uuid>_<safeName>` then INSERTs (file-first so a failed insert doesn't leak DB rows; cleanup on insert failure). Path containment guard against `..`. `getAsset(assetId)`, `listAssets(workspaceId)` (newest first), `assetBelongsToWorkspace(assetId, workspaceId)`. `readAssetFile(assetId) → {buffer, mime, width, height, fileName, asset} \| null` — returns null on missing row OR missing file (ENOENT). Storage root override: `WORKSPACE_ASSETS_DIR` env var. Exports `ALLOWED_ASSET_MIMES` and `MAX_ASSET_BYTES` constants for the route layer |

### Workspaces API ([`src/app/api/workspaces/`](./src/app/api/workspaces/))

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/workspaces` | GET | `requireAuth`; returns `{ data: Workspace[] }` from `listWorkspacesForUser(userId)` |
| `/api/workspaces` | POST | `requireAuth`; body `{ title: string (1..200), meetingId?: number\|null }`; creates workspace, caller becomes owner; 201 `{ data: Workspace }` |
| `/api/workspaces/[id]` | GET | `requireAuth` + `canJoinWorkspace` (403). Returns `{ data: WorkspaceDetail }` (workspace + participants[] with `userName`). 404 if missing |
| `/api/workspaces/[id]` | PATCH | `requireAuth` + `isOwner` (admins also allowed) else 403. Body `{ title?, meetingId? }`. Returns `{ data: Workspace }` |
| `/api/workspaces/[id]` | DELETE | `requireAuth` + `isOwner` (admins also allowed) else 403. Hard-delete (CASCADE drops participants/ops/chat/assets). Returns `{ data: { removed: true } }` |
| `/api/workspaces/[id]/token` | POST | `requireAuth` + `canJoinWorkspace` (403). Resolves display name from `users.firstName/lastName` (falls back to email). For non-owners runs `addParticipants` with role derived from `canEditWorkspace` (admin viewers land as viewer). Touches `last_seen_at`. Mints LiveKit JWT via `issueLiveKitToken` with `canPublishData` for ops/cursor channels (owner additionally gets `roomAdmin`/`roomRecord`). Returns `{ data: { token, url, roomName } }` (`url` prefers `NEXT_PUBLIC_LIVEKIT_URL`) |
| `/api/workspaces/[id]/snapshot` | GET | `requireAuth` + `canJoinWorkspace`. Returns `{ data: { version, payload, updatedAt } }` with `payload` already JSON-parsed. Returns `{ version: 0, payload: { elements: {} } }` for fresh workspaces; gracefully returns empty board on malformed payload rather than 500 |
| `/api/workspaces/[id]/snapshot` | POST | `requireAuth` + `canEditWorkspace` (403). Body `{ version: number≥0, payload: object\|string }`. Atomically writes snapshot AND truncates `workspace_ops` where id ≤ version. Returns `{ data: { version, payload, updatedAt } }` |
| `/api/workspaces/[id]/ops` | GET | `requireAuth` + `canJoinWorkspace`. Query `since` (≥0, default 0). Returns `{ data: { ops: Array<{id, userId, clientOpId, baseVersion, op, createdAt}>, maxId } }` — ops with id > since in append order; `maxId` advances client cursor without scanning |
| `/api/workspaces/[id]/ops` | POST | `requireAuth` + `canEditWorkspace`. Body `{ ops: Array<{ clientOpId, baseVersion, op: WorkspaceOp }> }`, max 200/batch. Persists each via `appendOp` (idempotent on `clientOpId`). Returns 201 `{ data: { acks: Array<{ clientOpId, serverId, createdAt, deduped }> } }` preserving order |
| `/api/workspaces/[id]/participants` | GET | `requireAuth` + `canJoinWorkspace`. Returns `{ data: WorkspaceParticipantWithUser[] }` |
| `/api/workspaces/[id]/participants` | POST | `requireAuth` + `isOwner` (admin allowed). Body `{ userIds: number[], role?: 'editor'\|'viewer' }`. Returns 201 `{ data: { added, alreadyPresent } }` |
| `/api/workspaces/[id]/participants/[userId]` | DELETE | `requireAuth` + `isOwner` (admin allowed). Refuses owner removal (400). Returns `{ data: { removed: true } }` |
| `/api/workspaces/[id]/chat` | GET | `requireAuth` + `canJoinWorkspace`. Cursor-paginated newest-first by `createdAt` (`?limit=1..100`, default 50; `?before=<iso>`). Returns `{ items: WorkspaceChatMessage[], nextBefore: string\|null }` |
| `/api/workspaces/[id]/chat` | POST | `requireAuth` + `canJoinWorkspace`. 503 if `OPENROUTER_API_KEY` missing. Body `{ content: string (1..4000) }`. Persists user message, then streams an SSE-style response (`Content-Type: text/event-stream`) with typed frames `data: {...}\n\n`: `{type:'chunk', text}` per assistant token, optional `{type:'commands', commands: WorkspaceOp[]}` after the text stream when intent detector matched (Russian keywords нарисуй/создай/добавь/таблиц/диаграмм/схем/канбан…), `{type:'commands_error', message}` if structured generation failed, terminal `{type:'done'}` or `{type:'error', message}`. Persists assistant message with `attachments=JSON.stringify({commands})` when commands were emitted |
| `/api/workspaces/[id]/ai/element` | POST | `requireAuth` + `canEditWorkspace`. 503 if `OPENROUTER_API_KEY` missing. Body `{ elementId: string, instruction: string (1..2000), element: Element }` — server validates `element.id === elementId`. Calls `editElementWithAI(element, instruction)` → returns `{ data: { patch: Partial<Element>, explanation: string } }`. Whitelisted patch keys only — `id/kind/createdBy/updatedAt` cannot be touched. 429 on rate limit, 502 on AI errors |
| `/api/workspaces/[id]/ai/image` | POST | `requireAuth` + `canEditWorkspace`. 503 if API key missing. `maxDuration: 60` seconds. Body `{ prompt: string (1..2000) }`. Calls `generateImage(prompt)` (`google/gemini-2.5-flash-image-preview`) → bytes → `saveAsset({kind: 'ai', uploadedBy: null})`. Returns `201 { data: { assetId, mime, width, height, createdAt } }`. The route does NOT auto-create a canvas element — the client commits the `add` op |
| `/api/workspaces/[id]/assets/upload` | POST | `requireAuth` + `canEditWorkspace`. multipart/form-data with required `file` field. 25 MiB cap, MIME whitelist (PNG/JPEG/WebP/GIF). Server-side sharp probe before write. Returns `201 { data: { assetId, mime, width, height, createdAt } }` |
| `/api/workspaces/[id]/assets/[assetId]` | GET | `requireAuth` + `canJoinWorkspace` + cross-workspace ownership check (asset.workspaceId === id, else 404). Streams raw bytes with `Content-Type: <asset.mime>`, `Cache-Control: private, max-age=86400, immutable`, inline `Content-Disposition`. Defensive path containment guard before `fs.readFile` |
| `/api/workspaces/[id]/attach-meeting` | POST | `requireAuth` + `canEditWorkspace` + `canJoinMeeting` (caller must be participant of the target meeting). Body `{ meetingId: number }`. Calls `updateWorkspace(id, { meetingId })`. Returns `{ data: Workspace }` |
| `/api/workspaces/[id]/attach-meeting` | DELETE | `requireAuth` + `canEditWorkspace`. Sets `workspaces.meetingId = null`. Returns `{ data: Workspace }` |
| `/api/meetings/[id]/workspaces` | GET | `requireAuth` + `canJoinMeeting`. Returns `{ data: Workspace[] }` from `listWorkspacesForMeeting(meetingId)`. Used by `MeetingWorkspacesPanel` |
| `/api/meetings/[id]/workspaces` | POST | `requireAuth` + `canJoinMeeting`. Body `{ title: string (1..200) }`. Single round-trip: creates workspace already attached to the meeting (caller becomes owner). 201 `{ data: Workspace }` |

Route files: [`route.ts`](./src/app/api/workspaces/route.ts), [`[id]/route.ts`](./src/app/api/workspaces/[id]/route.ts), [`[id]/token/route.ts`](./src/app/api/workspaces/[id]/token/route.ts), [`[id]/snapshot/route.ts`](./src/app/api/workspaces/[id]/snapshot/route.ts), [`[id]/ops/route.ts`](./src/app/api/workspaces/[id]/ops/route.ts), [`[id]/participants/route.ts`](./src/app/api/workspaces/[id]/participants/route.ts), [`[id]/participants/[userId]/route.ts`](./src/app/api/workspaces/[id]/participants/[userId]/route.ts), [`[id]/chat/route.ts`](./src/app/api/workspaces/[id]/chat/route.ts), [`[id]/ai/element/route.ts`](./src/app/api/workspaces/[id]/ai/element/route.ts), [`[id]/ai/image/route.ts`](./src/app/api/workspaces/[id]/ai/image/route.ts), [`[id]/assets/upload/route.ts`](./src/app/api/workspaces/[id]/assets/upload/route.ts), [`[id]/assets/[assetId]/route.ts`](./src/app/api/workspaces/[id]/assets/[assetId]/route.ts), [`[id]/attach-meeting/route.ts`](./src/app/api/workspaces/[id]/attach-meeting/route.ts), [`/api/meetings/[id]/workspaces/route.ts`](./src/app/api/meetings/[id]/workspaces/route.ts).

### Workspaces Frontend State

| File | Description |
|------|-------------|
| [src/stores/workspaceStore.ts](./src/stores/workspaceStore.ts) | Zustand store (in-memory, no persist). State: `elements: Record<id, Element>`, `selection: Set<string>` (Phase 1 single-select; Set ready for multi), `viewport: {x, y, zoom}`, `tool: WorkspaceTool` ('select'\|'rect'\|'ellipse'\|'line'\|'arrow'\|'text'\|'sticky'\|'pen'), `styleDefaults` ({stroke, fill, strokeWidth, opacity, fontSize}), `presence: Record<identity, PresenceEntry>`, `currentVersion`, `snapshotVersion`, `pendingOps: Record<clientOpId, PendingOp>`, `isLoading`. Actions: `applyOpLocal(op, opts?)` (uses `lib/workspaces/ops.applyOp` reducer; auto-strips deleted ids from selection), `replaceElements(elements, version, snapshotVersion?)`, `markOpAcked(clientOpId, serverId?)`, `setCurrentVersion`, `setSnapshotVersion`, `selectElement`/`toggleSelectElement`/`clearSelection`, `setTool`, `setStyleDefault`, `setViewport`/`pan`/`zoomBy(factor, anchorWorld?)` (zoom-about-anchor math), `setPresence`/`removePresence`/`prunePresence(cutoffMs)`, `setLoading`, `reset`. Selector hooks: `useWorkspaceTool`, `useWorkspaceViewport`, `useWorkspaceStyleDefaults`, `useWorkspaceSelection`, `useWorkspaceElements`, `useWorkspacePresence`, `useSelectedElement` (returns single element or null). Constants: `TOOL_TO_KIND` map. Helpers: `hydrateFromSnapshot(payload)` |

### Workspaces Frontend Hooks

| File | Description |
|------|-------------|
| [src/hooks/useWorkspace.ts](./src/hooks/useWorkspace.ts) | TanStack Query hooks: `useWorkspaces` (queryKey `['workspaces']`), `useWorkspace(id)` (queryKey `['workspaces', id]`), `useCreateWorkspace`, `useUpdateWorkspace(id)`, `useDeleteWorkspace`, `useWorkspaceToken(id)` (mutation, returns `{token, url, roomName}`), `useWorkspaceParticipants(id)` (queryKey `['workspaces', id, 'participants']`), `useAddWorkspaceParticipants(id)`, `useRemoveWorkspaceParticipant(id)`. Mutations invalidate the appropriate query keys |
| [src/hooks/useWorkspaceRoom.ts](./src/hooks/useWorkspaceRoom.ts) | Owns the LiveKit `Room` lifecycle for a workspace. Inputs `{token, url, userId, userName?}`. Connects with `autoSubscribe:false` (no media tracks in workspaces). Listens to `RoomEvent.Connected`/`Disconnected`/`ConnectionStateChanged`/`ParticipantConnected`/`ParticipantDisconnected` and seeds `workspaceStore.presence` (placeholder cursor at 0,0 with `colourForIdentity` colour) on join. Returns `{room, isConnected, connectionState, error, reconnect}`. Exports `colourForIdentity(identity)` — deterministic FNV-1a hash → HSL hue |
| [src/hooks/useWorkspaceOps.ts](./src/hooks/useWorkspaceOps.ts) | Realtime op channel. Inputs `{workspaceId, room, userId}`. Returns `{commitOp(input: WorkspaceOpInput), flushPending()}`. `commitOp` generates `opId` (uuid) + `v` (currentVersion), throttles `transform` ops to 30 Hz per element (intermediate transforms apply locally only; only the leading edge is published), optimistically applies via `applyOpLocal` with `pending: true`, publishes to `useLiveKitData<WorkspaceOp>(room, 'workspace.ops', reliable=true)`, queues for REST batch (50ms debounce, max 10 ops/batch). On ack: `markOpAcked(clientOpId, serverId)`. On 5xx: exponential backoff retry (250→500→1000→2000→4000 ms). On 4xx: drop + warn. Subscribe path: filters our own echoes by participant.identity + pendingOps lookup. `flushPending` drains the queue (used on unmount). Exports `WorkspaceOpInput` distributive Omit type |
| [src/hooks/useWorkspacePresence.ts](./src/hooks/useWorkspacePresence.ts) | Cursor presence over `useLiveKitData<CursorPresence>(room, 'workspace.cursor', reliable=false)`. Inputs `{room, currentUserId, currentUserName?}`. Returns `{broadcastCursor(x, y), myColor}`. Trailing-edge throttle to 20 Hz (50ms window); guarantees the resting position is always sent. Inbound: clamps coords to [0..1], filters our own echo, writes to `workspaceStore.setPresence`. Periodic 1s pruning of entries older than 5s via `prunePresence`. Cleans up on unmount and removes own presence row |
| [src/hooks/useWorkspaceChat.ts](./src/hooks/useWorkspaceChat.ts) | LLM chat client. Inputs `{workspaceId}`. Returns `{messages: ChatMessage[], isLoadingInitial, isLoadingMore, hasMore, isStreaming, error, loadEarlier, sendMessage(content), refresh, markCommandsApplied(id), markCommandsRejected(id)}`. `ChatMessage` extends `WorkspaceChatMessage` with parsed `commands?: WorkspaceOp[]` (from `attachments` JSON) plus per-session UI flags `commandsApplied`/`commandsRejected`. Cursor-paginated history via GET `/chat?limit&before`. `sendMessage` POSTs `/chat`, parses SSE-style `data: {...}\n\n` frames into typed events (`chunk` → typewriter into the optimistic assistant bubble; `commands` → attaches WorkspaceOp[] inline before the GET refetch; `commands_error`/`error` → surfaced via `error`). On stream close calls `refresh` to swap optimistic rows with canonical persisted ones (preserving local UI flags) |
| [src/hooks/useWorkspaceAssets.ts](./src/hooks/useWorkspaceAssets.ts) | Asset upload + AI-image generation. `useUploadAsset(workspaceId) → {upload(file), isLoading, error}` POSTs multipart to `/assets/upload`. `useGenerateImage(workspaceId) → {generate(prompt), isLoading, error}` POSTs JSON to `/ai/image`. Both return `{assetId, mime, width, height, createdAt}` on success. No TanStack Query wrapping (one-shot mutations) — callers track their own UI state |
| [src/hooks/useWorkspaceSnapshot.ts](./src/hooks/useWorkspaceSnapshot.ts) | Periodic snapshot writer. Inputs `{workspaceId, room, userId, ownerId}`. Single-leader election: owner if present in the room, else lowest LiveKit identity (deterministic, no extra coordination). Subscribes to `workspaceStore` and arms a 30 s debounce timer on each `currentVersion` bump (each accepted op resets it). Hard rate-limit of one save per 5 s. Skips while `pendingOps` non-empty (waits for stable cursor). On fire: POSTs `/snapshot { version: currentVersion, payload: buildSnapshot(elements) }` and bumps `snapshotVersion`. Best-effort final save on unmount + `beforeunload`. Exposes `triggerSaveNow()` for tests |

### Workspaces UI Components ([`src/components/workspaces/`](./src/components/workspaces/))

| File | Description |
|------|-------------|
| [WorkspaceRoom.tsx](./src/components/workspaces/WorkspaceRoom.tsx) | Top-level composer. Props `{workspaceId, userId, userName?, isOwner, ownerId?, attachedMeetingId?, onAttachedMeetingChange?, token, url, onInvite?}`. Wires `useWorkspaceRoom` + `useWorkspaceOps` + `useWorkspacePresence` + `useWorkspaceSnapshot`. Bootstrap: `GET /snapshot` → `replaceElements(payload, snapshotVersion, snapshotVersion)` → `GET /ops?since=<snapshotVersion>` → fold `applyOpLocal` per item → `setCurrentVersion(maxId)`. Reconnect catch-up: on transition to `ConnectionState.Connected` (after initial bootstrap) re-issues `GET /ops?since=<currentVersion>` and folds new ops. Drains `pendingOps` on unmount via `flushPending`. Owns `ctxMenu` + `aiEdit` state for `ElementContextMenu` + `AIEditDialog`; menu items dispatch through `commitOp` (duplicate clones with fresh uuid + offset, delete emits delete op, bring-front/send-back compute new z from current elements). `onApplyAIPatch` commits an `update` op with bumped `updatedAt`. `WorkspaceToolbar` is supplied `onInsertTable` (drops a 3×3 table at viewport center) and `onImageReady` (commits an `image` add op centred in the viewport with aspect ratio). `WorkspaceSidebar.onApplyCommands` iterates each command through `commitOp`. Layout: canvas pane on left (with `WorkspaceCanvas` + `SelectionLayer` (with `onElementContextMenu`) + `CursorsLayer` overlays + floating top-center `WorkspaceToolbar` + `StyleBar`); right `WorkspaceSidebar` (hidden on mobile). `ElementContextMenu` + `AIEditDialog` rendered at the end (portal-based) |
| [Canvas/WorkspaceCanvas.tsx](./src/components/workspaces/Canvas/WorkspaceCanvas.tsx) | HTML5 canvas surface. Props `{userId, onCommit, onPointerMove?, workspaceId?, children}`. HiDPI scaling via `devicePixelRatio`. Render loop driven by rAF with `isDirtyRef` flag — pulls fresh state from `workspaceStore` imperatively via `subscribe` (no React rerender per frame). `setTransform(zoom*dpr, …, -viewport.x*z*dpr, -viewport.y*z*dpr)` composes pan/zoom/dpr in one shot. Calls `drawElements(sortedByZ, renderCtx)` with `RenderContext { ctx, viewportZoom, isSelected, workspaceId, requestRedraw }`; `requestRedraw` flips `isDirtyRef` so async image loads trigger a re-paint without React. In-progress draw preview rendered on top from `inProgressElRef`. Pan: middle-mouse OR space+left-drag. Zoom: Ctrl/Cmd+wheel zooms about cursor (delegates to `workspaceStore.zoomBy(factor, anchorWorld)`); plain wheel pans. Element creation: pointerdown with non-select tool seeds a `DrawState`, pointermove updates `inProgressElRef` (freehand accumulates relative points; on commit re-normalises to [0..1] of bbox), pointerup commits an `add` op (skips zero-area shapes for non-text/sticky). Keyboard: Esc clears selection + sets tool to 'select'; Delete/Backspace emits `delete` op for the current selection. Exports `worldToScreen`/`screenToWorld` and `WorkspaceOpDraft` distributive Omit |
| [Canvas/ElementRenderer.tsx](./src/components/workspaces/Canvas/ElementRenderer.tsx) | Imperative per-kind canvas drawing. `RenderContext { ctx, viewportZoom, isSelected, workspaceId?, requestRedraw? }`. `drawElements(elements, rctx)` iterates; `drawElement` switches by `kind`. Per-kind: rect (stroke+fill), ellipse, line, arrow (line + scaled triangle head), text (multi-line by `\n`, fontSize-scaled font), sticky (drop shadow + colored bg + text), freehand (polyline through normalised `points * (w,h)`), image (`getImageForAsset(workspaceId, assetId, requestRedraw)` lookup against module-level `imageCache: Map<wid:assetId, {state, img, subscribers}>` — fetches via `<img src='/api/workspaces/<wid>/assets/<assetId>'>`, draws once loaded, placeholder rect with "Загрузка…" / red error variant otherwise; cache survives across canvas remounts), table (tinted header row, bold header text, padded cell text scaled to row height with `fillText` max-width clipping). Each kind: applies opacity via `globalAlpha`, scales `lineWidth` to keep visual stroke ≥1 device px across zoom, applies optional rotation via `save()`/`translate`/`rotate`/`translate`/`restore`, and draws the selection outline (dashed blue rect) when `isSelected(id)`. Exports `getImageForAsset` and `__resetImageCacheForTests` |
| [Canvas/SelectionLayer.tsx](./src/components/workspaces/Canvas/SelectionLayer.tsx) | Transparent DOM overlay. Props `{onCommit, onElementContextMenu?}`. Pointer events only intercepted when `tool === 'select'`. Hit-test by z desc (bbox; lines/arrows padded 6/zoom px). Owns the 8 resize handles (corners + edge midpoints). Drag-to-move emits `transform` ops (throttled by `useWorkspaceOps` to 30 Hz); resize maps the dragged handle to a new bbox via `applyHandleResize` (clamped at 4 px). On pointerup emits a final reliable `update` op with the resting bbox. Double-click on text/sticky/table element opens an inline editor (`InlineEditor` for text/sticky positioned `<textarea>`, `TableEditor` for table — HTML `<table>` with per-cell `<input>` overlay) — commit on blur emits `update` op with new `content`/`cells`; Esc cancels. Right-click while in select mode preventDefaults the native menu, performs hit-test, selects the hit element and forwards (element, clientX, clientY) to `onElementContextMenu` |
| [Canvas/TableEditor.tsx](./src/components/workspaces/Canvas/TableEditor.tsx) | HTML `<table contenteditable>` overlay positioned over a canvas-rendered `TableElement` via `worldToScreen` + `viewport.zoom`. Per-cell `<input>` (header row uses bold font + tinted background to match the canvas paint); native browser Tab/Shift-Tab navigation. `onCommit(cells)` fires on first blur with the full edited 2D matrix; `onCancel` (Esc) skips commit. Click outside the overlay also commits via blur cycle. `committedRef` guards against double-commits |
| [Canvas/InProgressOverlay.tsx](./src/components/workspaces/Canvas/InProgressOverlay.tsx) | Phase 1 placeholder pass-through wrapper. The in-progress draw preview is rendered directly on the main canvas in `WorkspaceCanvas`. Phase 3 will hoist it to a separate layer for marquee/snapping guides |
| [Canvas/CursorsLayer.tsx](./src/components/workspaces/Canvas/CursorsLayer.tsx) | Remote cursors overlay. Props `{currentUserId}`. Reads `workspaceStore.presence`, filters out local user. One absolutely-positioned `<div>` per remote cursor with an SVG arrow (filled with `entry.color`) + name label. Smooth motion via per-cursor lerp (factor 0.3) updating `transform: translate(x,y)` directly on DOM (no React rerender per frame); rAF loop pulls latest target from presence and steps each cursor toward it |
| [Toolbar/WorkspaceToolbar.tsx](./src/components/workspaces/Toolbar/WorkspaceToolbar.tsx) | Floating top-center toolbar. Bound to `workspaceStore.tool`. 8 tool buttons (Select/Rect/Ellipse/Line/Arrow/Text/Sticky/Pen) with inline SVG icons and keyboard shortcuts V/R/O/L/A/T/S/P (skipped when focus is in editable element or modifier keys held). Active button highlights from `tool === button.tool`. Phase 2 actions (right of a divider): "Вставить таблицу" (calls `onInsertTable`), "Загрузить изображение" (file input → `useUploadAsset` → `onImageReady`), "AI: сгенерировать картинку" (toggleable inline panel with prompt textarea → `useGenerateImage` → `onImageReady`). Image actions hidden when `workspaceId` or `onImageReady` not supplied |
| [Toolbar/StyleBar.tsx](./src/components/workspaces/Toolbar/StyleBar.tsx) | Style editor for the single selected element. Renders nothing when no single selection. Props `{onCommit}`. Stroke palette (9 colours), fill palette (transparent + 9 colours, only for rect/ellipse), strokeWidth slider 1..10, opacity slider 0..100%, fontSize number input (text only), sticky background colour swatches (sticky only). Each change emits an `update` op with merged `style` patch (or per-kind field for fontSize/color) |
| [ContextMenu/ElementContextMenu.tsx](./src/components/workspaces/ContextMenu/ElementContextMenu.tsx) | Floating right-click menu rendered via `createPortal(document.body)` so it escapes canvas overflow. Props `{open, x, y, element, items?, onClose, onSelect}`. Default items: AI: изменить, Дублировать, Удалить, На передний план, На задний план. Click-outside via global `pointerdown` capture; Escape via `keydown`. Position clamped to viewport so the menu never spills past the right/bottom edge |
| [ContextMenu/AIEditDialog.tsx](./src/components/workspaces/ContextMenu/AIEditDialog.tsx) | Per-element AI edit modal. Props `{open, workspaceId, element, onApplyPatch, onClose}`. Centered dialog with a textarea (1..2000 chars), collapsible JSON preview of the element, loading state (disables inputs), inline error surface. Cmd/Ctrl+Enter submits. Submit POSTs `{elementId, instruction, element}` to `/api/workspaces/[id]/ai/element` and forwards the returned `patch` + `explanation` to `onApplyPatch` |
| [Sidebar/WorkspaceSidebar.tsx](./src/components/workspaces/Sidebar/WorkspaceSidebar.tsx) | Right-hand sidebar (320 px). Top section (visible to participants when attached, owner always): `AttachedMeetingPanel`. Below: tab strip switches between Participants and AI Чат. Active tab persisted to `localStorage['taskhub.workspace-room.sidebar-tab']`. Forwards `onApplyCommands` to `AIChatPanel` |
| [Sidebar/ParticipantsPanel.tsx](./src/components/workspaces/Sidebar/ParticipantsPanel.tsx) | Participants tab. Props `{workspaceId, isOwner, currentUserId, onInvite?}`. Fuses `useWorkspaceParticipants` rows with `workspaceStore.presence` for an online dot (green when LiveKit-present). Owner sees "Пригласить" button (calls `onInvite`) and ×-remove on every non-owner row (wired to `useRemoveWorkspaceParticipant`) |
| [Sidebar/AIChatPanel.tsx](./src/components/workspaces/Sidebar/AIChatPanel.tsx) | AI Чат tab. Uses `useWorkspaceChat`. Renders bubbles (user right-aligned primary, assistant left-aligned outline). Streaming partial assistant text shows with a pulsing `…` placeholder while empty. Auto-scroll if user near bottom (80 px threshold). "Показать раньше" preserves scroll position. Textarea: Enter sends, Shift+Enter newline, disabled while `isStreaming`. When an assistant message carries a `commands` block, renders a card below the bubble — `AI предлагает добавить N элементов: rect ×2, text` — with "Применить" (calls `onApplyCommands(commands)` then `markCommandsApplied`) and "Отклонить" (`markCommandsRejected`). After apply/reject the card shows a status badge instead of the buttons |
| [Sidebar/AttachedMeetingPanel.tsx](./src/components/workspaces/Sidebar/AttachedMeetingPanel.tsx) | Workspace ↔ meeting binding. Props `{workspaceId, meetingId, isOwner, onChanged?}`. When attached: shows meeting title (resolved via `useMeetingDetail`) as a Link to `/meetings/<id>` + "Открепить" for owner (DELETE `/attach-meeting`). When detached + owner: collapsible "Привязать к встрече" with a `<select>` listing the user's meetings (`useMeetings`, sorted newest first) + Submit (POST `/attach-meeting`). When detached + non-owner: renders nothing |
| [CreateWorkspaceModal.tsx](./src/components/workspaces/CreateWorkspaceModal.tsx) | Modal for new workspace creation. Phase 1: title-only form (1..200). Calls `useCreateWorkspace`. On success calls `onCreated(ws)` (page navigates to `/workspaces/<id>`) |
| [InviteParticipantsModal.tsx](./src/components/workspaces/InviteParticipantsModal.tsx) | Owner-only invite modal. Pattern lifted from meetings variant. Reuses `/api/meetings/invitable-users` (same audience). Multi-select checkboxes + role radio (editor/viewer) → `useAddWorkspaceParticipants` |

### Workspaces Pages ([`src/app/(dashboard)/workspaces/`](./src/app/(dashboard)/workspaces/))

Route protection: middleware does not currently include `/workspaces` in `PROTECTED_PREFIXES` — auth is enforced at the API layer (`requireAuth` + `canJoinWorkspace`/`isOwner` per route). The dashboard layout is itself behind the auth gate.

| File | Description |
|------|-------------|
| [page.tsx](./src/app/(dashboard)/workspaces/page.tsx) | `/workspaces` — list + create. Uses `useWorkspaces`, renders grid of cards (title, createdAt, updatedAt, "Открыть" + "Удалить"); delete uses `useDeleteWorkspace` with `window.confirm`. Header "Новая доска" opens `CreateWorkspaceModal`. EmptyState/Skeleton/error states |
| [[id]/page.tsx](./src/app/(dashboard)/workspaces/[id]/page.tsx) | `/workspaces/[id]` — room page. Resolves current user via `/api/auth/me`, loads workspace via `useWorkspace`, mints LiveKit token via `useWorkspaceToken`. `isOwner = ownerId === userId \|\| user.isAdmin`. Renders header with title + back link, then `<WorkspaceRoom workspaceId userId userName isOwner ownerId attachedMeetingId={detail.meetingId} onAttachedMeetingChange={() => queryClient.invalidateQueries(['workspaces', wsId])} token url onInvite={() => setInviteOpen(true)} />`. Owns `InviteParticipantsModal` open state |

### Workspaces Wire Format

All ops are msgpackr-encoded over the LiveKit data channel:

- Topic `"workspace.ops"` (reliable): `WorkspaceOp` discriminated union — `add` (new element), `update` (partial element patch), `transform` (lossy intermediate xy/size/rot during drag), `delete` (bulk by ids), `z` (set absolute z-index). Every op carries `opId: string` (UUID for dedup) and `v: number` (snapshotVersion at authoring time).
- Topic `"workspace.cursor"` (lossy): `CursorPresence { x: [0..1], y: [0..1], color: string }`.

Topic constants are exported from [src/types/workspace.ts](./src/types/workspace.ts) as `WORKSPACE_OPS_TOPIC` and `WORKSPACE_CURSOR_TOPIC`.

### Workspaces Navigation

- [src/components/layout/Sidebar.tsx](./src/components/layout/Sidebar.tsx) — `WorkspacesIcon` (inline SVG, board glyph) + `{href: '/workspaces', label: 'Доски'}` entry in `NAV_ITEMS`.

### Workspaces Phase 3 — Polish layer

Phase 3 adds: multi-select + group transform, alignment guides (snapping), local undo/redo, server-side thumbnails, templates + duplicate, comments, snapshot history with rollback, client-side PNG/PDF export, and presenter mode.

#### Phase 3 DB Tables (additions)

| Table | Columns | Indexes |
|-------|---------|---------|
| **workspace_element_comments** | id, workspace_id FK(workspaces CASCADE), element_id, user_id FK(users CASCADE), content, resolved (default 0), created_at, updated_at | INDEX(workspace_id, element_id); INDEX(workspace_id, created_at) |
| **workspace_snapshots_history** | id, workspace_id FK(workspaces CASCADE), version, payload TEXT (JSON), created_by FK(users SET NULL), created_at | INDEX(workspace_id, created_at) |

Schema declared in [src/lib/db/schema.ts](./src/lib/db/schema.ts) and bootstrapped in [src/lib/db/index.ts](./src/lib/db/index.ts).

#### Phase 3 Service Layer ([`src/lib/workspaces/`](./src/lib/workspaces/))

| File | Description |
|------|-------------|
| [snapping.ts](./src/lib/workspaces/snapping.ts) | Pure snap math. `snap(bbox, targets, {threshold, gridStep?}) → {bbox, guides[]}` — magnetic alignment for left/center/right and top/center/bottom edges; optional grid snap; emits `Guide` objects (axis + pos + extents) for the overlay. `snapAgainstElements(bbox, elementsRecord, excludeIds, opts)` filters out moving elements and delegates to `snap` |
| [undo.ts](./src/lib/workspaces/undo.ts) | Pure inverse builder. `buildInverse(op, before)` returns the WorkspaceOp that undoes the supplied op given the pre-mutation snapshot. add↔delete, delete→add, update→reverse-patch, transform→reverse xy/size/rot, z→reverse index. Returns null for impossible inversions |
| [thumbnail.ts](./src/lib/workspaces/thumbnail.ts) | Server-side thumbnail generator. `generateThumbnail(workspaceId)` reads the snapshot, renders an SVG (rect/ellipse/line/arrow/text/sticky/freehand/table/image-placeholder), rasterises to PNG via `sharp` (already a transitive Next.js dep), writes to `data/workspace-thumbnails/<id>.png`, persists `workspaces.thumbnailPath`. `getThumbnailPath(id)` returns the on-disk path with containment guard. Empty workspaces clear the thumbnail |
| [comments.ts](./src/lib/workspaces/comments.ts) | Per-element threaded comments. `createComment`, `listCommentsForElement` (joined with author display name), `getCommentCountsByElement(includeResolved?)` for badges, `setCommentResolved`, `deleteComment`, `getComment`, `listRecentComments(workspaceId, limit)` for the activity tab |
| [history.ts](./src/lib/workspaces/history.ts) | Append-only snapshot history. `recordHistorySnapshot({workspaceId, version, payload, createdBy})` (idempotent on duplicate version), `listHistory(workspaceId)` (newest first, with author), `getHistoryRow(wsId, histId)` (full payload for preview), `countHistory`. Auto-prunes beyond `MAX_HISTORY_PER_WORKSPACE` (30) per workspace on every insert |
| [templates.ts](./src/lib/workspaces/templates.ts) | Built-in workspace templates as code-resident snapshot payloads. `WORKSPACE_TEMPLATES` (Kanban / Retro / Mind-map), `getTemplate(id)`, `instantiateTemplate(template, ownerId)` — remaps element ids to fresh UUIDs and stamps `createdBy`/`updatedAt` |
| [export.ts](./src/lib/workspaces/export.ts) | **Client-side** workspace export. `exportWorkspaceAsPng(workspaceId)` and `exportWorkspaceAsPdf(workspaceId)` render the live `workspaceStore` state into an offscreen `<canvas>` (bbox of all elements + 32 px padding, capped at 8000 px), trigger a browser download. PDF route lazy-imports `pdfmake` + its vfs to keep the initial bundle light |

#### Phase 3 API Routes

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/workspaces` | POST | Phase 3: now also accepts `templateId?: string` (seeds snapshot from a built-in template) OR `duplicateFrom?: number` (copies the source workspace's snapshot). Mutually exclusive — 400 if both supplied. Auth on duplicate source enforced via `canJoinWorkspace` |
| `/api/workspaces/templates` | GET | Returns the built-in template catalogue (id/title/description, payload omitted) |
| `/api/workspaces/[id]/snapshot` | POST | Phase 3 side-effects: also calls `recordHistorySnapshot` (best-effort, swallowed on failure) AND fires `generateThumbnail` (fire-and-forget) so the listing page sees a fresh preview |
| `/api/workspaces/[id]/thumbnail` | GET | `requireAuth` + `canJoinWorkspace`. Streams PNG bytes from `data/workspace-thumbnails/<id>.png`. 404 when no thumbnail yet (clients show placeholder). `Cache-Control: private, max-age=60, must-revalidate` so updates land on next refresh |
| `/api/workspaces/[id]/comments` | GET | `requireAuth` + `canJoinWorkspace`. Query: `elementId` (return thread), `mode=counts` (per-element counts; `includeResolved=1` toggle), default returns recent activity (50 newest) |
| `/api/workspaces/[id]/comments` | POST | `requireAuth` + `canEditWorkspace`. Body `{elementId, content}`. Returns 201 `{data: {comment}}` |
| `/api/workspaces/[id]/comments/[commentId]` | PATCH | `requireAuth`. Body `{resolved: boolean}`. Author OR owner only |
| `/api/workspaces/[id]/comments/[commentId]` | DELETE | `requireAuth`. Author OR owner OR editor only |
| `/api/workspaces/[id]/history` | GET | `requireAuth` + `canJoinWorkspace`. Returns metadata-only listing (id, version, createdAt, createdBy, authorName) — payload omitted |
| `/api/workspaces/[id]/history/[historyId]` | GET | `requireAuth` + `canJoinWorkspace`. Returns the full historic snapshot payload (parsed JSON) for preview |
| `/api/workspaces/[id]/history/[historyId]` | POST | `requireAuth` + `isOwner` (admins are owners). Restores the historic payload by writing it back via `saveSnapshot` (next version = current+1). Triggers a thumbnail rebuild |

Route files: [`templates/route.ts`](./src/app/api/workspaces/templates/route.ts), [`[id]/thumbnail/route.ts`](./src/app/api/workspaces/[id]/thumbnail/route.ts), [`[id]/comments/route.ts`](./src/app/api/workspaces/[id]/comments/route.ts), [`[id]/comments/[commentId]/route.ts`](./src/app/api/workspaces/[id]/comments/[commentId]/route.ts), [`[id]/history/route.ts`](./src/app/api/workspaces/[id]/history/route.ts), [`[id]/history/[historyId]/route.ts`](./src/app/api/workspaces/[id]/history/[historyId]/route.ts).

#### Phase 3 Frontend Hooks

| File | Description |
|------|-------------|
| [src/hooks/useUndoRedo.ts](./src/hooks/useUndoRedo.ts) | Local-session undo/redo. `useUndoRedo({commitOp})` returns `{recordLocal, undo, redo, clear, canUndo, canRedo}`. Captures inverse via `buildInverse` (pure helper from `lib/workspaces/undo`) before applying. Stack capped at 50 entries; any new local op clears the redo stack. Global keyboard bindings: Cmd/Ctrl+Z (undo), Cmd/Ctrl+Shift+Z OR Ctrl+Y (redo). Exports `snapshotElement(id)` and `snapshotElements(ids)` for capturing pre-mutation state from the store |
| [src/hooks/useWorkspacePresenter.ts](./src/hooks/useWorkspacePresenter.ts) | Presenter-follow hook. Topic `workspace.presenter` (lossy, ~5 Hz). `useWorkspacePresenter({room, currentUserId})` returns `{isPresenting, startPresenting, stopPresenting, isFollowing, followingUserId, lastSeenPresenterId, startFollowing, stopFollowing}`. Presenter loop publishes `{presenterId, viewport, ts}`; followers `setViewport(payload.viewport)` on each receive. LWW by `ts`. Followers stop after 5 s without a heartbeat |
| [src/hooks/useWorkspace.ts](./src/hooks/useWorkspace.ts) | Phase 3 additions: `CreateWorkspaceInput` extended with `templateId?` / `duplicateFrom?`. New hook `useWorkspaceTemplates()` (TanStack Query, queryKey `['workspaces', 'templates']`, 60 s stale) backed by `/api/workspaces/templates`. New type `WorkspaceTemplateMeta` |

#### Phase 3 UI Components ([`src/components/workspaces/`](./src/components/workspaces/))

| File | Description |
|------|-------------|
| [Canvas/SelectionLayer.tsx](./src/components/workspaces/Canvas/SelectionLayer.tsx) | **Reworked for Phase 3.** Multi-select + marquee + group transform. Pointer flow: handle → resize; selected element under shift → toggle; in-selection element → group drag; empty → marquee (additive when shift). Calls `snapAgainstElements` during single-element move/resize AND group move; publishes guides via `publishGuides` from `SnapGuides`. Handle resize still single-element. Group bounding box drawn as a dashed blue outline (no resize handles in MVP) |
| [Canvas/SnapGuides.tsx](./src/components/workspaces/Canvas/SnapGuides.tsx) | Transparent overlay drawing pink dashed alignment guide lines. Uses a module-local pub/sub (`publishGuides([])`) so SelectionLayer can publish without React rerenders during drag. SVG lines positioned via `worldToScreen(viewport)` |
| [Toolbar/WorkspaceToolbar.tsx](./src/components/workspaces/Toolbar/WorkspaceToolbar.tsx) | Phase 3 additions: undo/redo buttons (props `onUndo/onRedo/canUndo/canRedo`), snap-to-grid toggle (`snapGridStep` + `onToggleSnapGrid`, defaults to step 16 when enabled), export PNG / PDF buttons (`onExportPng/onExportPdf`). All buttons opt-in via prop presence — toolbar still works without them |
| [Sidebar/WorkspaceSidebar.tsx](./src/components/workspaces/Sidebar/WorkspaceSidebar.tsx) | Phase 3 additions: 4-tab strip (Participants / AI Чат / Комментарии / История). New props `selectedElementId` (forwarded to `CommentsPanel`) and `extras` (slot rendered above tabs — used by `WorkspaceRoom` for `PresenterControls`) |
| [Sidebar/CommentsPanel.tsx](./src/components/workspaces/Sidebar/CommentsPanel.tsx) | Per-element comments tab. When `elementId` is null: shows recent activity card. Otherwise shows the thread + a textarea to add new comments. "Решённые" toggle hides resolved entries. Each comment has Resolve/Reopen + author-only Delete. Refetches after every write |
| [Sidebar/VersionHistoryPanel.tsx](./src/components/workspaces/Sidebar/VersionHistoryPanel.tsx) | Snapshot history tab. Lists rows newest first. Owner-only "Восстановить" button POSTs to `/history/[historyId]` then reloads the page (simplest reliable way to re-bootstrap the canvas + every other connected client) |
| [Sidebar/PresenterControls.tsx](./src/components/workspaces/Sidebar/PresenterControls.tsx) | Sidebar card showing the current presenter mode state. Three states: nothing → "Стать презентером" (+ optional "Следовать за <name>" if someone else is presenting); we are presenting → "Прекратить"; we are following → "Выйти". Resolves presenter display names via `useWorkspaceParticipants` |
| [Comments/CommentIndicators.tsx](./src/components/workspaces/Comments/CommentIndicators.tsx) | Tiny dot overlay on the canvas showing each element's unresolved comment count. Polls `/comments?mode=counts` every 30 s. Click forwards to `onSelect(elementId)` (parent typically opens the comments tab) |
| [CreateWorkspaceModal.tsx](./src/components/workspaces/CreateWorkspaceModal.tsx) | **Reworked for Phase 3.** Source picker: Пустая (default) / Из шаблона (dropdown of `useWorkspaceTemplates`) / Дубликат (dropdown of caller's accessible workspaces). Sends `templateId` or `duplicateFrom` in the create body. Accepts `initialDuplicateFromId` prop so list-row "Дублировать" pre-selects the duplicate path |
| [WorkspaceRoom.tsx](./src/components/workspaces/WorkspaceRoom.tsx) | Phase 3 wiring: wraps `commitOp` to capture pre-mutation snapshots and feed them to `recordLocal` (skips transform-op records to avoid filling history with drag chatter); renders `<SnapGuides />` and `<CommentIndicators />` inside `<WorkspaceCanvas>`; passes undo/redo, snap-grid toggle, export handlers to `WorkspaceToolbar`; passes `selectedElementId` (derived from store selection) and `<PresenterControls extras>` to `WorkspaceSidebar`; clears history stack on workspace switch |

#### Phase 3 Workspaces List Page

- [src/app/(dashboard)/workspaces/page.tsx](./src/app/(dashboard)/workspaces/page.tsx) — Cards now show a server-rendered thumbnail at the top (`/api/workspaces/:id/thumbnail?v=<updatedAt>` cache-busts on snapshot save). New "Дублировать" button per row opens the create modal with the source pre-selected. New action handler `handleDuplicate` + state `duplicateSource` threads the source id through

#### Phase 3 Wire Format Additions

- Topic `"workspace.presenter"` (lossy, ~5 Hz): `PresenterPayload { presenterId: number, viewport: {x, y, zoom}, ts: number }`. LWW by `ts`. Followers stop after 5 s of inactivity. Topic constant exported from [src/hooks/useWorkspacePresenter.ts](./src/hooks/useWorkspacePresenter.ts) as `PRESENTER_TOPIC`
