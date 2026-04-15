'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { InputField } from '@/components/ui/InputField';
import { useToast } from '@/components/ui/Toast';
import { useAcceptPaymentRequest } from '@/hooks/usePaymentRequests';
import type { PaymentRequest, PaymentRequestItem } from '@/types/payment-request';

interface PaymentRequestModifyDialogProps {
  request: PaymentRequest | null;
  onClose: () => void;
}

const currencyFormatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function CloseIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}

interface ItemRowState {
  itemId: number;
  value: string;
  error: string | null;
}

/**
 * Modal for editing appliedAmount per PaymentRequestItem before accepting.
 *
 * For each item the user sees:
 *  - taskTitle
 *  - expectedAmount (rate expected total; informational, immutable)
 *  - proposedAmount (admin proposal; default in the input)
 *  - editable appliedAmount input
 *
 * On submit, only the items whose appliedAmount differs from proposedAmount
 * are sent as `overrides` (the backend then marks the request as 'modified').
 */
export function PaymentRequestModifyDialog({
  request,
  onClose,
}: PaymentRequestModifyDialogProps) {
  const { toast } = useToast();
  const acceptPaymentRequest = useAcceptPaymentRequest();

  const [rows, setRows] = useState<ItemRowState[]>([]);

  // Seed form whenever the dialog opens with a new request.
  useEffect(() => {
    if (request) {
      setRows(
        request.items.map((item) => ({
          itemId: item.id,
          value: String(item.proposedAmount),
          error: null,
        }))
      );
    }
  }, [request]);

  // Close on Esc.
  useEffect(() => {
    if (!request) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [request, onClose]);

  const total = useMemo(() => {
    return rows.reduce((sum, r) => {
      const n = Number(r.value);
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);
  }, [rows]);

  if (!request) return null;

  const itemById = new Map<number, PaymentRequestItem>(
    request.items.map((it) => [it.id, it])
  );

  const updateRow = (itemId: number, value: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.itemId === itemId ? { ...r, value, error: null } : r
      )
    );
  };

  const handleSave = () => {
    // Validate every row.
    const nextRows: ItemRowState[] = [];
    let hasError = false;
    for (const row of rows) {
      const parsed = Number(row.value);
      if (!Number.isFinite(parsed) || parsed < 0) {
        nextRows.push({ ...row, error: 'Введите число ≥ 0' });
        hasError = true;
      } else {
        nextRows.push({ ...row, error: null });
      }
    }
    if (hasError) {
      setRows(nextRows);
      return;
    }

    // Build overrides: only items whose appliedAmount differs from
    // proposedAmount are sent. If none differ, the backend status stays
    // 'accepted' (i.e. equivalent to plain accept).
    const overrides: { [itemId: string]: number } = {};
    for (const row of rows) {
      const source = itemById.get(row.itemId);
      if (!source) continue;
      const parsed = Number(row.value);
      const rounded = Math.round(parsed * 100) / 100;
      const proposed = Math.round(source.proposedAmount * 100) / 100;
      if (rounded !== proposed) {
        overrides[String(row.itemId)] = rounded;
      }
    }

    const input =
      Object.keys(overrides).length > 0 ? { overrides } : undefined;

    acceptPaymentRequest.mutate(
      { id: request.id, input },
      {
        onSuccess: () => {
          toast(
            'success',
            Object.keys(overrides).length > 0
              ? 'Запрос принят с изменениями'
              : 'Запрос принят'
          );
          onClose();
        },
        onError: (err) => {
          toast(
            'error',
            err instanceof Error ? err.message : 'Не удалось принять запрос'
          );
        },
      }
    );
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="fixed inset-x-4 top-10 bottom-10 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-xl md:max-h-[85vh] bg-surface rounded-modal shadow-xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div>
            <h2 className="text-h3 font-semibold text-foreground">
              Изменить и принять
            </h2>
            <p className="text-xs text-text-secondary mt-0.5">
              От {request.fromUserName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-text-secondary hover:text-foreground transition-colors rounded-input hover:bg-background"
            aria-label="Закрыть"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3 overflow-y-auto flex-1">
          {rows.map((row) => {
            const item = itemById.get(row.itemId);
            if (!item) return null;
            const parsed = Number(row.value);
            const overPaid =
              Number.isFinite(parsed) && parsed > item.expectedAmount;
            return (
              <div
                key={row.itemId}
                className="p-3 rounded-card border border-border bg-background/40 space-y-2"
              >
                <p className="text-small font-medium text-foreground line-clamp-2">
                  {item.taskTitle}
                </p>
                <div className="flex items-center justify-between text-xs text-text-secondary">
                  <span>
                    Предложено:{' '}
                    <span className="text-foreground font-medium">
                      {currencyFormatter.format(item.proposedAmount)}
                    </span>
                  </span>
                  <span>
                    Ожидается:{' '}
                    <span className="text-foreground font-medium">
                      {currencyFormatter.format(item.expectedAmount)}
                    </span>
                  </span>
                </div>
                <InputField
                  label="К оплате, ₽"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={0.01}
                  value={row.value}
                  onChange={(e) => updateRow(row.itemId, e.target.value)}
                  error={row.error ?? undefined}
                />
                {overPaid && !row.error && (
                  <p className="text-xs text-warning">
                    Сумма превышает ожидаемую — будет переплата.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border flex-shrink-0 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-small text-text-secondary">Итого</span>
            <span className="text-h3 font-bold text-foreground">
              {currencyFormatter.format(total)}
            </span>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={acceptPaymentRequest.isPending}
            >
              Отмена
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              loading={acceptPaymentRequest.isPending}
            >
              Подтвердить
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
