/**
 * Local task file attachments — list + upload.
 *
 *   GET  /api/tasks/[id]/files
 *     Список метаданных файлов, прикреплённых к задаче (без содержимого).
 *     Доступ — у кого есть доступ к портал-задаче (hasPortalAccess или admin).
 *
 *   POST /api/tasks/[id]/files
 *     multipart/form-data с полями `file` или `files[]`. Допускается только для
 *     локального портала (isLocalPortal). Для Bitrix24 — 400, потому что там
 *     файлы живут в Bitrix, и uploader UI отдельный.
 *
 * Хранение: `data/task-files/<taskId>/<uuid>_<safeName>`.
 * Используем общий модуль safe-upload для валидации и записи.
 */

import { NextRequest, NextResponse } from 'next/server';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tasks, taskFiles, portals } from '@/lib/db/schema';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { hasPortalAccess } from '@/lib/portals/access';
import { isLocalPortal } from '@/lib/portals/local';
import {
  validateUpload,
  saveUploadToDisk,
} from '@/lib/uploads/safe-upload';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const n = parseInt(raw, 10);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function getTaskWithPortal(taskId: number) {
  return db
    .select({
      id: tasks.id,
      portalId: tasks.portalId,
      portalMemberId: portals.memberId,
    })
    .from(tasks)
    .innerJoin(portals, eq(tasks.portalId, portals.id))
    .where(eq(tasks.id, taskId))
    .get();
}

/**
 * Resolve absolute root for task file uploads.
 * Overridable via TASK_FILES_DIR for tests / alt deployments.
 */
function taskFilesRoot(): string {
  return (
    process.env.TASK_FILES_DIR ??
    path.join(process.cwd(), 'data', 'task-files')
  );
}

// ==================== GET ====================
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { id } = await context.params;
    const taskId = parseId(id);
    if (taskId == null) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid task id' },
        { status: 400 }
      );
    }

    const task = getTaskWithPortal(taskId);
    if (!task) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Task not found' },
        { status: 404 }
      );
    }

    if (!auth.user.isAdmin && !hasPortalAccess(auth.user.userId, task.portalId)) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Task not found' },
        { status: 404 }
      );
    }

    const rows = db
      .select()
      .from(taskFiles)
      .where(eq(taskFiles.taskId, taskId))
      .all();

    return NextResponse.json({ data: rows });
  } catch (error) {
    console.error('[tasks/[id]/files] GET error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to list files';
    return NextResponse.json(
      { error: 'Internal', message: msg },
      { status: 500 }
    );
  }
}

// ==================== POST ====================
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { id } = await context.params;
    const taskId = parseId(id);
    if (taskId == null) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid task id' },
        { status: 400 }
      );
    }

    const task = getTaskWithPortal(taskId);
    if (!task) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Task not found' },
        { status: 404 }
      );
    }

    if (!auth.user.isAdmin && !hasPortalAccess(auth.user.userId, task.portalId)) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Task not found' },
        { status: 404 }
      );
    }

    // Файлы можно загружать только для локального портала. Для Bitrix24
    // аплоад — через UI самого Bitrix24.
    if (!isLocalPortal({ memberId: task.portalMemberId })) {
      return NextResponse.json(
        {
          error: 'Validation',
          message: 'Загрузка файлов доступна только для локальных задач. Используйте интерфейс Bitrix24.',
        },
        { status: 400 }
      );
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (err) {
      console.warn('[tasks/[id]/files] formData parse failed:', err);
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid multipart body' },
        { status: 400 }
      );
    }

    // Собираем все файлы из формы — принимаем и `file` (single) и `files`/`files[]`.
    const collected: File[] = [];
    for (const key of ['file', 'files', 'files[]']) {
      const entries = formData.getAll(key);
      for (const e of entries) {
        if (e instanceof File) collected.push(e);
      }
    }
    if (collected.length === 0) {
      return NextResponse.json(
        { error: 'Validation', message: 'Missing file field' },
        { status: 400 }
      );
    }

    const dir = path.join(taskFilesRoot(), String(taskId));
    const inserted: Array<typeof taskFiles.$inferSelect> = [];

    for (const file of collected) {
      const validation = validateUpload(file);
      if (!validation.valid) {
        const status = validation.status;
        const errKey =
          status === 413
            ? 'PayloadTooLarge'
            : status === 415
              ? 'Forbidden'
              : 'Validation';
        return NextResponse.json(
          { error: errKey, message: validation.reason },
          { status }
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const saved = await saveUploadToDisk(buffer, {
        dir,
        fileName: validation.safeName,
        mime: validation.mime,
      });

      const now = new Date().toISOString();
      const result = db
        .insert(taskFiles)
        .values({
          taskId,
          name: validation.safeName,
          size: saved.size,
          contentType: validation.mime,
          uploadedBy: auth.user.userId,
          filePath: saved.path,
          fileName: validation.safeName,
          fileSize: saved.size,
          mimeType: validation.mime,
          createdAt: now,
        })
        .run();

      const row = db
        .select()
        .from(taskFiles)
        .where(eq(taskFiles.id, Number(result.lastInsertRowid)))
        .get();
      if (row) inserted.push(row);
    }

    // Для single-file клиента возвращаем один объект, для multi — массив.
    if (inserted.length === 1) {
      return NextResponse.json({ data: inserted[0] }, { status: 201 });
    }
    return NextResponse.json({ data: inserted }, { status: 201 });
  } catch (error) {
    console.error('[tasks/[id]/files] POST error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to upload file';
    return NextResponse.json(
      { error: 'Internal', message: msg },
      { status: 500 }
    );
  }
}

