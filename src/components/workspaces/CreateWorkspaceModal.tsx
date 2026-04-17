'use client';

/**
 * Modal for creating a new workspace.
 *
 * Phase 3 adds the source picker:
 *   - "Пустая" (default)
 *   - "Из шаблона" — choose from `WORKSPACE_TEMPLATES` (Kanban / Retro / Mind-map)
 *   - "Дубликат существующей" — pick from the user's accessible workspaces
 *
 * The selected source is sent to `POST /api/workspaces` via the `templateId`
 * or `duplicateFrom` body field; the server seeds the snapshot at version 0.
 */

import { useCallback, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { InputField } from '@/components/ui/InputField';
import { useToast } from '@/components/ui/Toast';
import {
  useCreateWorkspace,
  useWorkspaceTemplates,
  useWorkspaces,
} from '@/hooks/useWorkspace';
import type { Workspace } from '@/types/workspace';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: (ws: Workspace) => void;
  /** Optional: prefill duplicate-from id (e.g. when triggered from a list-row "Дублировать" button). */
  initialDuplicateFromId?: number | null;
}

type SourceMode = 'empty' | 'template' | 'duplicate';

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

export function CreateWorkspaceModal({ open, onClose, onCreated, initialDuplicateFromId = null }: Props) {
  const [title, setTitle] = useState('');
  const [validation, setValidation] = useState<string | null>(null);
  const [sourceMode, setSourceMode] = useState<SourceMode>(initialDuplicateFromId ? 'duplicate' : 'empty');
  const [templateId, setTemplateId] = useState<string>('');
  const [duplicateFrom, setDuplicateFrom] = useState<number | null>(initialDuplicateFromId);
  const create = useCreateWorkspace();
  const templates = useWorkspaceTemplates();
  const workspaces = useWorkspaces();
  const { toast } = useToast();

  const submit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const trimmed = title.trim();
      if (!trimmed) {
        setValidation('Введите название доски');
        return;
      }
      if (sourceMode === 'template' && !templateId) {
        setValidation('Выберите шаблон');
        return;
      }
      if (sourceMode === 'duplicate' && !duplicateFrom) {
        setValidation('Выберите доску для дублирования');
        return;
      }
      setValidation(null);
      try {
        const payload =
          sourceMode === 'template'
            ? { title: trimmed, templateId }
            : sourceMode === 'duplicate'
              ? { title: trimmed, duplicateFrom: duplicateFrom! }
              : { title: trimmed };
        const ws = await create.mutateAsync(payload);
        toast('success', 'Доска создана');
        setTitle('');
        setTemplateId('');
        setDuplicateFrom(null);
        setSourceMode('empty');
        onCreated?.(ws);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Не удалось создать доску';
        toast('error', message);
      }
    },
    [title, sourceMode, templateId, duplicateFrom, create, toast, onCreated]
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
          <div className="space-y-1">
            <div className="text-small font-medium text-foreground">Источник</div>
            <div className="flex flex-wrap gap-2 text-xs">
              {(['empty', 'template', 'duplicate'] as const).map((m) => (
                <label key={m} className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="radio"
                    name="source-mode"
                    checked={sourceMode === m}
                    onChange={() => setSourceMode(m)}
                  />
                  {m === 'empty' ? 'Пустая' : m === 'template' ? 'Из шаблона' : 'Дубликат'}
                </label>
              ))}
            </div>
            {sourceMode === 'template' && (
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className="mt-2 w-full rounded-input border border-border bg-background px-2 py-1.5 text-small focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">— Выберите шаблон —</option>
                {templates.data?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} — {t.description}
                  </option>
                ))}
              </select>
            )}
            {sourceMode === 'duplicate' && (
              <select
                value={duplicateFrom ?? ''}
                onChange={(e) => setDuplicateFrom(e.target.value ? Number(e.target.value) : null)}
                className="mt-2 w-full rounded-input border border-border bg-background px-2 py-1.5 text-small focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">— Выберите доску —</option>
                {workspaces.data?.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.title}
                  </option>
                ))}
              </select>
            )}
          </div>
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
