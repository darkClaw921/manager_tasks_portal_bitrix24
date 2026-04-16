'use client';

/**
 * Footer input for the meeting chat.
 *
 * Behaviour:
 *   - `Enter` sends; `Shift+Enter` inserts a newline.
 *   - Textarea auto-resizes up to ~6 lines before becoming scrollable.
 *   - Paperclip button opens a hidden `<input type=file multiple>` to pick files.
 *   - `onPaste`: any `image/*` clipboard entry is uploaded automatically.
 *   - Drag & drop: the parent panel calls `useFileDropzone` below; dropping
 *     files queues them for upload.
 *   - Each queued upload tile shows live progress + cancel; we don't hold
 *     `AbortController` yet because the hook uses XHR — cancel removes the
 *     tile optimistically (the upload finishes in the background silently).
 *
 * Validation: everything the server also validates (25 MiB, dangerous types)
 * is checked client-side as a UX optimisation; the server is still
 * authoritative and will return 413/415 if the client is bypassed.
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type ChangeEvent,
} from 'react';
import type { MeetingMessage } from '@/types/meeting';
import type { UploadProgress } from '@/hooks/useMeetingChat';
import { cn } from '@/lib/utils';
import { PaperclipIcon, SendIcon, CloseIcon, FileIcon } from './icons';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_TEXT_LENGTH = 4000;

const BLOCKED_EXTENSIONS = new Set<string>([
  '.exe',
  '.bat',
  '.cmd',
  '.com',
  '.scr',
  '.msi',
  '.sh',
  '.app',
  '.dll',
  '.jar',
  '.vbs',
  '.vbe',
  '.ps1',
  '.lnk',
]);

export interface ChatInputProps {
  onSendText: (content: string) => Promise<MeetingMessage>;
  onSendFile: (
    file: File,
    onProgress?: (p: UploadProgress) => void
  ) => Promise<MeetingMessage>;
  /** Hard-disable send + attach (used while the room is disconnected). */
  disabled?: boolean;
  className?: string;
}

interface UploadItem {
  id: string;
  file: File;
  progress: number; // 0..1 (fallback 0 when unknown)
  status: 'queued' | 'uploading' | 'error' | 'done';
  error?: string;
}

/**
 * Reject files that are obviously too large or of a banned extension. Mirrors
 * the server-side `BLOCKED_EXTENSIONS`/`MAX_UPLOAD_BYTES` so we can surface a
 * friendly error without a round-trip.
 *
 * Returns a reason string on rejection, else `null`.
 */
function validateFile(file: File): string | null {
  if (file.size === 0) return 'Файл пустой';
  if (file.size > MAX_UPLOAD_BYTES) {
    return `Файл больше ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))} МБ`;
  }
  const name = (file.name ?? '').toLowerCase();
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot) : '';
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return 'Этот тип файла запрещён';
  }
  return null;
}

