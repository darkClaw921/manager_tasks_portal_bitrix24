/**
 * Общий модуль для валидации и безопасного сохранения загружаемых файлов.
 *
 * Используется как meetings/messages upload endpoint, так и новыми
 * endpoint-ами для вложений задач и комментариев.
 *
 * Экспортирует:
 *  - validateUpload(file, opts?) — проверяет размер, расширение, санитизирует имя.
 *  - saveUploadToDisk(buffer, opts) — записывает буфер в каталог с уникальным префиксом.
 *  - sanitizeFileName(raw) — вспомогательный sanitizer (экспортирован для переиспользования).
 *  - MAX_UPLOAD_BYTES, DEFAULT_BLOCKED_EXTENSIONS, DEFAULT_BLOCKED_MIMES — константы.
 */

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** Default upload size cap: 25 MiB. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * Расширения, которые мы отклоняем безусловно — даже при "безобидном" MIME —
 * потому что браузер или ОС могут их исполнить при открытии.
 */
export const DEFAULT_BLOCKED_EXTENSIONS: readonly string[] = [
  '.exe',
  '.bat',
  '.cmd',
  '.com',
  '.scr',
  '.msi',
  '.sh',
  '.ps1',
  '.app',
  '.dll',
  '.jar',
  '.vbs',
  '.vbe',
  '.lnk',
];

/**
 * MIME-типы, которые отклоняем независимо от расширения. Список намеренно
 * небольшой — для скачивания мы всегда ставим Content-Disposition: attachment,
 * так что большая часть опасностей парируется на уровне потока.
 */
export const DEFAULT_BLOCKED_MIMES: readonly string[] = [
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-msi',
  'application/x-apple-diskimage',
  'application/x-ms-shortcut',
  'application/x-sh',
  'application/x-bat',
  'application/vnd.microsoft.portable-executable',
];

/**
 * Приводит произвольное имя файла к файл-системно безопасному:
 *  - берёт только basename (IE11 иногда шлёт full path);
 *  - вырезает управляющие байты и path-traversal символы;
 *  - схлопывает пробельные последовательности;
 *  - режет до 120 символов;
 *  - fallback на 'upload' если ничего не осталось.
 */
export function sanitizeFileName(raw: string): string {
  const stripped = path.basename(raw ?? '');
  const cleaned = stripped
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 'upload';
  // Не даём появиться hidden dotfile с "пропавшим" именем.
  const safe = cleaned.startsWith('.') ? cleaned.slice(1) : cleaned;
  return safe.slice(0, 120) || 'upload';
}

export type ValidateUploadOk = {
  valid: true;
  safeName: string;
  mime: string;
  size: number;
  ext: string;
};

export type ValidateUploadErr = {
  valid: false;
  reason: string;
  status: number;
};

export type ValidateUploadResult = ValidateUploadOk | ValidateUploadErr;

export type ValidateUploadOptions = {
  /** Максимальный размер в байтах. По умолчанию 25 MiB. */
  maxSize?: number;
  /** Дополнительные расширения к блоку (в формате ".exe"). */
  blockedExtensions?: readonly string[];
  /** Дополнительные MIME-типы к блоку. */
  blockedMimes?: readonly string[];
};

/**
 * Валидация File (Web API) из multipart/form-data.
 *
 * При успехе возвращает { valid: true, safeName, mime, size, ext }.
 * При ошибке — { valid: false, reason, status } где status — подходящий
 * HTTP статус (400/413/415).
 */
export function validateUpload(
  file: File,
  opts: ValidateUploadOptions = {}
): ValidateUploadResult {
  const maxSize = opts.maxSize ?? MAX_UPLOAD_BYTES;
  const blockedExts = new Set(
    [...DEFAULT_BLOCKED_EXTENSIONS, ...(opts.blockedExtensions ?? [])].map((e) =>
      e.toLowerCase()
    )
  );
  const blockedMimes = new Set(
    [...DEFAULT_BLOCKED_MIMES, ...(opts.blockedMimes ?? [])].map((m) =>
      m.toLowerCase()
    )
  );

  if (!file || typeof file !== 'object' || typeof file.size !== 'number') {
    return { valid: false, reason: 'Missing file', status: 400 };
  }

  if (file.size <= 0) {
    return { valid: false, reason: 'File is empty', status: 400 };
  }

  if (file.size > maxSize) {
    const mib = Math.floor(maxSize / (1024 * 1024));
    return {
      valid: false,
      reason: `File exceeds ${maxSize} bytes (${mib} MiB)`,
      status: 413,
    };
  }

  const originalName = file.name || 'upload';
  const safeName = sanitizeFileName(originalName);
  const ext = path.extname(safeName).toLowerCase();
  const mime = (file.type || 'application/octet-stream').toLowerCase();

  if (blockedMimes.has(mime) || blockedExts.has(ext)) {
    return {
      valid: false,
      reason: 'This file type is not allowed',
      status: 415,
    };
  }

  return {
    valid: true,
    safeName,
    mime,
    size: file.size,
    ext,
  };
}

export type SaveUploadOptions = {
  /** Абсолютный путь к каталогу назначения; создаётся при необходимости. */
  dir: string;
  /** Уже sanitized имя файла (обычно из validateUpload). */
  fileName: string;
  /** Необязательный явный MIME, записывается в возвращаемый объект. */
  mime?: string;
};

export type SaveUploadResult = {
  /** Полный абсолютный путь к сохранённому файлу. */
  path: string;
  /** Размер буфера в байтах. */
  size: number;
  /** MIME type (передан в opts или 'application/octet-stream'). */
  mime: string;
  /** Имя файла на диске ({uuid}_{safeName}). */
  storedName: string;
};

/**
 * Записывает буфер в `dir` под именем `{uuid}_{fileName}`, создавая каталог
 * при необходимости. Защищается от path traversal: проверяет, что
 * абсолютный путь назначения начинается с резолва каталога.
 */
export async function saveUploadToDisk(
  buffer: Buffer,
  opts: SaveUploadOptions
): Promise<SaveUploadResult> {
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError('saveUploadToDisk: buffer must be a Buffer');
  }
  if (!opts.dir) throw new Error('saveUploadToDisk: dir is required');
  if (!opts.fileName) throw new Error('saveUploadToDisk: fileName is required');

  // Sanitize once more на всякий случай — на случай если caller пропустил.
  const safeName = sanitizeFileName(opts.fileName);
  const storedName = `${randomUUID()}_${safeName}`;
  const absolutePath = path.join(opts.dir, storedName);

  const resolvedRoot = path.resolve(opts.dir);
  const resolvedAbs = path.resolve(absolutePath);
  if (
    resolvedAbs !== resolvedRoot &&
    !resolvedAbs.startsWith(resolvedRoot + path.sep)
  ) {
    throw new Error('saveUploadToDisk: resolved path escapes dir');
  }

  await fs.promises.mkdir(opts.dir, { recursive: true });
  await fs.promises.writeFile(absolutePath, buffer);

  return {
    path: absolutePath,
    size: buffer.byteLength,
    mime: opts.mime ?? 'application/octet-stream',
    storedName,
  };
}
