/**
 * Migration script: encrypt existing plaintext tokens in the database.
 *
 * Encrypts:
 * - portals: accessToken, refreshToken, appToken
 * - users: pushSubscription
 *
 * Idempotent — already-encrypted values (detected by isEncrypted()) are skipped.
 *
 * Usage:
 *   npx tsx scripts/encrypt-existing-tokens.ts
 *   # or via npm script:
 *   npm run db:encrypt
 */

import Database from 'better-sqlite3';
import * as crypto from 'crypto';
import path from 'path';
import fs from 'fs';

// ==================== Encryption (inline, standalone copy) ====================

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const keyHex = process.env.ENCRYPTION_KEY;

  if (keyHex) {
    if (keyHex.length !== 64) {
      throw new Error(
        `ENCRYPTION_KEY must be 64 hex characters (32 bytes). Got ${keyHex.length} characters.`
      );
    }
    return Buffer.from(keyHex, 'hex');
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'ENCRYPTION_KEY environment variable is required in production. ' +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }

  // Development fallback key — matches src/lib/crypto/encryption.ts
  console.warn(
    '[encrypt-script] WARNING: ENCRYPTION_KEY not set, using development fallback key.'
  );
  return Buffer.from(
    'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
    'hex'
  );
}

function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return [
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}

function isEncrypted(value: string): boolean {
  if (!value) return false;

  const parts = value.split(':');
  if (parts.length !== 3) return false;

  const base64Regex = /^[A-Za-z0-9+/]+=*$/;
  return parts.every((part) => part.length > 0 && base64Regex.test(part));
}

// ==================== Database Connection ====================

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'taskhub.db');

if (!fs.existsSync(DB_PATH)) {
  console.error(`[encrypt-script] Database not found at: ${DB_PATH}`);
  console.error('Set DATABASE_PATH environment variable or run from project root.');
  process.exit(1);
}

const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

// ==================== Migration Logic ====================

interface PortalRow {
  id: number;
  access_token: string;
  refresh_token: string;
  app_token: string | null;
  client_id: string;
  client_secret: string;
}

interface UserRow {
  id: number;
  push_subscription: string | null;
}

function encryptPortalTokens(): number {
  const portals = sqlite.prepare(
    'SELECT id, access_token, refresh_token, app_token, client_id, client_secret FROM portals'
  ).all() as PortalRow[];

  let encryptedCount = 0;

  const updateStmt = sqlite.prepare(
    'UPDATE portals SET access_token = ?, refresh_token = ?, app_token = ?, client_id = ?, client_secret = ?, updated_at = ? WHERE id = ?'
  );

  const transaction = sqlite.transaction(() => {
    for (const portal of portals) {
      let needsUpdate = false;
      let newAccessToken = portal.access_token;
      let newRefreshToken = portal.refresh_token;
      let newAppToken = portal.app_token;
      let newClientId = portal.client_id;
      let newClientSecret = portal.client_secret;

      if (portal.access_token && !isEncrypted(portal.access_token)) {
        newAccessToken = encrypt(portal.access_token);
        needsUpdate = true;
      }

      if (portal.refresh_token && !isEncrypted(portal.refresh_token)) {
        newRefreshToken = encrypt(portal.refresh_token);
        needsUpdate = true;
      }

      if (portal.app_token && !isEncrypted(portal.app_token)) {
        newAppToken = encrypt(portal.app_token);
        needsUpdate = true;
      }

      if (portal.client_id && !isEncrypted(portal.client_id)) {
        newClientId = encrypt(portal.client_id);
        needsUpdate = true;
      }

      if (portal.client_secret && !isEncrypted(portal.client_secret)) {
        newClientSecret = encrypt(portal.client_secret);
        needsUpdate = true;
      }

      if (needsUpdate) {
        updateStmt.run(
          newAccessToken,
          newRefreshToken,
          newAppToken,
          newClientId,
          newClientSecret,
          new Date().toISOString(),
          portal.id
        );
        encryptedCount++;
      }
    }
  });

  transaction();
  return encryptedCount;
}

function encryptPushSubscriptions(): number {
  const usersWithSub = sqlite.prepare(
    'SELECT id, push_subscription FROM users WHERE push_subscription IS NOT NULL'
  ).all() as UserRow[];

  let encryptedCount = 0;

  const updateStmt = sqlite.prepare(
    'UPDATE users SET push_subscription = ?, updated_at = ? WHERE id = ?'
  );

  const transaction = sqlite.transaction(() => {
    for (const user of usersWithSub) {
      if (user.push_subscription && !isEncrypted(user.push_subscription)) {
        const encrypted = encrypt(user.push_subscription);
        updateStmt.run(encrypted, new Date().toISOString(), user.id);
        encryptedCount++;
      }
    }
  });

  transaction();
  return encryptedCount;
}

// ==================== Main ====================

function main() {
  console.log('[encrypt-script] Starting encryption migration...');
  console.log(`[encrypt-script] Database: ${DB_PATH}`);

  // Get totals before migration
  const totalPortals = (sqlite.prepare('SELECT COUNT(*) as count FROM portals').get() as { count: number }).count;
  const totalUsersWithSub = (sqlite.prepare('SELECT COUNT(*) as count FROM users WHERE push_subscription IS NOT NULL').get() as { count: number }).count;

  console.log(`[encrypt-script] Found ${totalPortals} portals, ${totalUsersWithSub} users with push subscriptions`);

  const portalCount = encryptPortalTokens();
  console.log(`[encrypt-script] Encrypted ${portalCount} of ${totalPortals} portal records`);

  const pushCount = encryptPushSubscriptions();
  console.log(`[encrypt-script] Encrypted ${pushCount} of ${totalUsersWithSub} push subscription records`);

  if (portalCount === 0 && pushCount === 0) {
    console.log('[encrypt-script] All records already encrypted. Nothing to do.');
  } else {
    console.log(`[encrypt-script] Migration complete. Encrypted ${portalCount + pushCount} records total.`);
  }

  sqlite.close();
}

main();