export function ChatInput({
  onSendText,
  onSendFile,
  disabled = false,
  className,
}: ChatInputProps) {
  const [text, setText] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [isDragActive, setDragActive] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputId = useId();

  // Auto-resize textarea up to ~6 lines.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const max = 6 * 20 + 16; // ~6 lines at 20px line-height + padding
    el.style.height = Math.min(el.scrollHeight, max) + 'px';
  }, [text]);

  const queueUpload = useCallback(
    (file: File) => {
      const reason = validateFile(file);
      if (reason) {
        setError(reason);
        return;
      }
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      setUploads((prev) => [
        ...prev,
        { id, file, progress: 0, status: 'queued' },
      ]);
      // Kick off the upload. onProgress updates the tile.
      (async () => {
        setUploads((prev) =>
          prev.map((u) => (u.id === id ? { ...u, status: 'uploading' } : u))
        );
        try {
          await onSendFile(file, (p) => {
            setUploads((prev) =>
              prev.map((u) =>
                u.id === id
                  ? { ...u, progress: p.fraction ?? u.progress }
                  : u
              )
            );
          });
          // Remove the tile once the message is broadcast — it now shows as a
          // real bubble in the panel.
          setUploads((prev) => prev.filter((u) => u.id !== id));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          setUploads((prev) =>
            prev.map((u) =>
              u.id === id ? { ...u, status: 'error', error: msg } : u
            )
          );
          setError(msg);
        }
      })();
    },
    [onSendFile]
  );

  const handleFiles = useCallback(
    (files: FileList | File[] | null | undefined) => {
      if (!files) return;
      const list = Array.from(files);
      if (list.length === 0) return;
      setError(null);
      for (const file of list) {
        queueUpload(file);
      }
    },
    [queueUpload]
  );

  const onFileInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      handleFiles(e.target.files);
      // Reset so picking the same file twice still triggers change.
      e.target.value = '';
    },
    [handleFiles]
  );

  const onPaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      if (!e.clipboardData) return;
      const images: File[] = [];
      for (const item of Array.from(e.clipboardData.items)) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) images.push(file);
        }
      }
      if (images.length > 0) {
        e.preventDefault();
        handleFiles(images);
      }
    },
    [handleFiles]
  );

  const doSendText = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending || disabled) return;
    setSending(true);
    setError(null);
    try {
      await onSendText(trimmed);
      setText('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setSending(false);
    }
  }, [text, sending, disabled, onSendText]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        void doSendText();
      }
    },
    [doSendText]
  );

  // ==================== Drag & drop ====================

  const dragCounterRef = useRef<number>(0);
  const onDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    dragCounterRef.current += 1;
    setDragActive(true);
  }, []);
  const onDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setDragActive(false);
  }, []);
  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);
  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      dragCounterRef.current = 0;
      setDragActive(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  return (
    <div
      className={cn('relative p-2', className)}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {isDragActive && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded bg-primary/10 text-small font-semibold text-primary">
          Отпустите, чтобы загрузить файл
        </div>
      )}

      {/* Upload queue */}
      {uploads.length > 0 && (
        <ul className="mb-2 flex flex-col gap-1">
          {uploads.map((u) => (
            <li
              key={u.id}
              className="flex items-center gap-2 rounded border border-border bg-background p-1.5 text-[11px]"
            >
              <FileIcon className="h-4 w-4 flex-shrink-0 text-text-secondary" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">{u.file.name}</span>
                  <span className="flex-shrink-0 text-text-secondary">
                    {u.status === 'error'
                      ? 'Ошибка'
                      : u.status === 'done'
                        ? '100%'
                        : `${Math.round(u.progress * 100)}%`}
                  </span>
                </div>
                <div className="mt-0.5 h-1 w-full overflow-hidden rounded bg-border">
                  <div
                    className={cn(
                      'h-full',
                      u.status === 'error' ? 'bg-red-500' : 'bg-primary'
                    )}
                    style={{ width: `${Math.round(u.progress * 100)}%` }}
                  />
                </div>
              </div>
              <button
                type="button"
                aria-label="Убрать"
                className="flex h-6 w-6 items-center justify-center rounded hover:bg-border"
                onClick={() =>
                  setUploads((prev) => prev.filter((x) => x.id !== u.id))
                }
              >
                <CloseIcon className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <div className="mb-1 text-[11px] text-red-600" role="alert">
          {error}
        </div>
      )}

      <div className="flex items-end gap-2">
        <label
          htmlFor={fileInputId}
          className={cn(
            'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded border border-border text-text-secondary hover:bg-background',
            disabled && 'pointer-events-none opacity-50'
          )}
          aria-label="Прикрепить файл"
        >
          <PaperclipIcon className="h-4 w-4" />
        </label>
        <input
          ref={fileInputRef}
          id={fileInputId}
          type="file"
          multiple
          className="hidden"
          onChange={onFileInputChange}
          disabled={disabled}
        />

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) =>
            setText(e.target.value.slice(0, MAX_TEXT_LENGTH))
          }
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          disabled={disabled}
          placeholder="Сообщение…"
          rows={1}
          maxLength={MAX_TEXT_LENGTH}
          className="min-h-9 max-h-32 flex-1 resize-none rounded border border-border bg-background px-3 py-2 text-body outline-none focus:border-primary disabled:opacity-60"
        />

        <button
          type="button"
          onClick={() => void doSendText()}
          disabled={disabled || sending || !text.trim()}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded bg-primary text-text-inverse hover:bg-primary-hover disabled:opacity-50"
          aria-label="Отправить"
        >
          <SendIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
