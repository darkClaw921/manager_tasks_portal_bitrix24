'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import {
  PaymentSummaryCards,
  PaymentFilters,
  PaymentTable,
} from '@/components/payments';
import { usePayments, useUpdatePaymentStatus, useBatchUpdatePaymentStatus } from '@/hooks/usePayments';
import { usePortals } from '@/hooks/usePortals';
import { useUsers } from '@/hooks/useUsers';
import type { PaymentFilters as PaymentFiltersType } from '@/types';

function PaymentIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  );
}

const DEFAULT_LIMIT = 20;

export default function PaymentsPage() {
  const [filters, setFilters] = useState<PaymentFiltersType>({
    page: 1,
    limit: DEFAULT_LIMIT,
  });
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isAdmin, setIsAdmin] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  // Check admin status
  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.user?.isAdmin) setIsAdmin(true);
      })
      .catch(() => {});
  }, []);

  // Data hooks
  const { data: paymentsData, isLoading } = usePayments(filters);
  const { data: portals } = usePortals();
  const { data: users } = useUsers();
  const updateStatus = useUpdatePaymentStatus();
  const batchUpdate = useBatchUpdatePaymentStatus();

  const rates = paymentsData?.data ?? [];
  const summary = paymentsData?.summary ?? { totalEarned: 0, totalPaid: 0, totalUnpaid: 0, taskCount: 0 };
  const totalPages = paymentsData?.totalPages ?? 1;
  const currentPage = paymentsData?.page ?? 1;

  // Selection handlers
  const handleToggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (rates.every((r) => selectedIds.has(r.id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rates.map((r) => r.id)));
    }
  }, [rates, selectedIds]);

  // Payment status handlers
  const handleTogglePaid = useCallback(
    (id: number, isPaid: boolean) => {
      updateStatus.mutate({ rateId: id, isPaid });
    },
    [updateStatus]
  );

  const handleBatchPaid = useCallback(
    (isPaid: boolean) => {
      const rateIds = Array.from(selectedIds);
      if (rateIds.length === 0) return;
      batchUpdate.mutate(
        { rateIds, isPaid },
        {
          onSuccess: () => setSelectedIds(new Set()),
        }
      );
    },
    [selectedIds, batchUpdate]
  );

  // Close export menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // PDF export
  const handleExportPdf = useCallback(async (design: 'official' | 'modern') => {
    setExportMenuOpen(false);
    setExporting(true);
    const params = new URLSearchParams();
    params.set('design', design);
    if (filters.portalId != null) params.set('portalId', String(filters.portalId));
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params.set('dateTo', filters.dateTo);
    if (filters.isPaid != null) params.set('isPaid', String(filters.isPaid));
    if (filters.taskStatus) params.set('taskStatus', filters.taskStatus);
    if (filters.userId != null) params.set('userId', String(filters.userId));

    try {
      const res = await fetch(`/api/payments/export?${params.toString()}`);
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payments-${design}-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // silently fail or show toast
    } finally {
      setExporting(false);
    }
  }, [filters]);

  // Pagination
  const handlePrevPage = () => {
    if (currentPage > 1) {
      setFilters((prev) => ({ ...prev, page: currentPage - 1 }));
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setFilters((prev) => ({ ...prev, page: currentPage + 1 }));
    }
  };

  // Clear selection on filter/page change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [filters]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-card bg-primary-light flex items-center justify-center text-primary">
            <PaymentIcon />
          </div>
          <div>
            <h1 className="text-h2 font-bold text-foreground">Оплата</h1>
            <p className="text-small text-text-secondary">
              Учёт и контроль оплат по задачам
            </p>
          </div>
        </div>
        <div className="relative" ref={exportRef}>
          <Button variant="secondary" size="sm" onClick={() => setExportMenuOpen(!exportMenuOpen)} disabled={exporting}>
            <ExportIcon />
            <span className="ml-1.5">{exporting ? 'Экспорт...' : 'Экспорт PDF'}</span>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5 ml-1">
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </Button>
          {exportMenuOpen && (
            <div className="absolute right-0 top-full mt-1 w-56 bg-card border border-border rounded-card shadow-lg z-50 overflow-hidden">
              <button
                className="w-full text-left px-4 py-3 hover:bg-hover transition-colors border-b border-border"
                onClick={() => handleExportPdf('official')}
              >
                <div className="text-small font-medium text-foreground">Официальный</div>
                <div className="text-xs text-text-secondary mt-0.5">Классический формальный стиль</div>
              </button>
              <button
                className="w-full text-left px-4 py-3 hover:bg-hover transition-colors"
                onClick={() => handleExportPdf('modern')}
              >
                <div className="text-small font-medium text-foreground">Современный</div>
                <div className="text-xs text-text-secondary mt-0.5">Цветной дизайн с карточками</div>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <PaymentSummaryCards summary={summary} loading={isLoading} />

      {/* Filters */}
      <PaymentFilters
        filters={filters}
        onFiltersChange={setFilters}
        portals={portals ?? []}
        isAdmin={isAdmin}
        users={isAdmin ? users?.map((u) => ({ id: u.id, firstName: u.firstName, lastName: u.lastName })) : undefined}
      />

      {/* Batch actions bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-primary-light rounded-card border border-primary/20">
          <span className="text-small font-medium text-foreground">
            Выбрано: {selectedIds.size}
          </span>
          <Button
            variant="primary"
            size="sm"
            onClick={() => handleBatchPaid(true)}
            disabled={batchUpdate.isPending}
          >
            Отметить оплаченными
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleBatchPaid(false)}
            disabled={batchUpdate.isPending}
          >
            Отметить неоплаченными
          </Button>
        </div>
      )}

      {/* Table */}
      <PaymentTable
        rates={rates}
        selectedIds={selectedIds}
        onToggleSelect={handleToggleSelect}
        onSelectAll={handleSelectAll}
        onTogglePaid={handleTogglePaid}
        loading={isLoading}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePrevPage}
            disabled={currentPage <= 1}
          >
            Назад
          </Button>
          <span className="text-small text-text-secondary">
            Страница {currentPage} из {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNextPage}
            disabled={currentPage >= totalPages}
          >
            Вперёд
          </Button>
        </div>
      )}
    </div>
  );
}
