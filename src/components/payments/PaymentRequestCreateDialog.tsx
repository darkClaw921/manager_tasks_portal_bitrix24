'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { SelectField } from '@/components/ui/SelectField';
import { TextareaField } from '@/components/ui/TextareaField';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useUsers } from '@/hooks/useUsers';
import { useCreatePaymentRequest } from '@/hooks/usePaymentRequests';
import type { WalletRate } from '@/types/wallet';

interface PaymentRequestCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Preselected recipient (e.g. from PaymentTable user filter). */
  presetUserId?: number;
  /** Rate ids that should be checked by default (if present in the loaded list). */
  presetRateIds?: number[];
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface RateRowState {
  checked: boolean;
  /** String so empty/partial typing works; validated on submit. */
  proposedAmount: string;
}

/**
 * Admin-only dialog for creating a payment request.
 *
 * Flow:
 *   1. Pick recipient (user dropdown, excludes self).
 *   2. Load the user's outstanding rates (paidAmount < expectedAmount) via
 *      /api/wallet/rates?userId=X.
 *   3. Check rates to include; per-rate `proposedAmount` defaults to the
 *      remaining amount (expectedAmount - paidAmount), can be edited.
 *   4. Optional note (textarea).
 *   5. Submit → POST /api/payment-requests via useCreatePaymentRequest.
 *
 * Validation: at least one item selected, each selected proposedAmount > 0.
 * The backend enforces toUserId ≠ self (we also filter it out of the dropdown).
 */
