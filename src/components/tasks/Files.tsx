'use client';

/**
 * Секция «Вложения» у TaskDetail.
 *
 *  - Для задачи Bitrix24: рендерится как раньше — список с `downloadUrl`
 *    (без upload/delete кнопок, потому что мы не умеем загружать файлы
 *    в Bitrix24 из нашего UI).
 *  - Для локальной задачи (`isLocal`): используем useTaskFiles/useUpload/
 *    useDelete хуки, показываем кнопку «Добавить файл» и кнопку «Удалить»
 *    (автор файла или админ портала/глобальный).
 *
 * Иконка выбирается по MIME-префиксу.
 */

import { useRef, useState, type ChangeEvent } from 'react';
import type { TaskFile } from '@/types';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import {
  useTaskFiles,
  useUploadTaskFile,
  useDeleteTaskFile,
} from '@/hooks/useTaskFiles';

export interface FilesProps {
  /** Passthrough: изначальный список из task?.files (для Bitrix24 или SSR). */
  files: TaskFile[];
  /** ID задачи — нужен для локальной ветки (upload/delete/stream download). */
  taskId?: number;
  /** Локальная ли задача (portalDomain === 'local'). */
  isLocal?: boolean;
  /** ID текущего юзера — для проверки «могу ли я удалять». */
  currentUserId?: number | null;
  /** Глобальный админ (из /api/auth/me) — может удалять любые файлы. */
  isAdmin?: boolean;
}

function FileIcon({ mime }: { mime?: string | null }) {
  // Лёгкая MIME-классификация — достаточно для иконки.
  const m = (mime || '').toLowerCase();
  const kind: 'image' | 'pdf' | 'archive' | 'generic' =
    m.startsWith('image/')
      ? 'image'
      : m === 'application/pdf'
        ? 'pdf'
        : m.includes('zip') || m.includes('rar') || m.includes('7z') || m.includes('tar')
          ? 'archive'
          : 'generic';

  const commonProps = {
    xmlns: 'http://www.w3.org/2000/svg',
    fill: 'none',
    viewBox: '0 0 24 24',
    strokeWidth: 1.5,
    stroke: 'currentColor',
    className: 'w-5 h-5',
  } as const;

  if (kind === 'image') {
    return (
      <svg {...commonProps}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
      </svg>
    );
  }
  if (kind === 'pdf') {
    return (
      <svg {...commonProps}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      </svg>
    );
  }
  if (kind === 'archive') {
    return (
      <svg {...commonProps}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
      </svg>
    );
  }
  return (
    <svg {...commonProps}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
  );
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function Files({
  files: initialFiles,
  taskId,
  isLocal = false,
  currentUserId = null,
  isAdmin = false,
}: FilesProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  // Локальная ветка: берём живые данные через useTaskFiles. Для Bitrix24 —
  // просто рендерим initialFiles (тот же путь что и до Phase 4).
  const shouldQueryLive = isLocal && typeof taskId === 'number';
  const liveQuery = useTaskFiles(shouldQueryLive ? taskId! : null);
  const files: TaskFile[] = shouldQueryLive
    ? (liveQuery.data ?? initialFiles)
    : initialFiles;

  const uploadMut = useUploadTaskFile(taskId ?? 0);
  const deleteMut = useDeleteTaskFile(taskId ?? 0);

  async function handleFilesPicked(e: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (picked.length === 0 || !taskId) return;
    setUploading(true);
    const failed: string[] = [];
    for (const f of picked) {
      try {
        await uploadMut.mutateAsync(f);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown';
        failed.push(`${f.name}: ${msg}`);
      }
    }
    setUploading(false);
    if (failed.length > 0) {
      toast('error', `Не удалось загрузить: ${failed.join('; ')}`);
    } else {
      toast('success', picked.length === 1 ? 'Файл загружен' : `Загружено файлов: ${picked.length}`);
    }
  }

  async function handleDelete(file: TaskFile) {
    if (!taskId) return;
    if (!confirm(`Удалить файл «${file.name}»?`)) return;
    try {
      await deleteMut.mutateAsync(file.id);
      toast('success', 'Файл удалён');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ошибка';
      toast('error', msg);
    }
  }

  function canDelete(file: TaskFile): boolean {
    if (!isLocal) return false;
    if (isAdmin) return true;
    if (currentUserId != null && file.uploadedBy === currentUserId) return true;
    return false;
  }

  function downloadHref(file: TaskFile): string | null {
    // Bitrix-sync: используем downloadUrl как раньше.
    if (file.downloadUrl) return file.downloadUrl;
    // Локальный: стрим-роут.
    if (isLocal && taskId) {
      return `/api/tasks/${taskId}/files/${file.id}`;
    }
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-h3 font-semibold text-foreground">
          Вложения
          {files.length > 0 && (
            <span className="text-text-secondary font-normal ml-2">
              ({files.length})
            </span>
          )}
        </h3>
        {isLocal && taskId != null && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFilesPicked}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              loading={uploading}
            >
              Добавить файл
            </Button>
          </>
        )}
      </div>

      {files.length === 0 ? (
        <p className="text-small text-text-muted py-2">Нет вложений</p>
      ) : (
        <div className="space-y-2">
          {files.map((file) => {
            const href = downloadHref(file);
            const mimeForIcon = file.mimeType || file.contentType;
            return (
              <div
                key={file.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-card bg-background group"
              >
                <div className="shrink-0 text-text-muted">
                  <FileIcon mime={mimeForIcon} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-body text-foreground font-medium truncate">
                    {file.name}
                  </p>
                  <div className="flex items-center gap-2">
                    {(file.size || file.fileSize) && (
                      <span className="text-xs text-text-muted">
                        {formatFileSize(file.size ?? file.fileSize)}
                      </span>
                    )}
                    {mimeForIcon && (
                      <span className="text-xs text-text-muted">
                        {mimeForIcon}
                      </span>
                    )}
                  </div>
                </div>
                {href && (
                  <a
                    href={href}
                    target={file.downloadUrl ? '_blank' : undefined}
                    rel={file.downloadUrl ? 'noopener noreferrer' : undefined}
                    className="shrink-0 p-1.5 text-text-muted hover:text-primary transition-colors rounded-input hover:bg-surface"
                    title="Скачать"
                  >
                    <DownloadIcon />
                  </a>
                )}
                {canDelete(file) && (
                  <button
                    type="button"
                    onClick={() => handleDelete(file)}
                    className="shrink-0 p-1.5 text-text-muted hover:text-danger transition-colors rounded-input hover:bg-surface"
                    title="Удалить"
                    disabled={deleteMut.isPending}
                  >
                    <TrashIcon />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
