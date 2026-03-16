'use client';

import { useState, type FormEvent } from 'react';
import { useAddComment } from '@/hooks/useTask';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import type { TaskComment } from '@/types';

export interface CommentsProps {
  taskId: number;
  comments: TaskComment[];
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

function SendIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
    </svg>
  );
}

export function Comments({ taskId, comments }: CommentsProps) {
  const [message, setMessage] = useState('');
  const addComment = useAddComment();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;

    addComment.mutate(
      { taskId, message: message.trim() },
      {
        onSuccess: () => {
          setMessage('');
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

      {/* Comment list */}
      {comments.length === 0 ? (
        <p className="text-small text-text-muted py-4">Комментариев пока нет</p>
      ) : (
        <div className="space-y-3">
          {comments.map((comment) => (
            <div
              key={comment.id}
              className="flex gap-3 p-3 rounded-card bg-background"
            >
              <Avatar
                name={comment.authorName || 'Unknown'}
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
                <div
                  className="text-body text-text-secondary break-words"
                  dangerouslySetInnerHTML={{
                    __html: comment.postMessage || '',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add comment form */}
      <form onSubmit={handleSubmit} className="flex gap-2">
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
          disabled={!message.trim()}
        >
          <SendIcon />
        </Button>
      </form>
    </div>
  );
}
