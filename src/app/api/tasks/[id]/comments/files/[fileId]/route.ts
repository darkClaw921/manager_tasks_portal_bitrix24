/**
 * GET /api/tasks/[id]/comments/files/[fileId]
 *
 * Стримит локальный файл, прикреплённый к комментарию задачи.
 *
 * Логика поиска:
 *  1. Находим все комментарии задачи.
 *  2. В attached_files (JSON CommentFile[]) ищем запись с id === fileId.
 *  3. Проверяем что у юзера есть доступ к задаче.
 *  4. Отдаём файл потоком с Content-Disposition: attachment.
 *
 * Bitrix-sync вложения сюда не попадают — у них есть downloadUrl в клиенте.
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tasks, taskComments, portals } from '@/lib/db/schema';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { hasPortalAccess } from '@/lib/portals/access';
import type { CommentFile } from '@/types/task';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string; fileId: string }> };

function parseId(raw: string): number | null {
  const n = parseInt(raw, 10);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function parseAttached(raw: string | null): CommentFile[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as CommentFile[];
    return [];
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { id, fileId } = await context.params;
    const taskId = parseId(id);
    if (taskId == null || !fileId) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid id' },
        { status: 400 }
      );
    }

    const taskRow = db
      .select({
        id: tasks.id,
        portalId: tasks.portalId,
        portalMemberId: portals.memberId,
      })
      .from(tasks)
      .innerJoin(portals, eq(tasks.portalId, portals.id))
      .where(eq(tasks.id, taskId))
      .get();

    if (!taskRow) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Task not found' },
        { status: 404 }
      );
    }

    if (!auth.user.isAdmin && !hasPortalAccess(auth.user.userId, taskRow.portalId)) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Task not found' },
        { status: 404 }
      );
    }

    // Достаём все комменты этой задачи и ищем нужный файл.
    const rows = db
      .select({ attachedFiles: taskComments.attachedFiles })
      .from(taskComments)
      .where(eq(taskComments.taskId, taskId))
      .all();

    let target: CommentFile | null = null;
    for (const row of rows) {
      const list = parseAttached(row.attachedFiles);
      const match = list.find((f) => String(f.id) === String(fileId));
      if (match) {
        target = match;
        break;
      }
    }

    if (!target || !target.filePath) {
      return NextResponse.json(
        { error: 'Not Found', message: 'File not found' },
        { status: 404 }
      );
    }

    let stat: fs.Stats;
    try {
      stat = await fs.promises.stat(target.filePath);
    } catch {
      return NextResponse.json(
        { error: 'Not Found', message: 'File payload missing on disk' },
        { status: 404 }
      );
    }

    const buffer = await fs.promises.readFile(target.filePath);
    const mime =
      target.mime || target.contentType || 'application/octet-stream';
    const safeDisposition = target.name.replace(/"/g, '');

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
    console.error('[tasks/[id]/comments/files/[fileId]] GET error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to read file';
    return NextResponse.json(
      { error: 'Internal', message: msg },
      { status: 500 }
    );
  }
}
