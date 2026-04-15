'use client';

import { useEffect, useState, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { InputField } from '@/components/ui/InputField';
import { useToast } from '@/components/ui/Toast';
import { useSetPaidAmount } from '@/hooks/useWallet';
import type { WalletRate } from '@/types/wallet';

interface CustomPaymentDialogProps {
  rate: WalletRate | null;
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

/**
 * Manual paidAmount editor. Reads expectedAmount from the rate, offers quick
 * presets (full / zero) and a free-form numeric input. Calls useSetPaidAmount
 * on save and surfaces toast notifications.
 */
export function CustomPaymentDialog({ rate, onClose }: CustomPaymentDialogProps) {
  const { toast } = useToast();
  const setPaidAmount = useSetPaidAmount();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Reset local state each time the dialog opens with a new rate.
  useEffect(() => {
    if (rate) {
      setValue(String(rate.paidAmount ?? 0));
      setError(null);
    }
  }, [rate]);

  // Close on Esc.
  useEffect(() => {
    if (!rate) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [rate, onClose]);

  if (!rate) return null;

  const setFull = () => {
    setValue(String(rate.expectedAmount));
    setError(null);
  };

  const setZero = () => {
    setValue('0');
    setError(null);
  };

  const focusInput = () => {
    inputRef.current?.focus();
    inputRef.current?.select();
  };

  const handleSave = () => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError('Введите положительное число');
      return;
    }
    setError(null);
    setPaidAmount.mutate(
      { rateId: rate.id, paidAmount: parsed },
      {
        onSuccess: () => {
          toast('success', 'Оплата обновлена');
          onClose();
        },
        onError: (err) => {
          toast('error', err instanceof Error ? err.message : 'Ошибка сохранения');
        },
      }
    );
  };

  const progress =
    rate.expectedAmount > 0
      ? Math.min(100, Math.round((Number(value) / rate.expectedAmount) * 100))
      : 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="fixed inset-x-4 top-20 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-md bg-surface rounded-modal shadow-xl z-50">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-h3 font-semibold text-foreground">
            Изменить оплату
          </h2>
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
        <div className="px-5 py-4 space-y-4">
          <div>
            <p className="text-small text-text-secondary mb-1">Задача</p>
            <p className="text-body font-medium text-foreground line-clamp-2">
              {rate.taskTitle}
            </p>
          </div>

          <div className="flex items-center justify-between p-3 bg-background rounded-card border border-border">
            <span className="text-small text-text-secondary">Ожидается</span>
            <span className="text-body font-bold text-foreground">
              {currencyFormatter.format(rate.expectedAmount)}
            </span>
          </div>

          {/* Quick-pick buttons */}
          <div className="grid grid-cols-3 gap-2">
            <Button variant="secondary" size="sm" onClick={setFull} type="button">
              Полностью
            </Button>
            <Button variant="secondary" size="sm" onClick={setZero} type="button">
              Не оплачено
            </Button>
            <Button variant="secondary" size="sm" onClick={focusInput} type="button">
              Своё
            </Button>
          </div>

          {/* Free-form input */}
          <InputField
            ref={inputRef}
            label="Оплачено, ₽"
            type="number"
            inputMode="decimal"
            min={0}
            step={0.01}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            error={error ?? undefined}
          />

          {/* Progress */}
          <div>
            <div className="flex items-center justify-between text-xs text-text-secondary mb-1.5">
              <span>Прогресс</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full h-2 bg-background rounded-full overflow-hidden border border-border">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={setPaidAmount.isPending}
          >
            Отмена
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            loading={setPaidAmount.isPending}
          >
            Сохранить
          </Button>
        </div>
      </div>
    </>
  );
}
