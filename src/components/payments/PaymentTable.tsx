'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { PortalIndicator } from '@/components/ui/PortalIndicator';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import type { TaskRateWithTask } from '@/types';

interface PaymentTableProps {
  rates: TaskRateWithTask[];
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onSelectAll: () => void;
  onTogglePaid: (id: number, isPaid: boolean) => void;
  loading?: boolean;
}

const currencyFormatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function getTaskStatusBadge(status: string) {
  switch (status) {
    case 'IN_PROGRESS':
      return <Badge variant="primary" size="sm">В работе</Badge>;
    case 'COMPLETED':
      return <Badge variant="success" size="sm">Завершена</Badge>;
    case 'DEFERRED':
      return <Badge variant="warning" size="sm">Отложена</Badge>;
    case 'PENDING':
      return <Badge variant="default" size="sm">Ожидает</Badge>;
    default:
      return <Badge variant="default" size="sm">{status}</Badge>;
  }
}

function getHours(rate: TaskRateWithTask): string {
  if (rate.rateType === 'fixed') return '\u2014';
  const hours = rate.hoursOverride ?? (rate.timeSpent ? rate.timeSpent / 3600 : 0);
  return hours.toFixed(1);
}

function getTotal(rate: TaskRateWithTask): number {
  if (rate.rateType === 'fixed') return rate.amount;
  const hours = rate.hoursOverride ?? (rate.timeSpent ? rate.timeSpent / 3600 : 0);
  return rate.amount * hours;
}

function TableSkeletonRows() {
  return (
    <>
      {[1, 2, 3, 4, 5].map((i) => (
        <tr key={i} className="border-b border-border">
          <td className="px-3 py-3"><Skeleton className="w-4 h-4" /></td>
          <td className="px-3 py-3"><Skeleton className="h-4 w-40" /></td>
          <td className="px-3 py-3"><Skeleton className="h-4 w-24" /></td>
          <td className="px-3 py-3"><Skeleton className="h-4 w-20" /></td>
          <td className="px-3 py-3"><Skeleton className="h-4 w-16" /></td>
          <td className="px-3 py-3"><Skeleton className="h-4 w-12" /></td>
          <td className="px-3 py-3"><Skeleton className="h-4 w-20" /></td>
          <td className="px-3 py-3"><Skeleton className="h-5 w-16" /></td>
          <td className="px-3 py-3"><Skeleton className="h-5 w-20" /></td>
        </tr>
      ))}
    </>
  );
}

function PaymentIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
    </svg>
  );
}

/** Mobile card view for a single rate */
function MobileCard({
  rate,
  selected,
  onToggleSelect,
  onTogglePaid,
}: {
  rate: TaskRateWithTask;
  selected: boolean;
  onToggleSelect: (id: number) => void;
  onTogglePaid: (id: number, isPaid: boolean) => void;
}) {
  const total = getTotal(rate);
  const hours = getHours(rate);

  return (
    <div className="bg-surface rounded-card border border-border p-4 space-y-3">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(rate.id)}
          className="mt-1 rounded border-border bg-surface text-primary focus:ring-primary/20 cursor-pointer"
        />
        <div className="flex-1 min-w-0">
          <Link
            href={`/tasks/${rate.taskId}`}
            className="text-small font-medium text-foreground hover:text-primary transition-colors line-clamp-2"
          >
            {rate.taskTitle}
          </Link>
          <div className="flex items-center gap-2 mt-1">
            <PortalIndicator color={rate.portalColor} size="sm" />
            <span className="text-xs text-text-secondary truncate">{rate.portalName}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-text-muted">Тип:</span>{' '}
          <span className="text-text-secondary">{rate.rateType === 'hourly' ? 'Почасовая' : 'Фиксированная'}</span>
        </div>
        <div>
          <span className="text-text-muted">Ставка:</span>{' '}
          <span className="text-text-secondary">{currencyFormatter.format(rate.amount)}</span>
        </div>
        {rate.rateType === 'hourly' && (
          <div>
            <span className="text-text-muted">Часы:</span>{' '}
            <span className="text-text-secondary">{hours}</span>
          </div>
        )}
        <div>
          <span className="text-text-muted">Итого:</span>{' '}
          <span className="text-foreground font-medium">{currencyFormatter.format(total)}</span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        {getTaskStatusBadge(rate.taskStatus)}
        <button
          onClick={() => onTogglePaid(rate.id, !rate.isPaid)}
          className="transition-opacity hover:opacity-80"
        >
          {rate.isPaid ? (
            <Badge variant="success" size="sm">Оплачено</Badge>
          ) : (
            <Badge variant="warning" size="sm">Не оплачено</Badge>
          )}
        </button>
      </div>
    </div>
  );
}

