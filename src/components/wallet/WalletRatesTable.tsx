'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { PortalIndicator } from '@/components/ui/PortalIndicator';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import type { WalletRate, WalletPaymentStatus } from '@/types/wallet';

interface WalletRatesTableProps {
  rates: WalletRate[];
  loading?: boolean;
  onEdit: (rate: WalletRate) => void;
}

const currencyFormatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function getPaymentStatusBadge(status: WalletPaymentStatus) {
  switch (status) {
    case 'paid':
      return <Badge variant="success" size="sm">Оплачено</Badge>;
    case 'partial':
      return <Badge variant="warning" size="sm">Частично</Badge>;
    case 'overpaid':
      return <Badge variant="primary" size="sm">Переплата</Badge>;
    case 'unpaid':
    default:
      return <Badge variant="danger" size="sm">Не оплачено</Badge>;
  }
}

function ProgressBar({
  paid,
  expected,
  status,
}: {
  paid: number;
  expected: number;
  status: WalletPaymentStatus;
}) {
  const percent =
    expected > 0
      ? Math.min(100, Math.round((paid / expected) * 100))
      : paid > 0
      ? 100
      : 0;

  const colorClass =
    status === 'paid'
      ? 'bg-success'
      : status === 'overpaid'
      ? 'bg-primary'
      : status === 'partial'
      ? 'bg-warning'
      : 'bg-border';

  return (
    <div className="w-full min-w-[120px]">
      <div className="flex items-center justify-between text-xs text-text-secondary mb-1">
        <span>
          {currencyFormatter.format(paid)} / {currencyFormatter.format(expected)}
        </span>
        <span>
          {percent}%
          {percent < 100 && ` · осталось ${currencyFormatter.format(Math.max(0, expected - paid))}`}
        </span>
      </div>
      <div className="w-full h-1.5 bg-background rounded-full overflow-hidden border border-border">
        <div
          className={`h-full transition-all ${colorClass}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function WalletIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9A2.25 2.25 0 0 0 18.75 6.75H5.25A2.25 2.25 0 0 0 3 9v3" />
    </svg>
  );
}

function TableSkeletonRows() {
  return (
    <>
      {[1, 2, 3, 4, 5].map((i) => (
        <tr key={i} className="border-b border-border">
          <td className="px-3 py-3"><Skeleton className="h-4 w-40" /></td>
          <td className="px-3 py-3"><Skeleton className="h-4 w-24" /></td>
          <td className="px-3 py-3 text-right"><Skeleton className="h-4 w-20" /></td>
          <td className="px-3 py-3 text-right"><Skeleton className="h-4 w-20" /></td>
          <td className="px-3 py-3"><Skeleton className="h-4 w-full" /></td>
          <td className="px-3 py-3"><Skeleton className="h-5 w-20" /></td>
          <td className="px-3 py-3"><Skeleton className="h-7 w-24" /></td>
        </tr>
      ))}
    </>
  );
}

function MobileCard({
  rate,
  onEdit,
}: {
  rate: WalletRate;
  onEdit: (rate: WalletRate) => void;
}) {
  return (
    <div className="bg-surface rounded-card border border-border p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
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
        {getPaymentStatusBadge(rate.paymentStatus)}
      </div>

      <ProgressBar
        paid={rate.paidAmount}
        expected={rate.expectedAmount}
        status={rate.paymentStatus}
      />

      <div className="flex items-center justify-end">
        <Button variant="secondary" size="sm" onClick={() => onEdit(rate)}>
          Изменить оплату
        </Button>
      </div>
    </div>
  );
}

/**
 * Wallet rate list: per-rate row with progress bar of paidAmount/expectedAmount
 * and a status badge. Desktop table + mobile cards mirror PaymentTable style.
 */
export function WalletRatesTable({ rates, loading, onEdit }: WalletRatesTableProps) {
  if (!loading && rates.length === 0) {
    return (
      <EmptyState
        icon={<WalletIcon />}
        title="Нет задач в этой категории"
        description="Здесь появятся ваши ставки, когда они будут привязаны к задачам"
      />
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-small">
          <thead>
            <tr className="border-b border-border text-text-secondary">
              <th className="px-3 py-3 text-left font-medium">Задача</th>
              <th className="px-3 py-3 text-left font-medium">Портал</th>
              <th className="px-3 py-3 text-right font-medium">Ожидается</th>
              <th className="px-3 py-3 text-right font-medium">Оплачено</th>
              <th className="px-3 py-3 text-left font-medium min-w-[160px]">Прогресс</th>
              <th className="px-3 py-3 text-left font-medium">Статус</th>
              <th className="px-3 py-3 text-right font-medium">Действия</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableSkeletonRows />
            ) : (
              rates.map((rate) => (
                <tr
                  key={rate.id}
                  className="border-b border-border hover:bg-background/50 transition-colors"
                >
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
                      <span className="text-text-secondary truncate max-w-[120px]">
                        {rate.portalName}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right text-text-secondary">
                    {currencyFormatter.format(rate.expectedAmount)}
                  </td>
                  <td className="px-3 py-3 text-right font-medium text-foreground">
                    {currencyFormatter.format(rate.paidAmount)}
                  </td>
                  <td className="px-3 py-3">
                    <ProgressBar
                      paid={rate.paidAmount}
                      expected={rate.expectedAmount}
                      status={rate.paymentStatus}
                    />
                  </td>
                  <td className="px-3 py-3">
                    {getPaymentStatusBadge(rate.paymentStatus)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Button variant="secondary" size="sm" onClick={() => onEdit(rate)}>
                      Изменить
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {loading ? (
          [1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-surface rounded-card border border-border p-4 animate-pulse space-y-3"
            >
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-2 w-full" />
              <div className="flex justify-end">
                <Skeleton className="h-7 w-24" />
              </div>
            </div>
          ))
        ) : (
          rates.map((rate) => (
            <MobileCard key={rate.id} rate={rate} onEdit={onEdit} />
          ))
        )}
      </div>
    </>
  );
}
