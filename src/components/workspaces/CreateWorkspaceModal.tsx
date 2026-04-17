'use client';

/**
 * Modal for creating a new workspace.
 *
 * Phase 1: only `title` is collected. The optional `meetingId` field will be
 * exposed in Phase 2 once the "attach to meeting" flow exists.
 */

import { useCallback, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { InputField } from '@/components/ui/InputField';
import { useToast } from '@/components/ui/Toast';
import { useCreateWorkspace } from '@/hooks/useWorkspace';
import type { Workspace } from '@/types/workspace';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: (ws: Workspace) => void;
}

function CloseIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      className="w-5 h-5"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}

export function CreateWorkspaceModal({ open, onClose, onCreated }: Props) {
  const [title, setTitle] = useState('');
  const [validation, setValidation] = useState<string | null>(null);
  const create = useCreateWorkspace();
  const { toast } = useToast();

  const submit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const trimmed = title.trim();
      if (!trimmed) {
        setValidation('Введите название доски');
        return;
      }
      setValidation(null);
      try {
        const ws = await create.mutateAsync({ title: trimmed });
        toast('success', 'Доска создана');
        setTitle('');
        onCreated?.(ws);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Не удалось создать доску';
        toast('error', message);
      }
    },
    [title, create, toast, onCreated]
  );

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-40"
        aria-hidden="true"
        onClick={onClose}
      />
      <div className="fixed inset-x-4 top-20 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-md bg-surface rounded-modal shadow-xl z-50 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-h3 font-semibold text-foreground">Новая доска</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-text-secondary hover:text-foreground rounded-input hover:bg-background"
            aria-label="Закрыть"
          >
            <CloseIcon />
          </button>
        </div>
        <form onSubmit={submit} className="px-5 py-4 space-y-4">
          <InputField
            label="Название"
            placeholder="Например, «Мозговой штурм Q3»"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (validation) setValidation(null);
            }}
            error={validation ?? undefined}
            autoFocus
            maxLength={200}
          />
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={create.isPending}>
              Отмена
            </Button>
            <Button type="submit" variant="primary" disabled={create.isPending}>
              {create.isPending ? 'Создание…' : 'Создать'}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
