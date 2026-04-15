'use client';

import { useMemo, useState } from 'react';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useOutgoingRequests } from '@/hooks/usePaymentRequests';
import { PaymentRequestCard } from './PaymentRequestCard';
import type {
  PaymentRequest,
  PaymentRequestStatus,
} from '@/types/payment-request';

const currencyFormatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const STATUS_LABEL: Record<PaymentRequestStatus, string> = {
  pending: 'Ожидает ответа',
  accepted: 'Принят',
  modified: 'Принят с изменениями',
  rejected: 'Отклонён',
};

const STATUS_VARIANT: Record<PaymentRequestStatus, BadgeVariant> = {
  pending: 'warning',
  accepted: 'success',
  modified: 'primary',
  rejected: 'danger',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return dateFormatter.format(d);
}

function OutboxIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}

function TableSkeletonRows() {
  return (
    <>
      {[1, 2, 3].map((i) => (
        <tr key={i} className="border-b border-border">
          <td className="px-3 py-3"><Skeleton className="h-4 w-32" /></td>
          <td className="px-3 py-3"><Skeleton className="h-4 w-20" /></td>
          <td className="px-3 py-3"><Skeleton className="h-5 w-24" /></td>
          <td className="px-3 py-3"><Skeleton className="h-4 w-28" /></td>
          <td className="px-3 py-3"><Skeleton className="h-4 w-28" /></td>
        </tr>
      ))}
    </>
  );
}

function MobileSkeletonCards() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-surface rounded-card border border-border p-4 space-y-2 animate-pulse">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-5 w-28" />
        </div>
      ))}
    </div>
  );
}

/**
 * Admin's list of sent payment requests (outgoing). Rendered inside the
 * "Исходящие запросы" tab on /payments.
 *
 * Sort order: createdAt DESC (freshly-sent first). Click a row to open a
 * modal with the full PaymentRequestCard (same UI as user inbox, minus the
 * pending actions since admin is the sender, not recipient).
 */
export function OutgoingRequestsList() {
  const { data, isLoading, isError, error } = useOutgoingRequests();
  const [selected, setSelected] = useState<PaymentRequest | null>(null);

  const rows = useMemo(() => {
    const items = data ?? [];
    return [...items].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [data]);

  if (isLoading) {
    return (
      <>
        {/* Desktop skeleton */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-small">
            <thead>
              <tr className="border-b border-border text-text-secondary">
                <th className="px-3 py-3 text-left font-medium">Получатель</th>
                <th className="px-3 py-3 text-right font-medium">Сумма</th>
                <th className="px-3 py-3 text-left font-medium">Статус</th>
                <th className="px-3 py-3 text-left font-medium">Создан</th>
                <th className="px-3 py-3 text-left font-medium">Ответил</th>
              </tr>
            </thead>
            <tbody>
              <TableSkeletonRows />
            </tbody>
          </table>
        </div>
        <div className="md:hidden">
          <MobileSkeletonCards />
        </div>
      </>
    );
  }

  if (isError) {
    return (
      <EmptyState
        icon={<ErrorIcon />}
        title="Не удалось загрузить запросы"
        description={
          error instanceof Error ? error.message : 'Попробуйте обновить страницу'
        }
      />
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<OutboxIcon />}
        title="Нет исходящих запросов"
        description="Запросы, созданные из таблицы оплаты, появятся здесь"
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
              <th className="px-3 py-3 text-left font-medium">Получатель</th>
              <th className="px-3 py-3 text-right font-medium">Сумма</th>
              <th className="px-3 py-3 text-left font-medium">Статус</th>
              <th className="px-3 py-3 text-left font-medium">Создан</th>
              <th className="px-3 py-3 text-left font-medium">Ответил</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((req) => (
              <tr
                key={req.id}
                onClick={() => setSelected(req)}
                className="border-b border-border hover:bg-background/50 transition-colors cursor-pointer"
              >
                <td className="px-3 py-3 text-foreground font-medium">
                  {req.toUserName || `User #${req.toUserId}`}
                </td>
                <td className="px-3 py-3 text-right font-medium text-foreground">
                  {currencyFormatter.format(req.totalAmount)}
                </td>
                <td className="px-3 py-3">
                  <Badge variant={STATUS_VARIANT[req.status]} size="sm">
                    {STATUS_LABEL[req.status]}
                  </Badge>
                </td>
                <td className="px-3 py-3 text-text-secondary">
                  {formatDate(req.createdAt)}
                </td>
                <td className="px-3 py-3 text-text-secondary">
                  {formatDate(req.respondedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {rows.map((req) => (
          <button
            key={req.id}
            type="button"
            onClick={() => setSelected(req)}
            className="w-full text-left bg-surface rounded-card border border-border p-4 space-y-2 hover:bg-background/50 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-body font-medium text-foreground truncate">
                  {req.toUserName || `User #${req.toUserId}`}
                </p>
                <p className="text-xs text-text-muted mt-0.5">
                  Создан: {formatDate(req.createdAt)}
                </p>
                {req.respondedAt && (
                  <p className="text-xs text-text-muted">
                    Ответил: {formatDate(req.respondedAt)}
                  </p>
                )}
              </div>
              <Badge variant={STATUS_VARIANT[req.status]} size="sm">
                {STATUS_LABEL[req.status]}
              </Badge>
            </div>
            <p className="text-h3 font-bold text-foreground">
              {currencyFormatter.format(req.totalAmount)}
            </p>
          </button>
        ))}
      </div>

      {/* Details modal */}
      {selected && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => setSelected(null)}
            aria-hidden="true"
          />
          <div className="fixed inset-x-4 top-10 bottom-10 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-xl md:max-h-[85vh] bg-surface rounded-modal shadow-xl z-50 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-h3 font-semibold text-foreground">
                Детали запроса
              </h2>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="p-1 text-text-secondary hover:text-foreground transition-colors rounded-input hover:bg-background"
                aria-label="Закрыть"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <PaymentRequestCard request={selected} hideActions />
            </div>
          </div>
        </>
      )}
    </>
  );
}
