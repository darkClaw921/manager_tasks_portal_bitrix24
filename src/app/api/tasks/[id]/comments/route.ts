import { NextRequest, NextResponse } from 'next/server';
import path from 'node:path';
import { db } from '@/lib/db';
import { tasks, taskComments, portals, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { addComment } from '@/lib/bitrix/comments';
import { hasPortalAccess } from '@/lib/portals/access';
import { getBitrixUserIdForUser, getAllMappingsForPortal } from '@/lib/portals/mappings';
import { isLocalPortal } from '@/lib/portals/local';
import { validateUpload, saveUploadToDisk } from '@/lib/uploads/safe-upload';
import type { CommentFile } from '@/types/task';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

/** Root для файлов комментариев — overridable через TASK_COMMENT_FILES_DIR. */
function commentFilesRoot(): string {
  return (
    process.env.TASK_COMMENT_FILES_DIR ??
    path.join(process.cwd(), 'data', 'task-comment-files')
  );
}

/**
 * Ограничение детектора multipart — content-type starts with multipart/form-data.
 * Все остальные типы (включая application/json) идут по JSON-ветке для
 * обратной совместимости.
 */
function isMultipart(request: NextRequest): boolean {
  const ct = request.headers.get('content-type') || '';
  return ct.toLowerCase().startsWith('multipart/form-data');
}

type ParsedBody = {
  message: string;
  files: File[];
};

async function parseRequestBody(request: NextRequest): Promise<ParsedBody> {
  if (isMultipart(request)) {
    const formData = await request.formData();
    const content = formData.get('content') ?? formData.get('message') ?? '';
    const files: File[] = [];
    for (const key of ['files', 'files[]', 'file']) {
      for (const e of formData.getAll(key)) {
        if (e instanceof File) files.push(e);
      }
    }
    return {
      message: typeof content === 'string' ? content : '',
      files,
    };
  }
  const body = await request.json().catch(() => ({}));
  return {
    message: typeof body?.message === 'string' ? body.message : '',
    files: [],
  };
}

/**
 * POST /api/tasks/[id]/comments
 *
 * Добавить комментарий к задаче.
 *   - JSON body ({ message }) — обратная совместимость, без файлов.
 *   - multipart/form-data (content + files[]) — позволяет прикрепить файлы;
 *     сохраняются в data/task-comment-files/{taskId}/{uuid}_{safeName},
 *     метаданные пишутся в task_comments.attached_files как CommentFile[] JSON.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (isAuthError(auth)) return auth;

    const { id } = await context.params;
    const taskId = parseInt(id, 10);
    if (isNaN(taskId)) {
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid task ID' },
        { status: 400 }
      );
    }

    let parsed: ParsedBody;
    try {
      parsed = await parseRequestBody(request);
    } catch (err) {
      console.warn('[tasks/[id]/comments] body parse failed:', err);
      return NextResponse.json(
        { error: 'Validation', message: 'Invalid request body' },
        { status: 400 }
      );
    }

    const { message, files } = parsed;

    // Для multipart разрешаем пустое сообщение если есть файлы.
    if (!message.trim() && files.length === 0) {
      return NextResponse.json(
        { error: 'Validation', message: 'message or files are required' },
        { status: 400 }
      );
    }

    // Get task by ID with portal memberId for local detection
    const task = db
      .select({
        id: tasks.id,
        portalId: tasks.portalId,
        bitrixTaskId: tasks.bitrixTaskId,
        portalMemberId: portals.memberId,
      })
      .from(tasks)
      .innerJoin(portals, eq(tasks.portalId, portals.id))
      .where(eq(tasks.id, taskId))
      .get();

    if (!task) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Task not found' },
        { status: 404 }
      );
    }

    // Check portal access
    if (!auth.user.isAdmin && !hasPortalAccess(auth.user.userId, task.portalId)) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Task not found' },
        { status: 404 }
      );
    }

    const taskIsLocal = isLocalPortal({ memberId: task.portalMemberId });

    // Для Bitrix24 таски прикрепление файлов через наш API не поддерживается —
    // файлы живут в самом Bitrix24. Если пришли файлы — 400.
    if (!taskIsLocal && files.length > 0) {
      return NextResponse.json(
        {
          error: 'Validation',
          message: 'Прикрепление файлов к комментариям не поддерживается для Bitrix24 задач.',
        },
        { status: 400 }
      );
    }

    // Сохраняем файлы на диск (только локальные задачи сюда доходят).
    const attached: CommentFile[] = [];
    if (taskIsLocal && files.length > 0) {
      const dir = path.join(commentFilesRoot(), String(taskId));
      for (const file of files) {
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
        // storedName = "<uuid>_<safeName>" — используем uuid как id.
        const idPart = saved.storedName.split('_')[0];
        attached.push({
          id: idPart,
          name: validation.safeName,
          size: saved.size,
          downloadUrl: null,
          contentType: validation.mime,
          filePath: saved.path,
          mime: validation.mime,
        });
      }
    }

    // ===== LOCAL PORTAL BRANCH =====
    if (taskIsLocal) {
      const nowL = new Date().toISOString();
      // Snapshot author name from app users table
      const authorRow = db
        .select({ firstName: users.firstName, lastName: users.lastName })
        .from(users)
        .where(eq(users.id, auth.user.userId))
        .get();
      const authorNameL = authorRow
        ? `${authorRow.firstName} ${authorRow.lastName}`.trim()
        : 'Вы';

      const syntheticCommentId = -Date.now();
      const insertRes = db
        .insert(taskComments)
        .values({
          taskId,
          bitrixCommentId: syntheticCommentId,
          authorId: String(auth.user.userId),
          authorName: authorNameL,
          postMessage: message.trim(),
          postDate: nowL,
          attachedFiles: attached.length > 0 ? JSON.stringify(attached) : null,
          createdAt: nowL,
        })
        .run();

      const newCommentL = db
        .select()
        .from(taskComments)
        .where(eq(taskComments.id, Number(insertRes.lastInsertRowid)))
        .get();

      // Возвращаем с распарсенным attachedFiles.
      const response = newCommentL
        ? {
            ...newCommentL,
            attachedFiles: newCommentL.attachedFiles
              ? (JSON.parse(newCommentL.attachedFiles) as CommentFile[])
              : null,
          }
        : null;

      return NextResponse.json({ data: response }, { status: 201 });
    }
    // ===== END LOCAL PORTAL BRANCH =====

    // Look up the current user's Bitrix24 ID and name for this portal
    const bitrixUserId = getBitrixUserIdForUser(auth.user.userId, task.portalId);
    let bitrixName: string | null = null;
    if (bitrixUserId) {
      const mappings = getAllMappingsForPortal(task.portalId);
      const userMapping = mappings.find((m) => m.userId === auth.user.userId);
      bitrixName = userMapping?.bitrixName ?? null;
    }

    // Add comment on Bitrix24 (pass authorId if available)
    const bitrixCommentId = await addComment(
      task.portalId,
      task.bitrixTaskId,
      message.trim(),
      bitrixUserId ?? undefined
    );

    // Save locally
    const now = new Date().toISOString();
    const result = db
      .insert(taskComments)
      .values({
        taskId,
        bitrixCommentId,
        authorId: bitrixUserId ?? null,
        authorName: bitrixName ?? 'Вы',
        postMessage: message.trim(),
        postDate: now,
        createdAt: now,
      })
      .run();

    const newComment = db
      .select()
      .from(taskComments)
      .where(eq(taskComments.id, Number(result.lastInsertRowid)))
      .get();

    return NextResponse.json({
      data: newComment,
    }, { status: 201 });
  } catch (error) {
    console.error('[tasks/[id]/comments] POST error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to add comment';
    return NextResponse.json(
      { error: 'Internal', message: msg },
      { status: 500 }
    );
  }
}
