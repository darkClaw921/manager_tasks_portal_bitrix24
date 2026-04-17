'use client';

import { useState, useEffect, useRef, type FormEvent, type ChangeEvent } from 'react';
import { useAddComment } from '@/hooks/useTask';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import type { TaskComment, CommentFile } from '@/types';
import { sanitizeHtml } from '@/lib/utils/sanitize';

export interface CommentsProps {
  taskId: number;
  comments: TaskComment[];
  /** Локальная ли задача — включает прикрепление файлов в форме. */
  isLocal?: boolean;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function PaperclipIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 shrink-0">
      <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
    </svg>
  );
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function CommentFiles({
  files,
  taskId,
}: {
  files: CommentFile[];
  taskId: number;
}) {
  return (
    <div className="mt-2 space-y-1">
      {files.map((file) => {
        // Для Bitrix-sync — downloadUrl есть. Для локальных (string id, нет
        // downloadUrl) — используем новый stream-роут.
        const href =
          file.downloadUrl ||
          (file.filePath || typeof file.id === 'string'
            ? `/api/tasks/${taskId}/comments/files/${file.id}`
            : null);
        return (
          <div key={String(file.id)} className="flex items-center gap-2 text-small">
            <PaperclipIcon />
            {href ? (
              <a
                href={href}
                target={file.downloadUrl ? '_blank' : undefined}
                rel={file.downloadUrl ? 'noopener noreferrer' : undefined}
                className="text-primary hover:underline truncate"
              >
                {file.name}
              </a>
            ) : (
              <span className="text-text-secondary truncate">{file.name}</span>
            )}
            {file.size != null && file.size > 0 && (
              <span className="text-xs text-text-muted shrink-0">
                {formatFileSize(file.size)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SendIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}

export function Comments({ taskId, comments, isLocal = false }: CommentsProps) {
  const [message, setMessage] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const addComment = useAddComment();
  const commentsContainerRef = useRef<HTMLDivElement>(null);

  // Scroll to the bottom when comments load or new comment is added
  useEffect(() => {
    const container = commentsContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [comments.length]);

  function handleFilesPicked(e: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length > 0) {
      setPendingFiles((prev) => [...prev, ...picked]);
    }
    e.target.value = '';
  }

  function removePendingFile(index: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed && pendingFiles.length === 0) return;

    addComment.mutate(
      {
        taskId,
        message: trimmed,
        files: pendingFiles.length > 0 ? pendingFiles : undefined,
      },
      {
        onSuccess: () => {
          setMessage('');
          setPendingFiles([]);
        },
      }
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-h3 font-semibold text-foreground">
        Комментарии
        {comments.length > 0 && (
          <span className="text-text-secondary font-normal ml-2">
            ({comments.length})
          </span>
        )}
      </h3>

      {/* Comment list — scrollable container */}
      <div ref={commentsContainerRef} className="max-h-[500px] overflow-y-auto rounded-lg border border-border">
        {comments.length === 0 ? (
          <p className="text-small text-text-muted py-4 px-3">Комментариев пока нет</p>
        ) : (
          <div className="space-y-3 p-3">
            {comments.map((comment) => (
              <div
                key={comment.id}
                className="flex gap-3 p-3 rounded-card bg-background"
              >
                <Avatar
                  name={comment.authorName || 'Unknown'}
                  src={comment.authorPhoto}
                  size="sm"
                  className="shrink-0 mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-small font-medium text-foreground">
                      {comment.authorName || 'Unknown'}
                    </span>
                    <span className="text-xs text-text-muted">
                      {formatDate(comment.postDate)}
                    </span>
                  </div>
                  {comment.postMessage && (
                    <div
                      className="text-body text-text-secondary break-words"
                      dangerouslySetInnerHTML={{
                        __html: sanitizeHtml(comment.postMessage),
                      }}
                    />
                  )}
                  {comment.attachedFiles && comment.attachedFiles.length > 0 && (
                    <CommentFiles files={comment.attachedFiles} taskId={taskId} />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pending file previews — показываем перед формой */}
      {pendingFiles.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {pendingFiles.map((f, idx) => (
            <span
              key={`${f.name}-${idx}`}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-background border border-border text-small text-foreground"
            >
              <PaperclipIcon />
              <span className="truncate max-w-[160px]">{f.name}</span>
              <span className="text-xs text-text-muted">
                {formatFileSize(f.size)}
              </span>
              <button
                type="button"
                onClick={() => removePendingFile(idx)}
                className="p-0.5 rounded-full text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors"
                aria-label="Убрать"
              >
                <CloseIcon />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Add comment form */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        {isLocal && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFilesPicked}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2 rounded-input border border-border bg-surface text-text-secondary hover:text-primary hover:border-primary transition-colors"
              title="Прикрепить файлы"
              aria-label="Прикрепить файлы"
            >
              <PaperclipIcon />
            </button>
          </>
        )}
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Написать комментарий..."
          className="flex-1 rounded-input border border-border bg-surface px-3 py-2 text-body text-foreground placeholder:text-text-muted outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        <Button
          type="submit"
          variant="primary"
          size="sm"
          loading={addComment.isPending}
          disabled={!message.trim() && pendingFiles.length === 0}
        >
          <SendIcon />
        </Button>
      </form>
    </div>
  );
}
