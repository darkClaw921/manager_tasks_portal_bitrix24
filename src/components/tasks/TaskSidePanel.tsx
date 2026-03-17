'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useUIStore } from '@/stores/ui-store';
import { useTask, useAddComment } from '@/hooks/useTask';
import { sanitizeHtml } from '@/lib/utils/sanitize';
import { cn } from '@/lib/utils';
import { Avatar, Badge, PortalIndicator } from '@/components/ui';
import { Skeleton } from '@/components/ui/Skeleton';

// ==================== Label Maps ====================

const statusLabels: Record<string, string> = {
  NEW: 'Новая',
  PENDING: 'Ожидает',
  IN_PROGRESS: 'В работе',
  SUPPOSEDLY_COMPLETED: 'Условно завершена',
  COMPLETED: 'Завершена',
  DEFERRED: 'Отложена',
};

const statusVariants: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'primary'> = {
  NEW: 'primary',
  PENDING: 'warning',
  IN_PROGRESS: 'primary',
  SUPPOSEDLY_COMPLETED: 'warning',
  COMPLETED: 'success',
  DEFERRED: 'default',
};

const priorityLabels: Record<string, string> = {
  '0': 'Низкий',
  '1': 'Средний',
  '2': 'Высокий',
};

const priorityVariants: Record<string, 'default' | 'success' | 'warning' | 'danger'> = {
  '0': 'default',
  '1': 'warning',
  '2': 'danger',
};

// ==================== Helpers ====================

function formatDeadline(dateStr: string | null): string {
  if (!dateStr) return 'Не указан';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'только что';
  if (diffMins < 60) return `${diffMins} мин. назад`;
  if (diffHours < 24) return `${diffHours} ч. назад`;
  if (diffDays < 7) return `${diffDays} дн. назад`;

  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
  });
}

function isOverdue(deadline: string | null, status: string): boolean {
  if (!deadline) return false;
  if (status === 'COMPLETED' || status === 'DEFERRED') return false;
  return new Date(deadline) < new Date();
}

// ==================== Icons ====================

function CloseIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
    </svg>
  );
}

// ==================== Component ====================

const INITIAL_COMMENTS_COUNT = 5;

