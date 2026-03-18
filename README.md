<p align="center">
  <img src="public/icons/icon-192x192.png" alt="TaskHub Logo" width="80" height="80" />
</p>

<h1 align="center">TaskHub</h1>

<p align="center">
  <strong>Единый центр управления задачами с нескольких порталов Bitrix24</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-15-black?logo=next.js" alt="Next.js 15" />
  <img src="https://img.shields.io/badge/TypeScript-5-blue?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-38bdf8?logo=tailwindcss" alt="Tailwind CSS 4" />
  <img src="https://img.shields.io/badge/SQLite-via_Drizzle-003B57?logo=sqlite" alt="SQLite" />
  <img src="https://img.shields.io/badge/PWA-ready-5A0FC8?logo=pwa" alt="PWA" />
</p>

---

## Что это?

**TaskHub** — веб-приложение (PWA) для менеджеров и команд, работающих с несколькими порталами Bitrix24 одновременно. Вместо переключения между порталами вы получаете единый интерфейс с полноценным CRUD задач, канбан-стадиями, комментариями, чеклистами, файлами, календарём команды и AI-отчётами.

---

## Возможности

### Задачи
- Просмотр, создание, редактирование и удаление задач на любом подключённом портале
- Фильтрация по порталу, статусу, приоритету, ответственному, датам
- Полнотекстовый поиск по названию задачи
- Управление стадиями канбана (start / complete / move stage)
- Комментарии, чеклисты с прогресс-баром, файлы
- Боковая панель быстрого просмотра задачи (slide-in side panel)

### Календарь
- **Недельный вид** — 7-колоночная сетка с задачами на таймлайне (09:00 — 18:00)
- **Командный день** — колонка на каждого участника, визуализация загрузки команды
- **Поиск свободных слотов** — автоматический подбор времени для встреч (30 мин / 1 ч / 2 ч)
- Индикатор текущего времени, обработка перекрытий задач

### AI-отчёты
- Ежедневные и еженедельные отчёты с аналитикой (Grok 4.1 Fast через OpenRouter)
- AI-чат для вопросов по задачам со стримингом ответов
- Автоматическая пре-генерация отчётов по cron

### Уведомления
- Web Push уведомления (VAPID) о новых задачах, обновлениях, комментариях, упоминаниях
- Распознавание упоминаний `[user=ID]` в комментариях Bitrix24
- Ежедневный дайджест с настраиваемым временем отправки
- Мониторинг просроченных задач

### Мульти-портальность
- Подключение неограниченного числа порталов Bitrix24 через OAuth 2.0
- Цветовая индикация порталов во всём интерфейсе
- Гибкая система доступа: роли (admin / viewer) + гранулярные права (ответственный, соисполнитель, аудитор, постановщик)
- Маппинг пользователей приложения на пользователей Bitrix24

### Безопасность
- JWT-аутентификация (HS256, 7 дней) + HttpOnly cookies
- AES-256-GCM шифрование токенов и credentials в БД
- XSS-защита через `isomorphic-dompurify`
- Rate limiting (логин, вебхуки, AI)
- Security headers (CSP, X-Frame-Options, HSTS)
- Политика сложности паролей

---

## Tech Stack

| Категория | Технология |
|-----------|------------|
| Framework | Next.js 15 (App Router, TypeScript) |
| Стили | Tailwind CSS 4 (`@theme` + CSS tokens) |
| Состояние (клиент) | Zustand (persisted stores) |
| Серверное состояние | TanStack Query |
| База данных | SQLite через better-sqlite3 |
| ORM | Drizzle ORM |
| Аутентификация | JWT (jose) + bcryptjs |
| AI | OpenAI SDK via OpenRouter (Grok 4.1 Fast) |
| Cron | node-cron (через instrumentation.ts) |
| PWA | @ducanh2912/next-pwa |
| Push | web-push (VAPID) |
| Санитизация | isomorphic-dompurify |
| Шрифт | Inter (Google Fonts via next/font) |

---

## Быстрый старт

### Требования

- Node.js >= 20
- npm >= 9

### Установка

```bash
# Клонирование репозитория
git clone <repository-url>
cd manager_tasks_portal_bitrix24

# Установка зависимостей
npm install

# Настройка окружения
cp .env.example .env.local
# Заполните переменные в .env.local
```

### Переменные окружения

```env
# Обязательные
JWT_SECRET=your-secret-key-min-32-chars
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=SecurePassword1

# Bitrix24
NEXT_PUBLIC_APP_URL=https://your-domain.com

# AI (опционально)
OPENROUTER_API_KEY=sk-or-...

# Push-уведомления (опционально)
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:admin@example.com
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...

# Шифрование (обязательно в production)
ENCRYPTION_KEY=<64 hex chars>
```

### Генерация ключей

```bash
# VAPID-ключи для push-уведомлений
npm run vapid:generate

# Ключ шифрования
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Запуск

```bash
# Режим разработки
npm run dev

# Сборка
npm run build

# Production
npm start
```

Приложение будет доступно на `http://localhost:3000`.

---

## Docker-деплой

