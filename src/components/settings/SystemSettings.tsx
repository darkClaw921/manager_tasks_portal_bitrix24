'use client';

import { useState, useEffect } from 'react';
import { useWorkHours, useUpdateWorkHours } from '@/hooks/useWorkHours';
import { useToast } from '@/components/ui/Toast';
import { SelectField } from '@/components/ui/SelectField';
import { Button } from '@/components/ui/Button';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate hour options: 0-23 for start, 1-24 for end */
function generateHourOptions(startHour: number, endHour: number) {
  return Array.from({ length: endHour - startHour + 1 }, (_, i) => {
    const hour = startHour + i;
    return {
      value: String(hour),
      label: `${String(hour).padStart(2, '0')}:00`,
    };
  });
}

const START_OPTIONS = generateHourOptions(0, 23);
const END_OPTIONS = generateHourOptions(1, 24);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * System settings tab (admin only).
 * Allows configuring global work hours for the calendar.
 */
export function SystemSettings() {
  const { data: workHours, isLoading } = useWorkHours();
  const updateWorkHours = useUpdateWorkHours();
  const { toast } = useToast();

  const [start, setStart] = useState<number>(workHours.start);
  const [end, setEnd] = useState<number>(workHours.end);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Sync form with fetched data
  useEffect(() => {
    setStart(workHours.start);
    setEnd(workHours.end);
  }, [workHours.start, workHours.end]);

  const handleStartChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = Number(e.target.value);
    setStart(value);
    setValidationError(null);
  };

  const handleEndChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = Number(e.target.value);
    setEnd(value);
    setValidationError(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    // Client-side validation
    if (start >= end) {
      setValidationError('Начало рабочего дня должно быть раньше конца');
      return;
    }

    setValidationError(null);

    try {
      await updateWorkHours.mutateAsync({ start, end });
      toast('success', 'Рабочие часы сохранены');
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Не удалось сохранить настройки');
    }
  };

  if (isLoading) {
    return (
      <div className="bg-surface rounded-card border border-border p-6 space-y-4 animate-pulse">
        <div className="h-5 bg-background rounded w-1/4" />
        <div className="space-y-3">
          <div className="h-10 bg-background rounded" />
          <div className="h-10 bg-background rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-card border border-border p-6">
      <h2 className="text-h3 font-semibold mb-1">Рабочие часы</h2>
      <p className="text-xs text-text-secondary mb-4">
        Настройте рабочие часы, которые используются в календаре для расчёта свободных слотов и отображения сетки доступности
      </p>

      {validationError && (
        <div className="mb-4 p-3 rounded-input text-small bg-danger-light text-danger">
          {validationError}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SelectField
            label="Начало рабочего дня"
            value={String(start)}
            onChange={handleStartChange}
            options={START_OPTIONS}
          />
          <SelectField
            label="Конец рабочего дня"
            value={String(end)}
            onChange={handleEndChange}
            options={END_OPTIONS}
          />
        </div>

        <div className="pt-2">
          <Button
            type="submit"
            variant="primary"
            loading={updateWorkHours.isPending}
          >
            Сохранить
          </Button>
        </div>
      </form>
    </div>
  );
}
