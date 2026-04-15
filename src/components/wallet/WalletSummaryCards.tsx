'use client';

import { StatCard } from '@/components/ui/StatCard';
import { StatCardSkeleton } from '@/components/ui/Skeleton';
import type { WalletSummary } from '@/types/wallet';

interface WalletSummaryCardsProps {
  summary: WalletSummary;
  loading?: boolean;
}

const currencyFormatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function WalletIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9A2.25 2.25 0 0 0 18.75 6.75H5.25A2.25 2.25 0 0 0 3 9v3" />
    </svg>
  );
}

function HourglassIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3.75h10.5m-10.5 0a.75.75 0 0 0-.75.75v1.5c0 2.071 1.679 3.75 3.75 3.75a3.75 3.75 0 0 1 3.75 3.75v4.5a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v-4.5a3.75 3.75 0 0 1 3.75-3.75c2.071 0 3.75-1.679 3.75-3.75v-1.5a.75.75 0 0 0-.75-.75m-10.5 16.5h10.5m-10.5 0a.75.75 0 0 1-.75-.75v-.75a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 .75.75v.75a.75.75 0 0 1-.75.75" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}

function AlertCircleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
    </svg>
  );
}

/**
 * Four-card grid for the wallet overview: earned, expected, paid, outstanding.
 * Mirrors PaymentSummaryCards style but shows wallet-specific figures.
 */
export function WalletSummaryCards({ summary, loading }: WalletSummaryCardsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        title="Заработано"
        value={currencyFormatter.format(summary.earned)}
        icon={<WalletIcon />}
        trend={`${summary.tasksEarnedCount} задач`}
      />
      <StatCard
        title="Ожидается"
        value={currencyFormatter.format(summary.expected)}
        icon={<HourglassIcon />}
        trend={`${summary.tasksExpectedCount} задач`}
      />
      <StatCard
        title="Оплачено"
        value={currencyFormatter.format(summary.paid)}
        icon={<CheckCircleIcon />}
        trend={summary.paid > 0 ? `+${currencyFormatter.format(summary.paid)}` : undefined}
        className="border-success/20"
      />
      <StatCard
        title="К получению"
        value={currencyFormatter.format(summary.outstanding)}
        icon={<AlertCircleIcon />}
        trend={summary.outstanding > 0 ? `-${currencyFormatter.format(summary.outstanding)}` : undefined}
        className="border-danger/20"
      />
    </div>
  );
}
