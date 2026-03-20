'use client';

import { SelectField } from '@/components/ui/SelectField';
import { InputField } from '@/components/ui/InputField';
import { Button } from '@/components/ui/Button';
import type { PaymentFilters as PaymentFiltersType, PortalPublic } from '@/types';

interface PaymentFiltersProps {
  filters: PaymentFiltersType;
  onFiltersChange: (f: PaymentFiltersType) => void;
  portals: PortalPublic[];
  isAdmin?: boolean;
  users?: { id: number; firstName: string; lastName: string }[];
}

export function PaymentFilters({
  filters,
  onFiltersChange,
  portals,
  isAdmin,
  users,
}: PaymentFiltersProps) {
  const portalOptions = [
    { value: '', label: 'Все порталы' },
    ...portals.map((p) => ({
      value: String(p.id),
      label: p.name || p.domain,
    })),
  ];

  const paidStatusOptions = [
    { value: '', label: 'Все' },
    { value: 'true', label: 'Оплачено' },
    { value: 'false', label: 'Не оплачено' },
  ];

  const taskStatusOptions = [
    { value: '', label: 'Все' },
    { value: 'IN_PROGRESS', label: 'В работе' },
    { value: 'COMPLETED', label: 'Завершена' },
    { value: 'DEFERRED', label: 'Отложена' },
  ];

  const userOptions = [
    { value: '', label: 'Все пользователи' },
    ...(users ?? []).map((u) => ({
      value: String(u.id),
      label: `${u.firstName} ${u.lastName}`,
    })),
  ];

  const handleReset = () => {
    onFiltersChange({
      page: 1,
      limit: filters.limit,
    });
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <SelectField
        label="Портал"
        options={portalOptions}
        value={filters.portalId != null ? String(filters.portalId) : ''}
        onChange={(e) =>
          onFiltersChange({
            ...filters,
            portalId: e.target.value ? Number(e.target.value) : undefined,
            page: 1,
          })
        }
        className="w-full sm:w-44"
      />

      <InputField
        label="С"
        type="date"
        value={filters.dateFrom ?? ''}
        onChange={(e) =>
          onFiltersChange({
            ...filters,
            dateFrom: e.target.value || undefined,
            page: 1,
          })
        }
        className="w-full sm:w-40"
      />

      <InputField
        label="По"
        type="date"
        value={filters.dateTo ?? ''}
        onChange={(e) =>
          onFiltersChange({
            ...filters,
            dateTo: e.target.value || undefined,
            page: 1,
          })
        }
        className="w-full sm:w-40"
      />

      <SelectField
        label="Оплата"
        options={paidStatusOptions}
        value={filters.isPaid != null ? String(filters.isPaid) : ''}
        onChange={(e) =>
          onFiltersChange({
            ...filters,
            isPaid: e.target.value === '' ? undefined : e.target.value === 'true',
            page: 1,
          })
        }
        className="w-full sm:w-40"
      />

      <SelectField
        label="Статус задачи"
        options={taskStatusOptions}
        value={filters.taskStatus ?? ''}
        onChange={(e) =>
          onFiltersChange({
            ...filters,
            taskStatus: e.target.value || undefined,
            page: 1,
          })
        }
        className="w-full sm:w-40"
      />

      {isAdmin && (
        <SelectField
          label="Пользователь"
          options={userOptions}
          value={filters.userId != null ? String(filters.userId) : ''}
          onChange={(e) =>
            onFiltersChange({
              ...filters,
              userId: e.target.value ? Number(e.target.value) : undefined,
              page: 1,
            })
          }
          className="w-full sm:w-48"
        />
      )}

      <Button variant="ghost" size="sm" onClick={handleReset}>
        Сбросить
      </Button>
    </div>
  );
}