export function PaymentTable({
  rates,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onTogglePaid,
  loading,
}: PaymentTableProps) {
  if (!loading && rates.length === 0) {
    return (
      <EmptyState
        icon={<PaymentIcon />}
        title="Нет данных об оплате"
        description="Добавьте ставки к задачам, чтобы они появились здесь"
      />
    );
  }

  const allSelected = rates.length > 0 && rates.every((r) => selectedIds.has(r.id));

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-small">
          <thead>
            <tr className="border-b border-border text-text-secondary">
              <th className="px-3 py-3 text-left font-medium w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onSelectAll}
                  disabled={loading || rates.length === 0}
                  className="rounded border-border bg-surface text-primary focus:ring-primary/20 cursor-pointer"
                />
              </th>
              <th className="px-3 py-3 text-left font-medium">Задача</th>
              <th className="px-3 py-3 text-left font-medium">Портал</th>
              <th className="px-3 py-3 text-left font-medium">Тип</th>
              <th className="px-3 py-3 text-right font-medium">Ставка</th>
              <th className="px-3 py-3 text-right font-medium">Часы</th>
              <th className="px-3 py-3 text-right font-medium">Итого</th>
              <th className="px-3 py-3 text-left font-medium">Статус</th>
              <th className="px-3 py-3 text-left font-medium">Оплата</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableSkeletonRows />
            ) : (
              rates.map((rate) => {
                const total = getTotal(rate);
                const hours = getHours(rate);

                return (
                  <tr
                    key={rate.id}
                    className="border-b border-border hover:bg-background/50 transition-colors"
                  >
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(rate.id)}
                        onChange={() => onToggleSelect(rate.id)}
                        className="rounded border-border bg-surface text-primary focus:ring-primary/20 cursor-pointer"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <Link
                        href={`/tasks/${rate.taskId}`}
                        className="text-foreground hover:text-primary transition-colors font-medium"
                      >
                        {rate.taskTitle}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <PortalIndicator color={rate.portalColor} size="sm" />
                        <span className="text-text-secondary truncate max-w-[120px]">{rate.portalName}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-text-secondary">
                      {rate.rateType === 'hourly' ? 'Почасовая' : 'Фиксированная'}
                    </td>
                    <td className="px-3 py-3 text-right text-text-secondary">
                      {currencyFormatter.format(rate.amount)}
                    </td>
                    <td className="px-3 py-3 text-right text-text-secondary">
                      {hours}
                    </td>
                    <td className="px-3 py-3 text-right font-medium text-foreground">
                      {currencyFormatter.format(total)}
                    </td>
                    <td className="px-3 py-3">
                      {getTaskStatusBadge(rate.taskStatus)}
                    </td>
                    <td className="px-3 py-3">
                      <button
                        onClick={() => onTogglePaid(rate.id, !rate.isPaid)}
                        className="transition-opacity hover:opacity-80"
                      >
                        {rate.isPaid ? (
                          <Badge variant="success" size="sm">Оплачено</Badge>
                        ) : (
                          <Badge variant="warning" size="sm">Не оплачено</Badge>
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {loading ? (
          [1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="bg-surface rounded-card border border-border p-4 animate-pulse space-y-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <div className="grid grid-cols-2 gap-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-full" />
              </div>
              <div className="flex justify-between">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-20" />
              </div>
            </div>
          ))
        ) : (
          rates.map((rate) => (
            <MobileCard
              key={rate.id}
              rate={rate}
              selected={selectedIds.has(rate.id)}
              onToggleSelect={onToggleSelect}
              onTogglePaid={onTogglePaid}
            />
          ))
        )}
      </div>
    </>
  );
}
