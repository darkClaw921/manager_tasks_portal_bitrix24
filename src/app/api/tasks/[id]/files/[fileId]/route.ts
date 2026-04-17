/**
 * Single task file — download (GET) + delete (DELETE).
 *
 *   GET /api/tasks/[id]/files/[fileId]
 *     Стримит содержимое файла. Заголовки:
 *       Content-Type: <mime_type> (или content_type / octet-stream)
 *       Content-Disposition: attachment; filename="<original>"
 *     Если file_path у записи нет (Bitrix-synced row) — 404, потому что
 *     локальных байтов нет.
 *
 *   DELETE /api/tasks/[id]/files/[fileId]
 *     Разрешено: автор файла (uploaded_by === userId), админ портала или
 *     глобальный админ. Для Bitrix-synced rows (uploaded_by IS NULL) —
 *     только глобальный админ или админ портала.
 *     Удаляет запись + файл с диска (ENOENT — best-effort, не фейлим).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tasks, taskFiles, portals } from '@/lib/db/schema';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { hasPortalAccess, isPortalAdmin } from '@/lib/portals/access';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string; fileId: string }> };

function parseId(raw: string): number | null {
  const n = parseInt(raw, 10);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function getTaskFileWithContext(taskId: number, fileId: number) {
  return db
    .select({
      file: taskFiles,
      portalId: tasks.portalId,
      portalMemberId: portals.memberId,
    })
    .from(taskFiles)
    .innerJoin(tasks, eq(taskFiles.taskId, tasks.id))
    .innerJoin(portals, eq(tasks.portalId, portals.id))
    .where(eq(taskFiles.id, fileId))
    .get();
}

// ==================== GET ====================
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { id, fileId } = await context.params;
    const taskId = parseId(id);
    const fId = parseId(fileId);
    if (taskId == null || fId == null) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid id' },
        { status: 400 }
      );
    }

    const row = getTaskFileWithContext(taskId, fId);
    if (!row || row.file.taskId !== taskId) {
      return NextResponse.json(
        { error: 'Not Found', message: 'File not found' },
        { status: 404 }
      );
    }

    if (!auth.user.isAdmin && !hasPortalAccess(auth.user.userId, row.portalId)) {
      return NextResponse.json(
        { error: 'Not Found', message: 'File not found' },
        { status: 404 }
      );
    }

    const filePath = row.file.filePath;
    if (!filePath) {
      // Bitrix-synced row — у нас нет байтов на диске.
      return NextResponse.json(
        {
          error: 'Not Found',
          message: 'File payload is stored in Bitrix24 — download via the portal UI.',
        },
        { status: 404 }
      );
    }

    // Быстрый stat, чтобы получить размер и убедиться что файл есть.
    let stat: fs.Stats;
    try {
      stat = await fs.promises.stat(filePath);
    } catch {
      return NextResponse.json(
        { error: 'Not Found', message: 'File payload missing on disk' },
        { status: 404 }
      );
    }

    // Читаем файл целиком — 25 MiB cap делает это безопасным.
    const buffer = await fs.promises.readFile(filePath);
    const mime =
      row.file.mimeType || row.file.contentType || 'application/octet-stream';
    const displayName = row.file.fileName || row.file.name || 'download';
    // Очищаем кавычки для заголовка.
    const safeDisposition = displayName.replace(/"/g, '');

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Content-Length': String(stat.size),
        'Cache-Control': 'private, no-store',
        'Content-Disposition': `attachment; filename="${safeDisposition}"`,
      },
    });
  } catch (error) {
    console.error('[tasks/[id]/files/[fileId]] GET error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to read file';
    return NextResponse.json(
      { error: 'Internal', message: msg },
      { status: 500 }
    );
  }
}

// ==================== DELETE ====================
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { id, fileId } = await context.params;
    const taskId = parseId(id);
    const fId = parseId(fileId);
    if (taskId == null || fId == null) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid id' },
        { status: 400 }
      );
    }

    const row = getTaskFileWithContext(taskId, fId);
    if (!row || row.file.taskId !== taskId) {
      return NextResponse.json(
        { error: 'Not Found', message: 'File not found' },
        { status: 404 }
      );
    }

    if (!auth.user.isAdmin && !hasPortalAccess(auth.user.userId, row.portalId)) {
      return NextResponse.json(
        { error: 'Not Found', message: 'File not found' },
        { status: 404 }
      );
    }

    const isAuthor =
      row.file.uploadedBy != null && row.file.uploadedBy === auth.user.userId;
    const canModerate =
      auth.user.isAdmin || isPortalAdmin(auth.user.userId, row.portalId);

    if (!isAuthor && !canModerate) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'You cannot delete this file' },
        { status: 403 }
      );
    }

    // 1. Удаляем строку из БД.
    db.delete(taskFiles).where(eq(taskFiles.id, fId)).run();

    // 2. Удаляем файл с диска (best-effort; ENOENT игнорируем).
    if (row.file.filePath) {
      try {
        await fs.promises.unlink(row.file.filePath);
      } catch (err: unknown) {
        const code = (err as NodeJS.ErrnoException)?.code;
        if (code !== 'ENOENT') {
          console.warn('[tasks/[id]/files/[fileId]] unlink failed:', err);
        }
      }
    }

    return NextResponse.json({ data: { id: fId, deleted: true } });
  } catch (error) {
    console.error('[tasks/[id]/files/[fileId]] DELETE error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to delete file';
    return NextResponse.json(
      { error: 'Internal', message: msg },
      { status: 500 }
    );
  }
}
