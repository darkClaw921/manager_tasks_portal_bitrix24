'use client';

import { useMemo } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useIncomingRequests } from '@/hooks/usePaymentRequests';
import { PaymentRequestCard } from './PaymentRequestCard';
import type { PaymentRequest } from '@/types/payment-request';

function InboxIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 0 0-2.15-1.588H6.911a2.25 2.25 0 0 0-2.15 1.588L2.35 13.177a2.25 2.25 0 0 0-.1.661Z" />
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

function CardSkeleton() {
  return (
    <div className="bg-surface rounded-card border border-border p-4 md:p-5 space-y-3 animate-pulse">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2 flex-1">
          <div className="h-3 bg-background rounded w-16" />
          <div className="h-4 bg-background rounded w-40" />
          <div className="h-3 bg-background rounded w-28" />
        </div>
        <div className="h-6 w-28 rounded-badge bg-background" />
      </div>
      <div className="h-20 rounded-input bg-background" />
      <div className="flex items-center justify-between">
        <div className="h-3 bg-background rounded w-12" />
        <div className="h-6 bg-background rounded w-24" />
      </div>
    </div>
  );
}

interface SortedRequests {
  pending: PaymentRequest[];
  history: PaymentRequest[];
}

function splitAndSort(requests: PaymentRequest[]): SortedRequests {
  const pending: PaymentRequest[] = [];
  const history: PaymentRequest[] = [];
  for (const r of requests) {
    if (r.status === 'pending') pending.push(r);
    else history.push(r);
  }
  // pending: createdAt DESC
  pending.sort((a, b) => {
    const da = new Date(a.createdAt).getTime();
    const db = new Date(b.createdAt).getTime();
    return db - da;
  });
  // history: respondedAt DESC (fallback to createdAt)
  history.sort((a, b) => {
    const da = new Date(a.respondedAt ?? a.createdAt).getTime();
    const db = new Date(b.respondedAt ?? b.createdAt).getTime();
    return db - da;
  });
  return { pending, history };
}

/**
 * Inbox view of incoming payment requests for the current user. Rendered
 * inside the "Запросы оплаты" tab on /wallet.
 *
 * Sections:
 *  - Ожидают ответа (status='pending', newest first)
 *  - История (accepted/modified/rejected, respondedAt DESC)
 *
 * States: loading (skeletons), error (retry via cached data handled by
 * react-query), empty (friendly illustration + text).
 */
export function PaymentRequestInbox() {
  const { data, isLoading, isError, error } = useIncomingRequests();

  const { pending, history } = useMemo<SortedRequests>(
    () => splitAndSort(data ?? []),
    [data]
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-5 w-40" />
        <CardSkeleton />
        <CardSkeleton />
      </div>
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

  if (pending.length === 0 && history.length === 0) {
    return (
      <EmptyState
        icon={<InboxIcon />}
        title="Нет запросов оплаты"
        description="Здесь появятся запросы оплаты от администратора"
      />
    );
  }

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-h3 font-semibold text-foreground">
              Ожидают ответа
            </h2>
            <span className="text-small text-text-secondary">
              ({pending.length})
            </span>
          </div>
          <div className="space-y-3">
            {pending.map((req) => (
              <PaymentRequestCard key={req.id} request={req} />
            ))}
          </div>
        </section>
      )}

      {history.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-h3 font-semibold text-foreground">История</h2>
            <span className="text-small text-text-secondary">
              ({history.length})
            </span>
          </div>
          <div className="space-y-3">
            {history.map((req) => (
              <PaymentRequestCard key={req.id} request={req} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
