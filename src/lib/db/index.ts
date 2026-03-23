import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import path from 'path';

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'taskhub.db');

// Ensure data directory exists
import fs from 'fs';
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Create SQLite database connection
const sqlite = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
sqlite.pragma('journal_mode = WAL');
// Enable foreign keys
sqlite.pragma('foreign_keys = ON');

// Create Drizzle ORM instance
export const db = drizzle(sqlite, { schema });

// Initialize tables by running CREATE TABLE IF NOT EXISTS statements
function initializeTables() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      language TEXT NOT NULL DEFAULT 'ru',
      timezone TEXT NOT NULL DEFAULT 'Europe/Moscow',
      digest_time TEXT NOT NULL DEFAULT '09:00',
      notify_task_add INTEGER NOT NULL DEFAULT 1,
      notify_task_update INTEGER NOT NULL DEFAULT 1,
      notify_task_delete INTEGER NOT NULL DEFAULT 1,
      notify_comment_add INTEGER NOT NULL DEFAULT 1,
      notify_mention INTEGER NOT NULL DEFAULT 1,
      notify_overdue INTEGER NOT NULL DEFAULT 1,
      notify_digest INTEGER NOT NULL DEFAULT 1,
      push_subscription TEXT,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
      updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );

    CREATE TABLE IF NOT EXISTS portals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      domain TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#2563EB',
      member_id TEXT NOT NULL,
      client_id TEXT NOT NULL DEFAULT '',
      client_secret TEXT NOT NULL DEFAULT '',
      client_endpoint TEXT NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      token_expires_at TEXT,
      app_token TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      last_sync_at TEXT,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
      updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );
    DROP INDEX IF EXISTS portals_user_member_unique;
    CREATE UNIQUE INDEX IF NOT EXISTS portals_member_unique ON portals(member_id);

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      portal_id INTEGER NOT NULL REFERENCES portals(id) ON DELETE CASCADE,
      bitrix_task_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      description_html TEXT,
      status TEXT NOT NULL DEFAULT 'NEW',
      priority TEXT NOT NULL DEFAULT '1',
      mark TEXT,
      responsible_id TEXT,
      responsible_name TEXT,
      creator_id TEXT,
      creator_name TEXT,
      group_id INTEGER,
      stage_id INTEGER,
      deadline TEXT,
      start_date_plan TEXT,
      end_date_plan TEXT,
      created_date TEXT,
      changed_date TEXT,
      closed_date TEXT,
      time_estimate INTEGER,
      time_spent INTEGER,
      tags TEXT,
      accomplices TEXT,
      auditors TEXT,
      bitrix_url TEXT,
      exclude_from_ai INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
      updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS tasks_portal_bitrix_unique ON tasks(portal_id, bitrix_task_id);

    CREATE TABLE IF NOT EXISTS task_stages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      portal_id INTEGER NOT NULL REFERENCES portals(id) ON DELETE CASCADE,
      bitrix_stage_id TEXT NOT NULL,
      entity_id INTEGER NOT NULL DEFAULT 0,
      entity_type TEXT NOT NULL DEFAULT 'USER',
      title TEXT NOT NULL,
      sort INTEGER NOT NULL DEFAULT 0,
      color TEXT,
      system_type TEXT,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
      updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS task_stages_portal_bitrix_unique ON task_stages(portal_id, bitrix_stage_id);

    CREATE TABLE IF NOT EXISTS task_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      bitrix_comment_id INTEGER NOT NULL,
      author_id TEXT,
      author_name TEXT,
      post_message TEXT,
      post_date TEXT,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS task_comments_task_bitrix_unique ON task_comments(task_id, bitrix_comment_id);

    CREATE TABLE IF NOT EXISTS task_checklist_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      bitrix_item_id INTEGER,
      title TEXT NOT NULL,
      sort_index INTEGER NOT NULL DEFAULT 0,
      is_complete INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );

    CREATE TABLE IF NOT EXISTS task_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      bitrix_file_id INTEGER,
      name TEXT NOT NULL,
      size INTEGER,
      download_url TEXT,
      content_type TEXT,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT,
      portal_id INTEGER REFERENCES portals(id) ON DELETE SET NULL,
      task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );

    CREATE TABLE IF NOT EXISTS ai_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      content TEXT NOT NULL,
      stats TEXT,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );

    CREATE TABLE IF NOT EXISTS ai_chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );

    CREATE TABLE IF NOT EXISTS user_portal_access (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      portal_id INTEGER NOT NULL REFERENCES portals(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'viewer',
      can_see_responsible INTEGER NOT NULL DEFAULT 1,
      can_see_accomplice INTEGER NOT NULL DEFAULT 0,
      can_see_auditor INTEGER NOT NULL DEFAULT 0,
      can_see_creator INTEGER NOT NULL DEFAULT 0,
      can_see_all INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
      updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS user_portal_access_user_portal_unique ON user_portal_access(user_id, portal_id);

    CREATE TABLE IF NOT EXISTS user_bitrix_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      portal_id INTEGER NOT NULL REFERENCES portals(id) ON DELETE CASCADE,
      bitrix_user_id TEXT NOT NULL,
      bitrix_name TEXT,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
      updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS user_bitrix_mappings_user_portal_unique ON user_bitrix_mappings(user_id, portal_id);
    CREATE UNIQUE INDEX IF NOT EXISTS user_bitrix_mappings_portal_bitrix_unique ON user_bitrix_mappings(portal_id, bitrix_user_id);

    CREATE TABLE IF NOT EXISTS portal_custom_stages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      portal_id INTEGER NOT NULL REFERENCES portals(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      color TEXT,
      sort INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
      updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );

    CREATE TABLE IF NOT EXISTS portal_stage_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      portal_id INTEGER NOT NULL REFERENCES portals(id) ON DELETE CASCADE,
      custom_stage_id INTEGER NOT NULL REFERENCES portal_custom_stages(id) ON DELETE CASCADE,
      bitrix_stage_id INTEGER NOT NULL REFERENCES task_stages(id) ON DELETE CASCADE,
      UNIQUE(portal_id, bitrix_stage_id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS portal_stage_mappings_portal_bitrix_unique ON portal_stage_mappings(portal_id, bitrix_stage_id);

    CREATE TABLE IF NOT EXISTS task_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      rate_type TEXT NOT NULL DEFAULT 'fixed',
      amount REAL NOT NULL DEFAULT 0,
      hours_override REAL,
      is_paid INTEGER NOT NULL DEFAULT 0,
      paid_at TEXT,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
      updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS task_rates_user_task_unique ON task_rates(user_id, task_id);

    CREATE TABLE IF NOT EXISTS time_tracking_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      started_at TEXT NOT NULL,
      stopped_at TEXT,
      duration INTEGER,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );
  `);

  // Migration: create user_portal_access entries for existing portals
  // Each portal owner gets admin role with can_see_all=1
  sqlite.exec(`
    INSERT OR IGNORE INTO user_portal_access (user_id, portal_id, role, can_see_responsible, can_see_accomplice, can_see_auditor, can_see_creator, can_see_all)
    SELECT user_id, id, 'admin', 1, 0, 0, 0, 1
    FROM portals;
  `);
}

// Run initialization
initializeTables();

// Migration: add author_photo column to task_comments if missing
try {
  sqlite.exec(`ALTER TABLE task_comments ADD COLUMN author_photo TEXT`);
} catch {
  // Column already exists
}

// Migration: add responsible_photo and creator_photo columns to tasks if missing
try {
  sqlite.exec(`ALTER TABLE tasks ADD COLUMN responsible_photo TEXT`);
} catch {
  // Column already exists
}
try {
  sqlite.exec(`ALTER TABLE tasks ADD COLUMN creator_photo TEXT`);
} catch {
  // Column already exists
}

// Migration: add exclude_from_ai column to tasks if missing
try {
  sqlite.exec(`ALTER TABLE tasks ADD COLUMN exclude_from_ai INTEGER NOT NULL DEFAULT 0`);
} catch {
  // Column already exists — ignore
}

// Migration: add client_id and client_secret columns to portals if missing
try {
  sqlite.exec(`ALTER TABLE portals ADD COLUMN client_id TEXT NOT NULL DEFAULT ''`);
} catch {
  // Column already exists — ignore
}
try {
  sqlite.exec(`ALTER TABLE portals ADD COLUMN client_secret TEXT NOT NULL DEFAULT ''`);
} catch {
  // Column already exists — ignore
}

// Migration: add attached_files column to task_comments if missing
try {
  sqlite.exec(`ALTER TABLE task_comments ADD COLUMN attached_files TEXT`);
} catch {
  // Column already exists
}

// Seed admin user (async, runs in background on first load)
import { seedAdmin } from './seed';
seedAdmin().catch((err) => console.error('[db] Seed error:', err));

export default db;
