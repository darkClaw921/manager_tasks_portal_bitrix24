'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ReportSummary } from '@/components/reports/ReportSummary';
import { ReportChat } from '@/components/reports/ReportChat';
import {
  useDailyReport,
  useWeeklyReport,
  useRegenerateDaily,
  useRegenerateWeekly,
} from '@/hooks/useReports';

type ReportTab = 'daily' | 'weekly';

function ReportIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0 1 16.5 7.605" />
    </svg>
  );
}

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<ReportTab>('daily');

  // Report queries
  const dailyReport = useDailyReport();
  const weeklyReport = useWeeklyReport();

  // Regeneration mutations
  const regenerateDaily = useRegenerateDaily();
  const regenerateWeekly = useRegenerateWeekly();

  const tabs: { id: ReportTab; label: string }[] = [
    { id: 'daily', label: 'Ежедневный' },
    { id: 'weekly', label: 'Еженедельный' },
  ];

  const currentReport = activeTab === 'daily' ? dailyReport : weeklyReport;
  const isRegenerating = activeTab === 'daily'
    ? regenerateDaily.isPending
    : regenerateWeekly.isPending;

  const handleRegenerate = () => {
    if (activeTab === 'daily') {
      regenerateDaily.mutate(undefined);
    } else {
      regenerateWeekly.mutate(undefined);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-card bg-primary-light flex items-center justify-center text-primary">
          <ReportIcon />
        </div>
        <div>
          <h1 className="text-h2 font-bold text-foreground">AI Отчёты</h1>
          <p className="text-small text-text-secondary">
            Аналитика и рекомендации по вашим задачам
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-background rounded-input p-1 border border-border w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'px-4 py-2 text-small font-medium rounded-input transition-colors',
              activeTab === tab.id
                ? 'bg-surface text-foreground shadow-sm'
                : 'text-text-secondary hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Report content */}
      <ReportSummary
        report={currentReport.data || null}
        isLoading={currentReport.isLoading}
        isRegenerating={isRegenerating}
        onRegenerate={handleRegenerate}
      />

      {/* AI Chat section */}
      <div className="mt-8">
        <ReportChat />
      </div>
    </div>
  );
}