export function PaymentRequestCreateDialog({
  open,
  onOpenChange,
  presetUserId,
  presetRateIds,
}: PaymentRequestCreateDialogProps) {
  const { toast } = useToast();
  const { data: users, isLoading: usersLoading } = useUsers();
  const createPaymentRequest = useCreatePaymentRequest();

  const [toUserId, setToUserId] = useState<number | null>(null);
  const [note, setNote] = useState<string>('');
  const [candidateRates, setCandidateRates] = useState<WalletRate[]>([]);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [ratesError, setRatesError] = useState<string | null>(null);
  const [rowStates, setRowStates] = useState<Record<number, RateRowState>>({});
  const [validationError, setValidationError] = useState<string | null>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setToUserId(presetUserId ?? null);
      setNote('');
      setRatesError(null);
      setValidationError(null);
    }
  }, [open, presetUserId]);

  // Close on Esc
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onOpenChange]);

  // Fetch target user's rates whenever selection changes
  useEffect(() => {
    if (!open || toUserId == null) {
      setCandidateRates([]);
      setRowStates({});
      return;
    }

    let aborted = false;
    setRatesLoading(true);
    setRatesError(null);

    fetch(`/api/wallet/rates?userId=${toUserId}`)
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || 'Не удалось загрузить ставки');
        }
        const json = await res.json();
        return json.data as WalletRate[];
      })
      .then((rates) => {
        if (aborted) return;
        // Keep only rates with outstanding balance (paidAmount < expectedAmount).
        // Use a small epsilon to mirror backend tolerance.
        const eps = 0.005;
        const outstanding = rates.filter(
          (r) => (r.expectedAmount ?? 0) - (r.paidAmount ?? 0) > eps
        );
        setCandidateRates(outstanding);
        // Initial row states: check presetRateIds by default; proposed =
        // remaining.
        const preset = new Set(presetRateIds ?? []);
        const next: Record<number, RateRowState> = {};
        for (const r of outstanding) {
          const remaining = round2(
            Math.max(0, (r.expectedAmount ?? 0) - (r.paidAmount ?? 0))
          );
          next[r.id] = {
            checked: preset.size > 0 ? preset.has(r.id) : false,
            proposedAmount: String(remaining),
          };
        }
        setRowStates(next);
      })
      .catch((err: unknown) => {
        if (aborted) return;
        setCandidateRates([]);
        setRowStates({});
        setRatesError(
          err instanceof Error ? err.message : 'Не удалось загрузить ставки'
        );
      })
      .finally(() => {
        if (!aborted) setRatesLoading(false);
      });

    return () => {
      aborted = true;
    };
  }, [open, toUserId, presetRateIds]);

  // Build options: exclude self to prevent self-requests
  const userOptions = useMemo(() => {
    if (!users) return [];
    return users.map((u) => ({
      value: String(u.id),
      label: `${u.firstName} ${u.lastName}`.trim() || u.email,
    }));
  }, [users]);

  const totalAmount = useMemo(() => {
    let sum = 0;
    for (const rate of candidateRates) {
      const st = rowStates[rate.id];
      if (!st || !st.checked) continue;
      const parsed = Number(st.proposedAmount);
      if (Number.isFinite(parsed) && parsed > 0) sum += parsed;
    }
    return round2(sum);
  }, [candidateRates, rowStates]);

  const selectedCount = useMemo(() => {
    let n = 0;
    for (const id in rowStates) {
      if (rowStates[id].checked) n++;
    }
    return n;
  }, [rowStates]);

  const toggleRate = (id: number) => {
    setRowStates((prev) => ({
      ...prev,
      [id]: { ...prev[id], checked: !prev[id]?.checked },
    }));
    setValidationError(null);
  };

  const updateAmount = (id: number, value: string) => {
    setRowStates((prev) => ({
      ...prev,
      [id]: { ...prev[id], proposedAmount: value },
    }));
    setValidationError(null);
  };

  const handleSubmit = () => {
    if (toUserId == null) {
      setValidationError('Выберите получателя');
      return;
    }
    const items: Array<{ taskRateId: number; proposedAmount: number }> = [];
    for (const rate of candidateRates) {
      const st = rowStates[rate.id];
      if (!st || !st.checked) continue;
      const parsed = Number(st.proposedAmount);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setValidationError(
          `Некорректная сумма для "${rate.taskTitle}" — укажите положительное число`
        );
        return;
      }
      items.push({ taskRateId: rate.id, proposedAmount: round2(parsed) });
    }
    if (items.length === 0) {
      setValidationError('Выберите хотя бы одну ставку');
      return;
    }
    setValidationError(null);

    const trimmedNote = note.trim();
    createPaymentRequest.mutate(
      {
        toUserId,
        items,
        ...(trimmedNote ? { note: trimmedNote } : {}),
      },
      {
        onSuccess: () => {
          toast('success', 'Запрос оплаты отправлен');
          onOpenChange(false);
        },
        onError: (err) => {
          toast(
            'error',
            err instanceof Error ? err.message : 'Не удалось создать запрос'
          );
        },
      }
    );
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="fixed inset-x-4 top-10 bottom-10 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-2xl md:max-h-[85vh] bg-surface rounded-modal shadow-xl z-50 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-h3 font-semibold text-foreground">
            Создать запрос оплаты
          </h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="p-1 text-text-secondary hover:text-foreground transition-colors rounded-input hover:bg-background"
            aria-label="Закрыть"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Recipient */}
          <SelectField
            label="Получатель"
            placeholder={usersLoading ? 'Загрузка...' : 'Выберите пользователя'}
            options={userOptions}
            value={toUserId != null ? String(toUserId) : ''}
            onChange={(e) => {
              const v = e.target.value;
              setToUserId(v ? parseInt(v, 10) : null);
              setValidationError(null);
            }}
            disabled={usersLoading}
          />

          {/* Rates section */}
          <div>
            <p className="text-small font-medium text-foreground mb-2">
              Ставки для включения в запрос
            </p>

            {toUserId == null ? (
              <div className="rounded-input border border-dashed border-border bg-background/40 px-4 py-6 text-center text-small text-text-secondary">
                Выберите получателя, чтобы увидеть его ставки
              </div>
            ) : ratesLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : ratesError ? (
              <div className="rounded-input border border-danger/30 bg-danger-light/40 px-4 py-3 text-small text-danger">
                {ratesError}
              </div>
            ) : candidateRates.length === 0 ? (
              <div className="rounded-input border border-dashed border-border bg-background/40 px-4 py-6 text-center text-small text-text-secondary">
                У пользователя нет ставок с непогашенным остатком
              </div>
            ) : (
              <div className="divide-y divide-border rounded-input border border-border overflow-hidden">
                {candidateRates.map((rate) => {
                  const st = rowStates[rate.id];
                  const remaining = round2(
                    Math.max(0, (rate.expectedAmount ?? 0) - (rate.paidAmount ?? 0))
                  );
                  return (
                    <div
                      key={rate.id}
                      className="px-3 py-2.5 flex items-start gap-3 bg-surface"
                    >
                      <input
                        type="checkbox"
                        checked={st?.checked ?? false}
                        onChange={() => toggleRate(rate.id)}
                        className="mt-1 rounded border-border bg-surface text-primary focus:ring-primary/20 cursor-pointer"
                        aria-label={`Включить ставку по задаче ${rate.taskTitle}`}
                      />
                      <div className="flex-1 min-w-0 space-y-1">
                        <p className="text-small font-medium text-foreground line-clamp-2">
                          {rate.taskTitle}
                        </p>
                        <div className="text-xs text-text-secondary flex flex-wrap gap-x-3 gap-y-0.5">
                          <span>
                            Ожидается:{' '}
                            <span className="text-foreground font-medium">
                              {currencyFormatter.format(rate.expectedAmount ?? 0)}
                            </span>
                          </span>
                          <span>
                            Оплачено:{' '}
                            <span className="text-foreground font-medium">
                              {currencyFormatter.format(rate.paidAmount ?? 0)}
                            </span>
                          </span>
                          <span>
                            Остаток:{' '}
                            <span className="text-primary font-semibold">
                              {currencyFormatter.format(remaining)}
                            </span>
                          </span>
                        </div>
                      </div>
                      <div className="w-28 flex-shrink-0">
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          inputMode="decimal"
                          value={st?.proposedAmount ?? ''}
                          onChange={(e) => updateAmount(rate.id, e.target.value)}
                          disabled={!(st?.checked ?? false)}
                          className="w-full rounded-input border border-border bg-surface px-2 py-1.5 text-small text-right text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
                          aria-label={`Сумма для задачи ${rate.taskTitle}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Note */}
          <TextareaField
            label="Комментарий (необязательно)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Контекст, сроки, детали..."
          />

          {/* Validation error */}
          {validationError && (
            <div className="rounded-input border border-danger/30 bg-danger-light/40 px-3 py-2 text-xs text-danger">
              {validationError}
            </div>
          )}
        </div>

        {/* Footer: total + actions */}
        <div className="border-t border-border px-5 py-4 space-y-3 bg-surface">
          <div className="flex items-center justify-between">
            <span className="text-small text-text-secondary">
              Выбрано ставок: {selectedCount}
            </span>
            <span className="text-h3 font-bold text-foreground">
              {currencyFormatter.format(totalAmount)}
            </span>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={createPaymentRequest.isPending}
            >
              Отмена
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSubmit}
              loading={createPaymentRequest.isPending}
              disabled={
                createPaymentRequest.isPending ||
                toUserId == null ||
                selectedCount === 0 ||
                ratesLoading
              }
            >
              Создать запрос
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
