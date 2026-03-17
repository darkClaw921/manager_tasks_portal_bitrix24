import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 12 bytes for GCM
const AUTH_TAG_LENGTH = 16; // 16 bytes

/**
 * Get the encryption key from environment variable.
 * In production, throws if ENCRYPTION_KEY is not set.
 * In development, uses a fallback key with a warning.
 */
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
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }

  // Development fallback key — NOT secure, only for local dev
  console.warn(
    '[crypto] WARNING: ENCRYPTION_KEY not set, using development fallback key. ' +
    'Set ENCRYPTION_KEY in production!'
  );
  return Buffer.from(
    'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
    'hex'
  );
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a string in format: base64(iv):base64(authTag):base64(ciphertext)
 */
export function encrypt(plaintext: string): string {
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

/**
 * Decrypt an encrypted string (format: base64iv:base64authTag:base64ciphertext).
 * If the value is not encrypted (plain text), returns it as-is for backward compatibility.
 */
export function decrypt(encrypted: string): string {
  if (!isEncrypted(encrypted)) {
    return encrypted;
  }

  const key = getEncryptionKey();
  const [ivBase64, authTagBase64, ciphertextBase64] = encrypted.split(':');

  const iv = Buffer.from(ivBase64, 'base64');
  const authTag = Buffer.from(authTagBase64, 'base64');
  const ciphertext = Buffer.from(ciphertextBase64, 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

/**
 * Check if a value appears to be encrypted (matches the iv:authTag:ciphertext format).
 * Used for backward compatibility during migration from plaintext to encrypted values.
 */
export function isEncrypted(value: string): boolean {
  if (!value) return false;

  const parts = value.split(':');
  if (parts.length !== 3) return false;

  // Validate each part is valid base64
  const base64Regex = /^[A-Za-z0-9+/]+=*$/;
  return parts.every((part) => part.length > 0 && base64Regex.test(part));
}