```bash
# Первый запуск — создаёт .env.production, заполните его, затем повторите
./scripts/deploy-prod.sh

# С кастомным портом
./scripts/deploy-prod.sh --port 8080

# Управление
./scripts/deploy-prod.sh logs       # Логи
./scripts/deploy-prod.sh status     # Статус контейнера
./scripts/deploy-prod.sh restart    # Перезапуск
./scripts/deploy-prod.sh stop       # Остановка
./scripts/deploy-prod.sh backup     # Бэкап SQLite
./scripts/deploy-prod.sh rebuild    # Пересборка
```

---

## Подключение Bitrix24

1. Создайте **серверное приложение** в маркетплейсе Bitrix24 вашего портала
2. Укажите **URL обработчика** и **URL установки** (отображаются на странице `/portals`)
3. На странице **Порталы** введите домен портала, Client ID и Client Secret
4. Нажмите **Подключить** — произойдёт OAuth-авторизация
5. После подключения нажмите **Синхронизировать** для загрузки задач

Вебхуки Bitrix24 (ONTASKADD, ONTASKUPDATE, ONTASKDELETE, ONTASKCOMMENTADD) регистрируются автоматически и обеспечивают обновление данных в реальном времени.

---

## Структура проекта

```
src/
├── app/                  # Next.js App Router (страницы + API)
│   ├── (auth)/           # Страница логина
│   ├── (dashboard)/      # Основной интерфейс
│   │   ├── dashboard/    # Дашборд со статистикой
│   │   ├── tasks/        # Список задач + детальная страница
│   │   ├── calendar/     # Календарь (неделя / команда / слоты)
│   │   ├── portals/      # Управление порталами
│   │   ├── reports/      # AI-отчёты и чат
│   │   ├── settings/     # Настройки профиля и уведомлений
│   │   └── admin/        # Панель администратора
│   └── api/              # REST API endpoints
├── components/           # React-компоненты
│   ├── ui/               # Базовые UI-компоненты (Button, Badge, Avatar...)
│   ├── layout/           # Sidebar, Header, BottomTabs
│   ├── tasks/            # TaskList, TaskDetail, Comments, Checklist...
│   ├── calendar/         # TimeGrid, TaskBlock, WeeklyView, TeamDayView...
│   ├── reports/          # ReportSummary, ReportChat
│   └── ...               # notifications, portals, admin, settings
├── lib/                  # Серверная бизнес-логика
│   ├── bitrix/           # Bitrix24 API клиент, OAuth, синхронизация
│   ├── db/               # SQLite + Drizzle ORM (схема, миграции, seed)
│   ├── auth/             # JWT, пароли, guards
│   ├── ai/               # OpenRouter клиент, отчёты, чат
│   ├── notifications/    # Push, дайджест, overdue, mentions
│   ├── crypto/           # AES-256-GCM шифрование
│   └── cron/             # Планировщик задач
├── hooks/                # React-хуки (TanStack Query, debounce, push)
├── stores/               # Zustand stores (UI, portal, calendar)
└── types/                # TypeScript типы
```

Подробная архитектура: [`architecture.md`](./architecture.md)

---

## База данных

SQLite с 15 таблицами через Drizzle ORM:

| Таблица | Назначение |
|---------|------------|
| `users` | Пользователи с настройками уведомлений |
| `portals` | Подключённые порталы Bitrix24 (зашифрованные токены) |
| `user_portal_access` | Права доступа пользователей к порталам |
| `user_bitrix_mappings` | Маппинг пользователей на Bitrix24 |
| `tasks` | Локальная копия задач |
| `task_stages` | Стадии канбана |
| `task_comments` | Комментарии к задачам |
| `task_checklist_items` | Чеклисты задач |
| `task_files` | Файлы задач |
| `notifications` | Уведомления |
| `ai_reports` | Кэш AI-отчётов |
| `ai_chat_messages` | История AI-чата |
| `portal_custom_stages` | Пользовательские стадии |
| `portal_stage_mappings` | Маппинг стадий на Bitrix24 |
| `app_settings` | Настройки приложения |

```bash
# Drizzle-команды
npm run db:push       # Применить схему
npm run db:studio     # Визуальный редактор
npm run db:generate   # Генерация миграций
npm run db:encrypt    # Шифрование существующих токенов
```

---

## Cron-задачи

| Расписание | Задача |
|------------|--------|
| Каждый час | Проверка просроченных задач + push-уведомления |
| Каждую минуту | Отправка дайджестов (сверка с `digest_time` пользователя) |
| 00:00 | Генерация дневных снапшотов задач |
| 00:05 | Пре-генерация AI-отчётов за предыдущий день |

Cron включён автоматически в production. Для разработки: `ENABLE_CRON=true`.

---

## Скрипты

```bash
npm run dev           # Запуск в режиме разработки
npm run build         # Production-сборка
npm start             # Запуск production-сервера
npm run lint          # ESLint
npm run type-check    # Проверка типов TypeScript
npm run db:push       # Применить схему БД
npm run db:studio     # Drizzle Studio
npm run vapid:generate # Генерация VAPID-ключей
npm run db:encrypt    # Шифрование токенов в БД
```

---

## Лицензия

Private. Все права защищены.
