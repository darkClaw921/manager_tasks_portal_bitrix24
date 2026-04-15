'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  WalletSummaryCards,
  WalletRatesTable,
  CustomPaymentDialog,
  PaymentRequestInbox,
} from '@/components/wallet';
import { useWalletSummary, useWalletRates } from '@/hooks/useWallet';
import type { WalletRate } from '@/types/wallet';

type WalletTab = 'earned' | 'expected' | 'deferred' | 'requests';

const TABS: { value: WalletTab; label: string }[] = [
  { value: 'earned', label: 'Заработано' },
  { value: 'expected', label: 'Ожидается' },
  { value: 'deferred', label: 'Отложено' },
  { value: 'requests', label: 'Запросы оплаты' },
];

function isWalletTab(v: string | null): v is WalletTab {
  return v === 'earned' || v === 'expected' || v === 'deferred' || v === 'requests';
}

function WalletIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9A2.25 2.25 0 0 0 18.75 6.75H5.25A2.25 2.25 0 0 0 3 9v3" />
    </svg>
  );
}

function RatesTab({ group }: { group: 'earned' | 'expected' | 'deferred' }) {
  const { data, isLoading } = useWalletRates({ group });
  const [editingRate, setEditingRate] = useState<WalletRate | null>(null);

  return (
    <>
      <WalletRatesTable
        rates={data ?? []}
        loading={isLoading}
        onEdit={setEditingRate}
      />
      <CustomPaymentDialog rate={editingRate} onClose={() => setEditingRate(null)} />
    </>
  );
}

function WalletPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get('tab');
  const initialTab: WalletTab = isWalletTab(rawTab) ? rawTab : 'earned';
  const [activeTab, setActiveTab] = useState<WalletTab>(initialTab);

  // Keep local state in sync when the user navigates via back/forward.
  useEffect(() => {
    if (isWalletTab(rawTab) && rawTab !== activeTab) {
      setActiveTab(rawTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawTab]);

  const handleTabChange = useCallback(
    (tab: WalletTab) => {
      setActiveTab(tab);
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', tab);
      router.replace(`/wallet?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const { data: summary, isLoading: summaryLoading } = useWalletSummary();

  const fallbackSummary = {
    earned: 0,
    expected: 0,
    deferred: 0,
    paid: 0,
    outstanding: 0,
    tasksEarnedCount: 0,
    tasksExpectedCount: 0,
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-card bg-primary-light flex items-center justify-center text-primary">
          <WalletIcon />
        </div>
        <div>
          <h1 className="text-h2 font-bold text-foreground">Кошелёк</h1>
          <p className="text-small text-text-secondary">
            Ваши начисления, оплаты и запросы на оплату
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <WalletSummaryCards
        summary={summary ?? fallbackSummary}
        loading={summaryLoading}
      />

      {/* Tabs */}
      <div className="border-b border-border">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => handleTabChange(tab.value)}
              className={cn(
                'px-4 py-2.5 text-small font-medium transition-colors whitespace-nowrap border-b-2 -mb-px',
                activeTab === tab.value
                  ? 'text-primary border-primary'
                  : 'text-text-secondary border-transparent hover:text-foreground hover:border-border'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'earned' && <RatesTab group="earned" />}
      {activeTab === 'expected' && <RatesTab group="expected" />}
      {activeTab === 'deferred' && <RatesTab group="deferred" />}
      {activeTab === 'requests' && <PaymentRequestInbox />}
    </div>
  );
}

export default function WalletPage() {
  return (
    <Suspense fallback={<div className="h-64" />}>
      <WalletPageContent />
    </Suspense>
  );
}
