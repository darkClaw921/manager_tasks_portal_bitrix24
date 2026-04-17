'use client';

/**
 * AI per-element edit dialog.
 *
 * Modal with a textarea (instruction) + collapsible JSON preview of the
 * element. Submit POSTs to `/api/workspaces/:id/ai/element` and resolves
 * the patch back to the host via `onApplyPatch`. The host wires it to
 * `commitOp({type:'update', id, patch})` so the patch applies through
 * the same realtime pipeline as a manual edit.
 *
 * Loading state disables the form. On AI error we surface the server
 * message inline (no toast — the dialog is the focus, the user is
 * waiting on it).
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import type { Element } from '@/types/workspace';

export interface AIEditDialogProps {
  open: boolean;
  workspaceId: number;
  element: Element | null;
  /** Called with the validated patch returned by the server. */
  onApplyPatch: (patch: Partial<Element>, explanation: string) => void;
  /** Close request (cancel button, Escape, backdrop click). */
  onClose: () => void;
}

interface ApiResponse {
  data?: { patch?: unknown; explanation?: unknown };
  message?: string;
  error?: string;
}

export function AIEditDialog({
  open,
  workspaceId,
  element,
  onApplyPatch,
  onClose,
}: AIEditDialogProps) {
  const [instruction, setInstruction] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Reset state on open / element change.
  useEffect(() => {
    if (open) {
      setInstruction('');
      setError(null);
      setShowJson(false);
      // Focus the textarea once mounted.
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [open, element?.id]);

  // Escape closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, isLoading, onClose]);

  const submit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!element) return;
      const trimmed = instruction.trim();
      if (!trimmed || isLoading) return;
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/ai/element`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            elementId: element.id,
            instruction: trimmed,
            element,
          }),
        });
        const json = (await res.json().catch(() => null)) as ApiResponse | null;
        if (!res.ok || !json?.data) {
          const msg = json?.message || `Ошибка ${res.status}`;
          throw new Error(msg);
        }
        const patch = (json.data.patch ?? {}) as Partial<Element>;
        const explanation =
          typeof json.data.explanation === 'string' ? json.data.explanation : '';
        onApplyPatch(patch, explanation);
        onClose();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Не удалось обработать инструкцию';
        setError(msg);
      } finally {
        setIsLoading(false);
      }
    },
    [element, instruction, isLoading, workspaceId, onApplyPatch, onClose]
  );

  const onKeyDownTextarea = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        const form = (e.target as HTMLTextAreaElement).form;
        if (form) form.requestSubmit();
      }
    },
    []
  );

  if (!open || !element) return null;

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 px-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && !isLoading) onClose();
      }}
    >
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-card bg-surface shadow-card border border-border p-4 space-y-3"
      >
        <header className="flex items-center justify-between">
          <h3 className="text-body font-semibold text-foreground">
            AI: изменить элемент
          </h3>
          <span className="text-xs text-text-secondary">{element.kind}</span>
        </header>
        <p className="text-small text-text-secondary">
          Опишите, что нужно изменить. AI вернёт патч — изменения применятся
          ко всем участникам.
        </p>
        <textarea
          ref={textareaRef}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={onKeyDownTextarea}
          placeholder="Например: «сделай шрифт крупнее и измени цвет на синий»"
          className="w-full resize-none rounded-input border border-border bg-background px-2 py-1.5 text-small text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
          rows={4}
          disabled={isLoading}
          maxLength={2000}
        />
        <div>
          <button
            type="button"
            onClick={() => setShowJson((v) => !v)}
            className="text-xs text-text-secondary underline-offset-2 hover:underline"
            disabled={isLoading}
          >
            {showJson ? 'Скрыть JSON' : 'Показать JSON элемента'}
          </button>
          {showJson && (
            <pre
              className={cn(
                'mt-1 max-h-40 overflow-auto rounded-input border border-border bg-background p-2 text-xs text-text-secondary'
              )}
            >
              {JSON.stringify(element, null, 2)}
            </pre>
          )}
        </div>
        {error && (
          <div className="rounded-card bg-red-50 px-3 py-2 text-small text-danger">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={isLoading}
          >
            Отмена
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={isLoading || instruction.trim().length === 0}
          >
            {isLoading ? 'Обработка…' : 'Применить'}
          </Button>
        </div>
      </form>
    </div>
  );
}
