'use client';

import { useState } from 'react';
import { useTaskRate, useUpsertTaskRate, useDeleteTaskRate } from '@/hooks/usePayments';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { InputField } from '@/components/ui/InputField';
import { SelectField } from '@/components/ui/SelectField';
import { TextareaField } from '@/components/ui/TextareaField';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import type { RateType } from '@/types';

export interface TaskRateWidgetProps {
  taskId: number;
  timeSpent?: number | null;
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className || 'w-3.5 h-3.5'}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className || 'w-3.5 h-3.5'}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
  );
}

const rateTypeOptions = [
  { value: 'hourly', label: 'Почасовая' },
  { value: 'fixed', label: 'Фиксированная' },
];

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function getHoursFromTimeSpent(timeSpent: number | null | undefined): number {
  if (!timeSpent) return 0;
  return Math.round((timeSpent / 3600) * 100) / 100;
}

function calculateTotal(
  rateType: RateType,
  amount: number,
  hours: number
): number {
  if (rateType === 'fixed') return amount;
  return amount * hours;
}

export function TaskRateWidget({ taskId, timeSpent }: TaskRateWidgetProps) {
  const { data: rate, isLoading } = useTaskRate(taskId);
  const upsertRate = useUpsertTaskRate();
  const deleteRate = useDeleteTaskRate();
  const { toast } = useToast();

  const [editing, setEditing] = useState(false);
  const [rateType, setRateType] = useState<RateType>('hourly');
  const [amount, setAmount] = useState('');
  const [hoursOverride, setHoursOverride] = useState('');
  const [note, setNote] = useState('');

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-16" />
      </div>
    );
  }

  // Open form for creating or editing
  function openForm(editExisting = false) {
    if (editExisting && rate) {
      setRateType(rate.rateType);
      setAmount(String(rate.amount));
      setHoursOverride(rate.hoursOverride != null ? String(rate.hoursOverride) : '');
      setNote(rate.note || '');
    } else {
      setRateType('hourly');
      setAmount('');
      setHoursOverride('');
      setNote('');
    }
    setEditing(true);
  }

  function handleCancel() {
    setEditing(false);
  }

  function handleSave() {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      toast('error', 'Укажите корректную сумму');
      return;
    }

    const parsedHours = hoursOverride ? parseFloat(hoursOverride) : undefined;
    if (hoursOverride && (isNaN(parsedHours!) || parsedHours! < 0)) {
      toast('error', 'Укажите корректное количество часов');
      return;
    }

    upsertRate.mutate(
      {
        taskId,
        rateType,
        amount: parsedAmount,
        hoursOverride: parsedHours ?? null,
        note: note.trim() || null,
      },
      {
        onSuccess: () => {
          setEditing(false);
          toast('success', rate ? 'Ставка обновлена' : 'Ставка добавлена');
        },
        onError: (err) => {
          toast('error', err.message || 'Ошибка при сохранении ставки');
        },
      }
    );
  }

  function handleDelete() {
    if (!confirm('Удалить ставку?')) return;
    deleteRate.mutate(taskId, {
      onSuccess: () => {
        setEditing(false);
        toast('success', 'Ставка удалена');
      },
      onError: (err) => {
        toast('error', err.message || 'Ошибка при удалении ставки');
      },
    });
  }

  // Edit form
  if (editing) {
    const timeSpentHours = getHoursFromTimeSpent(timeSpent);
    const previewHours = hoursOverride ? parseFloat(hoursOverride) || 0 : timeSpentHours;
    const previewAmount = parseFloat(amount) || 0;
    const previewTotal = calculateTotal(rateType, previewAmount, previewHours);

    return (
      <div className="space-y-3">
        <SelectField
          label="Тип ставки"
          options={rateTypeOptions}
          value={rateType}
          onChange={(e) => setRateType(e.target.value as RateType)}
          className="[&_select]:py-1.5 [&_select]:text-small [&_label]:text-xs"
        />

        <InputField
          label="Сумма, руб."
          type="number"
          min={0}
          step={0.01}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          className="[&_input]:py-1.5 [&_input]:text-small [&_label]:text-xs"
        />

        {rateType === 'hourly' && (
          <InputField
            label="Часы"
            type="number"
            min={0}
            step={0.01}
            value={hoursOverride}
            onChange={(e) => setHoursOverride(e.target.value)}
            placeholder={timeSpentHours ? String(timeSpentHours) : '0'}
            helperText="Необязательно. По умолчанию из затраченного времени."
            className="[&_input]:py-1.5 [&_input]:text-small [&_label]:text-xs"
          />
        )}

        <TextareaField
          label="Примечание"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Необязательно"
          rows={2}
          autoResize={false}
          className="[&_textarea]:py-1.5 [&_textarea]:text-small [&_label]:text-xs"
          style={{ minHeight: '48px' }}
        />

        {/* Preview total */}
        {previewAmount > 0 && (
          <div className="text-xs text-text-muted">
            Итого: <span className="font-medium text-foreground">{formatCurrency(previewTotal)}</span>
            {rateType === 'hourly' && (
              <span> ({previewHours}ч x {formatCurrency(previewAmount)})</span>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            loading={upsertRate.isPending}
          >
            Сохранить
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancel}
          >
            Отмена
          </Button>
        </div>
      </div>
    );
  }

  // No rate - show create button
  if (!rate) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => openForm(false)}
        className="text-xs"
      >
        Указать ставку
      </Button>
    );
  }

  // View mode - display existing rate
  const hours = rate.hoursOverride ?? getHoursFromTimeSpent(timeSpent);
  const total = calculateTotal(rate.rateType, rate.amount, hours);

  return (
    <div className="space-y-2">
      {/* Type + amount */}
      <div className="flex items-center justify-between">
        <span className="text-small text-foreground">
          {rate.rateType === 'hourly' ? 'Почасовая' : 'Фиксированная'}
          {' — '}
          {formatCurrency(rate.amount)}
          {rate.rateType === 'hourly' && '/ч'}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => openForm(true)}
            className="p-1 rounded hover:bg-border transition-colors text-text-muted hover:text-foreground"
            title="Редактировать"
          >
            <PencilIcon />
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="p-1 rounded hover:bg-danger/10 transition-colors text-text-muted hover:text-danger"
            title="Удалить"
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      {/* Hours + total (for hourly) */}
      {rate.rateType === 'hourly' && (
        <div className="text-xs text-text-muted">
          {hours}ч x {formatCurrency(rate.amount)} = <span className="font-medium text-foreground">{formatCurrency(total)}</span>
        </div>
      )}

      {/* Total (for fixed) */}
      {rate.rateType === 'fixed' && (
        <div className="text-xs text-text-muted">
          Итого: <span className="font-medium text-foreground">{formatCurrency(total)}</span>
        </div>
      )}

      {/* Payment status */}
      <Badge
        variant={rate.isPaid ? 'success' : 'warning'}
        size="sm"
      >
        {rate.isPaid ? 'Оплачено' : 'Не оплачено'}
      </Badge>

      {/* Note */}
      {rate.note && (
        <p className="text-xs text-text-muted italic">{rate.note}</p>
      )}
    </div>
  );
}
