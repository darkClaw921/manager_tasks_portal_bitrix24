'use client';

import { useState } from 'react';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import {
  useAcceptPaymentRequest,
  useRejectPaymentRequest,
} from '@/hooks/usePaymentRequests';
import { PaymentRequestModifyDialog } from './PaymentRequestModifyDialog';
import type {
  PaymentRequest,
  PaymentRequestStatus,
} from '@/types/payment-request';

interface PaymentRequestCardProps {
  request: PaymentRequest;
  /**
   * Hide the accept/modify/reject actions for pending requests. Used when the
   * current user is the sender (admin viewing outgoing request): the actions
   * are only usable by the recipient and would 403 if invoked.
   */
  hideActions?: boolean;
}

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
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return dateFormatter.format(d);
}

/**
 * One payment request inside the inbox.
 *
 * For status='pending' shows three actions:
 *  - "Принять как есть": accept without overrides — backend status becomes 'accepted'
 *  - "Изменить и принять": opens PaymentRequestModifyDialog
 *  - "Отклонить": confirm and call reject (backend status becomes 'rejected')
 *
 * For any non-pending status shows the badge + respondedAt only.
 *
 * When an item has appliedAmount set (post-accept), it is shown alongside
 * the original proposedAmount so the user can see exactly what was booked.
 */
export function PaymentRequestCard({
  request,
  hideActions = false,
}: PaymentRequestCardProps) {
  const { toast } = useToast();
  const acceptPaymentRequest = useAcceptPaymentRequest();
  const rejectPaymentRequest = useRejectPaymentRequest();
  const [modifyOpen, setModifyOpen] = useState(false);

  const isPending = request.status === 'pending';
  const showActions = isPending && !hideActions;
  const busy =
    acceptPaymentRequest.isPending || rejectPaymentRequest.isPending;

  const handleAcceptAsIs = () => {
    acceptPaymentRequest.mutate(
      { id: request.id },
      {
        onSuccess: () => {
          toast('success', 'Запрос принят');
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

  const handleReject = () => {
    if (
      typeof window !== 'undefined' &&
      !window.confirm('Отклонить запрос оплаты?')
    ) {
      return;
    }
    rejectPaymentRequest.mutate(
      { id: request.id },
      {
        onSuccess: () => {
          toast('success', 'Запрос отклонён');
        },
        onError: (err) => {
          toast(
            'error',
            err instanceof Error ? err.message : 'Не удалось отклонить запрос'
          );
        },
      }
    );
  };

  return (
    <>
      <div className="bg-surface rounded-card border border-border p-4 md:p-5 space-y-3">
        {/* Header: from + createdAt + status badge */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-small text-text-secondary">Запрос от</p>
            <p className="text-body font-semibold text-foreground truncate">
              {request.fromUserName || 'Администратор'}
            </p>
            <p className="text-xs text-text-muted mt-0.5">
              Создан: {formatDate(request.createdAt)}
              {request.respondedAt && !isPending && (
                <>
                  {' · '}
                  Ответ: {formatDate(request.respondedAt)}
                </>
              )}
            </p>
          </div>
          <Badge variant={STATUS_VARIANT[request.status]} size="md">
            {STATUS_LABEL[request.status]}
          </Badge>
        </div>

        {/* Items */}
        <ul className="divide-y divide-border rounded-input border border-border bg-background/40">
          {request.items.map((item) => {
            const hasApplied = typeof item.appliedAmount === 'number';
            return (
              <li
                key={item.id}
                className="px-3 py-2.5 flex items-start justify-between gap-3"
              >
                <span className="text-small text-foreground line-clamp-2 flex-1 min-w-0">
                  {item.taskTitle}
                </span>
                <div className="text-right flex-shrink-0 text-xs">
                  <div className="text-text-secondary">
                    Предложено:{' '}
                    <span className="text-foreground font-medium">
                      {currencyFormatter.format(item.proposedAmount)}
                    </span>
                  </div>
                  <div className="text-text-secondary">
                    Ожидается:{' '}
                    <span className="text-foreground font-medium">
                      {currencyFormatter.format(item.expectedAmount)}
                    </span>
                  </div>
                  {hasApplied && (
                    <div className="text-text-secondary">
                      Зачтено:{' '}
                      <span className="text-primary font-semibold">
                        {currencyFormatter.format(item.appliedAmount as number)}
                      </span>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {/* Note */}
        {request.note && (
          <div className="p-3 rounded-input bg-background border border-border">
            <p className="text-xs text-text-secondary mb-1">Комментарий</p>
            <p className="text-small text-foreground whitespace-pre-wrap">
              {request.note}
            </p>
          </div>
        )}

        {/* Total */}
        <div className="flex items-center justify-between pt-1">
          <span className="text-small text-text-secondary">Итого</span>
          <span className="text-h3 font-bold text-foreground">
            {currencyFormatter.format(request.totalAmount)}
          </span>
        </div>

        {/* Actions: only for pending, and only when not hidden (sender view) */}
        {showActions && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-border">
            <Button
              variant="primary"
              size="sm"
              onClick={handleAcceptAsIs}
              loading={acceptPaymentRequest.isPending}
              disabled={busy}
            >
              Принять как есть
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setModifyOpen(true)}
              disabled={busy}
            >
              Изменить и принять
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleReject}
              loading={rejectPaymentRequest.isPending}
              disabled={busy}
            >
              Отклонить
            </Button>
          </div>
        )}
      </div>

      <PaymentRequestModifyDialog
        request={modifyOpen ? request : null}
        onClose={() => setModifyOpen(false)}
      />
    </>
  );
}