export function TaskSidePanel() {
  const sidePanelTaskId = useUIStore((s) => s.sidePanelTaskId);
  const closeSidePanel = useUIStore((s) => s.closeSidePanel);

  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showAllComments, setShowAllComments] = useState(false);
  const [commentText, setCommentText] = useState('');

  const commentsEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: task, isLoading } = useTask(sidePanelTaskId);
  const addComment = useAddComment();

  // Mount/unmount animation logic
  useEffect(() => {
    if (sidePanelTaskId !== null) {
      setMounted(true);
      setShowAllComments(false);
      setCommentText('');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setVisible(true);
        });
      });
    } else {
      setVisible(false);
      const timer = setTimeout(() => {
        setMounted(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [sidePanelTaskId]);

  // Escape key handler
  const handleClose = useCallback(() => {
    closeSidePanel();
  }, [closeSidePanel]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose();
    }
    if (mounted) {
      document.addEventListener('keydown', onKeyDown);
      return () => document.removeEventListener('keydown', onKeyDown);
    }
  }, [mounted, handleClose]);

  // Scroll to bottom when comments load
  useEffect(() => {
    if (task?.comments && commentsEndRef.current) {
      commentsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [task?.comments?.length]);

  // Handle comment submission
  const handleSendComment = useCallback(() => {
    if (!commentText.trim() || !sidePanelTaskId || addComment.isPending) return;

    addComment.mutate(
      { taskId: sidePanelTaskId, message: commentText.trim() },
      {
        onSuccess: () => {
          setCommentText('');
          setTimeout(() => {
            commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          }, 100);
        },
      }
    );
  }, [commentText, sidePanelTaskId, addComment]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendComment();
      }
    },
    [handleSendComment]
  );

  if (!mounted) return null;

  const allComments = task?.comments ?? [];
  const visibleComments = showAllComments
    ? allComments
    : allComments.slice(-INITIAL_COMMENTS_COUNT);
  const hasMoreComments = allComments.length > INITIAL_COMMENTS_COUNT;
  const overdue = task ? isOverdue(task.deadline, task.status) : false;

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 bg-black/50 z-40 transition-opacity duration-300',
          visible ? 'opacity-100' : 'opacity-0'
        )}
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className={cn(
          'fixed top-0 right-0 h-full w-full sm:w-[480px] bg-surface z-50 shadow-xl',
          'flex flex-col',
          'transition-transform duration-300 ease-in-out',
          visible ? 'translate-x-0' : 'translate-x-full'
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Task side panel"
      >
        {/* ===== Header ===== */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-border shrink-0">
          <div className="flex-1 min-w-0 space-y-1">
            {isLoading ? (
              <>
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-5 w-48" />
              </>
            ) : task ? (
              <>
                <div className="flex items-center gap-1.5">
                  <PortalIndicator color={task.portalColor} size="sm" />
                  <span className="text-xs font-medium text-text-secondary truncate">
                    {task.portalName || task.portalDomain}
                  </span>
                </div>
                <h2 className="text-base font-semibold text-foreground leading-snug line-clamp-2">
                  {task.title}
                </h2>
              </>
            ) : (
              <h2 className="text-base font-semibold text-foreground">Задача</h2>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {sidePanelTaskId && (
              <Link
                href={`/tasks/${sidePanelTaskId}`}
                onClick={handleClose}
                className="flex items-center justify-center w-8 h-8 rounded-input bg-background hover:bg-border transition-colors text-text-secondary hover:text-foreground"
                aria-label="Открыть полностью"
              >
                <EditIcon />
              </Link>
            )}
            <button
              onClick={handleClose}
              className="flex items-center justify-center w-8 h-8 rounded-input bg-background hover:bg-border transition-colors text-text-secondary hover:text-foreground"
              aria-label="Закрыть панель"
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        {/* ===== Scrollable Body ===== */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-6 space-y-5">
            {isLoading ? (
              <SidePanelSkeleton />
            ) : task ? (
              <>
                {/* Description */}
                {(task.description || task.descriptionHtml) && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-text-secondary tracking-wide">Описание</p>
                    <div
                      className="text-sm text-text-secondary leading-relaxed break-words [&_a]:text-primary [&_a]:underline"
                      dangerouslySetInnerHTML={{
                        __html: sanitizeHtml(task.descriptionHtml || task.description || ''),
                      }}
                    />
                  </div>
                )}

                {/* Meta Grid */}
                <div className="rounded-card border border-border overflow-hidden">
                  {/* Статус */}
                  <MetaRow label="Статус" borderBottom>
                    <Badge variant={statusVariants[task.status] ?? 'default'} size="sm">
                      {statusLabels[task.status] ?? task.status}
                    </Badge>
                  </MetaRow>

                  {/* Исполнитель */}
                  <MetaRow label="Исполнитель" borderBottom>
                    <div className="flex items-center gap-2">
                      {task.responsibleName && (
                        <Avatar name={task.responsibleName} src={task.responsiblePhoto} size="sm" />
                      )}
                      <span className="text-[13px] font-medium text-foreground">
                        {task.responsibleName || 'Не назначен'}
                      </span>
                    </div>
                  </MetaRow>

                  {/* Приоритет */}
                  <MetaRow label="Приоритет" borderBottom>
                    <Badge variant={priorityVariants[task.priority] ?? 'default'} size="sm">
                      {priorityLabels[task.priority] ?? task.priority}
                    </Badge>
                  </MetaRow>

                  {/* Крайний срок */}
                  <MetaRow label="Крайний срок" borderBottom>
                    <div className={cn('flex items-center gap-1.5 text-[13px] font-medium', overdue ? 'text-danger' : 'text-foreground')}>
                      <CalendarIcon />
                      <span>{formatDeadline(task.deadline)}</span>
                    </div>
                  </MetaRow>

                  {/* Постановщик */}
                  <MetaRow label="Постановщик">
                    <div className="flex items-center gap-2">
                      {task.creatorName && (
                        <Avatar name={task.creatorName} src={task.creatorPhoto} size="sm" />
                      )}
                      <span className="text-[13px] font-medium text-foreground">
                        {task.creatorName || 'Неизвестен'}
                      </span>
                    </div>
                  </MetaRow>
                </div>

                {/* Bitrix24 Link */}
                {task.bitrixUrl && (
                  <a
                    href={task.bitrixUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-primary hover:text-primary/80 text-xs font-medium transition-colors"
                  >
                    <ExternalLinkIcon />
                    Открыть в Bitrix24
                  </a>
                )}

                {/* Activity / Comments */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-text-secondary tracking-wide">Активность</p>

                  {allComments.length === 0 ? (
                    <p className="text-sm text-text-secondary py-2">Комментариев пока нет</p>
                  ) : (
                    <div className="space-y-3">
                      {/* Load earlier */}
                      {hasMoreComments && !showAllComments && (
                        <button
                          onClick={() => setShowAllComments(true)}
                          className="w-full text-center text-xs text-primary hover:text-primary/80 py-1.5 transition-colors"
                        >
                          Показать ранние ({allComments.length - INITIAL_COMMENTS_COUNT})
                        </button>
                      )}

                      {visibleComments.map((comment) => (
                        <div key={comment.id} className="flex gap-2.5">
                          <Avatar
                            name={comment.authorName ?? 'Unknown'}
                            src={comment.authorPhoto}
                            size="sm"
                            className="shrink-0 mt-0.5"
                          />
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-baseline gap-2">
                              <span className="text-[13px] font-semibold text-foreground">
                                {comment.authorName ?? 'Unknown'}
                              </span>
                              <span className="text-xs text-text-secondary whitespace-nowrap">
                                {formatRelativeTime(comment.postDate)}
                              </span>
                            </div>
                            {comment.postMessage && (
                              <div
                                className="text-[13px] text-text-secondary leading-snug break-words [&_a]:text-primary [&_a]:underline"
                                dangerouslySetInnerHTML={{
                                  __html: sanitizeHtml(comment.postMessage),
                                }}
                              />
                            )}
                          </div>
                        </div>
                      ))}

                      <div ref={commentsEndRef} />
                    </div>
                  )}
                </div>

                {/* Comment Input */}
                <div
                  className="flex items-center gap-2 px-4 py-3 rounded-input border border-border bg-surface cursor-text"
                  onClick={() => inputRef.current?.focus()}
                >
                  <input
                    ref={inputRef}
                    type="text"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Написать комментарий..."
                    className="flex-1 bg-transparent text-[13px] text-foreground placeholder:text-text-secondary outline-none"
                    disabled={!sidePanelTaskId || isLoading}
                  />
                  <button
                    onClick={handleSendComment}
                    disabled={!commentText.trim() || addComment.isPending || !sidePanelTaskId}
                    className={cn(
                      'shrink-0 text-primary transition-colors',
                      (!commentText.trim() || addComment.isPending) && 'opacity-40 cursor-not-allowed'
                    )}
                    aria-label="Отправить комментарий"
                  >
                    <SendIcon />
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

// ==================== Sub-components ====================

function MetaRow({
  label,
  children,
  borderBottom = false,
}: {
  label: string;
  children: React.ReactNode;
  borderBottom?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center px-4 py-3',
        borderBottom && 'border-b border-border'
      )}
    >
      <span className="text-[13px] font-medium text-text-secondary w-[120px] shrink-0">
        {label}
      </span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function SidePanelSkeleton() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <div className="rounded-card border border-border overflow-hidden">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={cn('flex items-center px-4 py-3', i < 5 && 'border-b border-border')}>
            <Skeleton className="h-4 w-[100px]" />
            <Skeleton className="h-5 w-24 ml-5" />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        <Skeleton className="h-3 w-20" />
        {[1, 2].map((i) => (
          <div key={i} className="flex gap-2.5">
            <Skeleton className="h-7 w-7 rounded-full shrink-0" />
            <div className="space-y-1 flex-1">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-4 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
