'use client';

import { useState, type FormEvent } from 'react';
import {
  useAddChecklistItem,
  useToggleChecklistItem,
  useDeleteChecklistItem,
} from '@/hooks/useTask';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import type { TaskChecklistItem } from '@/types';

export interface ChecklistProps {
  taskId: number;
  items: TaskChecklistItem[];
}

function PlusIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
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

export function Checklist({ taskId, items }: ChecklistProps) {
  const [newTitle, setNewTitle] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  const addItem = useAddChecklistItem();
  const toggleItem = useToggleChecklistItem();
  const deleteItem = useDeleteChecklistItem();

  const completedCount = items.filter((i) => i.isComplete).length;
  const totalCount = items.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;

    addItem.mutate(
      { taskId, title: newTitle.trim() },
      {
        onSuccess: () => {
          setNewTitle('');
          setShowAddForm(false);
        },
      }
    );
  }

  function handleToggle(item: TaskChecklistItem) {
    toggleItem.mutate({
      taskId,
      itemId: item.id,
      isComplete: !item.isComplete,
    });
  }

  function handleDelete(item: TaskChecklistItem) {
    deleteItem.mutate({ taskId, itemId: item.id });
  }

  return (
    <div className="space-y-3">
      {/* Header with progress */}
      <div className="flex items-center justify-between">
        <h3 className="text-h3 font-semibold text-foreground">
          Чек-лист
          {totalCount > 0 && (
            <span className="text-text-secondary font-normal ml-2">
              {completedCount}/{totalCount}
            </span>
          )}
        </h3>
        <button
          type="button"
          onClick={() => setShowAddForm(!showAddForm)}
          className="text-primary hover:text-primary/80 transition-colors"
          aria-label="Добавить пункт"
        >
          <PlusIcon />
        </button>
      </div>

      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="w-full bg-border rounded-full h-2 overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-300',
              progressPercent === 100 ? 'bg-success' : 'bg-primary'
            )}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      {/* Checklist items */}
      {items.length === 0 && !showAddForm ? (
        <p className="text-small text-text-muted py-2">Чек-лист пуст</p>
      ) : (
        <div className="space-y-1">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2 group py-1.5 px-2 -mx-2 rounded-input hover:bg-background transition-colors"
            >
              <button
                type="button"
                onClick={() => handleToggle(item)}
                className={cn(
                  'shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors',
                  item.isComplete
                    ? 'bg-success border-success'
                    : 'border-border hover:border-primary'
                )}
                aria-label={item.isComplete ? 'Снять отметку' : 'Отметить'}
              >
                {item.isComplete && (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-3 h-3 text-white">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                )}
              </button>
              <span
                className={cn(
                  'flex-1 text-body',
                  item.isComplete
                    ? 'text-text-muted line-through'
                    : 'text-foreground'
                )}
              >
                {item.title}
              </span>
              <button
                type="button"
                onClick={() => handleDelete(item)}
                className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-danger transition-all shrink-0"
                aria-label="Удалить"
              >
                <TrashIcon />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add new item form */}
      {showAddForm && (
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Новый пункт..."
            className="flex-1 rounded-input border border-border bg-surface px-3 py-2 text-body text-foreground placeholder:text-text-muted outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
            autoFocus
          />
          <Button
            type="submit"
            variant="primary"
            size="sm"
            loading={addItem.isPending}
            disabled={!newTitle.trim()}
          >
            Добавить
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setShowAddForm(false);
              setNewTitle('');
            }}
          >
            Отмена
          </Button>
        </form>
      )}
    </div>
  );
}
