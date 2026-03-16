'use client';

import { StatCard } from '@/components/ui/StatCard';
import { Button } from '@/components/ui/Button';
import ReactMarkdown from 'react-markdown';

interface ReportStats {
  total: number;
  completed: number;
  inProgress: number;
  overdue: number;
  newTasks: number;
  commentsCount: number;
}

interface ReportData {
  id: number;
  type: 'daily' | 'weekly';
  periodStart: string;
  periodEnd: string;
  content: string;
  stats: ReportStats;
  createdAt: string;
}

interface ReportSummaryProps {
  report: ReportData | null;
  isLoading: boolean;
  isRegenerating: boolean;
  onRegenerate: () => void;
}

function CompletedIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}

function InProgressIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}

function OverdueIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
    </svg>
  );
}

function TotalIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75 2.25 12l4.179 2.25m0-4.5 5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L12 12.75l-5.571-3m11.142 0L21.75 12l-4.179 2.25m0 0L12 17.25l-5.571-3m11.142 0L21.75 16.5 12 21.75 2.25 16.5l4.179-2.25" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182M2.985 19.644l3.181-3.183" />
    </svg>
  );
}

/** Skeleton loader for the report content area */
function ReportSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Stat cards skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-card bg-surface p-5 border border-border">
            <div className="h-3 bg-border rounded w-20 mb-3" />
            <div className="h-7 bg-border rounded w-12" />
          </div>
        ))}
      </div>
      {/* Content skeleton */}
      <div className="rounded-card bg-surface border border-border p-6 space-y-4">
        <div className="h-5 bg-border rounded w-48" />
        <div className="h-4 bg-border rounded w-full" />
        <div className="h-4 bg-border rounded w-3/4" />
        <div className="h-4 bg-border rounded w-5/6" />
        <div className="h-4 bg-border rounded w-2/3" />
        <div className="h-4 bg-border rounded w-full" />
        <div className="h-4 bg-border rounded w-1/2" />
      </div>
    </div>
  );
}

export function ReportSummary({ report, isLoading, isRegenerating, onRegenerate }: ReportSummaryProps) {
  if (isLoading) {
    return <ReportSkeleton />;
  }

  if (!report) {
    return (
      <div className="rounded-card bg-surface border border-border p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-primary-light flex items-center justify-center mx-auto mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-primary">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
          </svg>
        </div>
        <h3 className="text-h3 font-semibold text-foreground mb-2">Отчёт пока не создан</h3>
        <p className="text-small text-text-secondary mb-4">
          Нажмите кнопку для генерации AI-отчёта по вашим задачам
        </p>
        <Button onClick={onRegenerate} loading={isRegenerating}>
          Сгенерировать отчёт
        </Button>
      </div>
    );
  }

  const stats = report.stats;

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Всего задач"
          value={stats.total}
          icon={<TotalIcon />}
        />
        <StatCard
          title="Выполнено"
          value={stats.completed}
          icon={<CompletedIcon />}
        />
        <StatCard
          title="В работе"
          value={stats.inProgress}
          icon={<InProgressIcon />}
        />
        <StatCard
          title="Просрочено"
          value={stats.overdue}
          icon={<OverdueIcon />}
        />
      </div>

      {/* Report content */}
      <div className="rounded-card bg-surface border border-border">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h3 className="text-h3 font-semibold text-foreground">AI Анализ</h3>
            <p className="text-xs text-text-muted mt-0.5">
              {new Date(report.createdAt).toLocaleString('ru-RU', {
                day: 'numeric',
                month: 'long',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={onRegenerate}
            loading={isRegenerating}
          >
            <RefreshIcon />
            Обновить
          </Button>
        </div>
        <div className="px-6 py-5 prose prose-sm max-w-none text-foreground
          prose-headings:text-foreground prose-headings:font-semibold
          prose-h2:text-h3 prose-h2:mt-6 prose-h2:mb-3
          prose-h3:text-body prose-h3:mt-4 prose-h3:mb-2
          prose-p:text-body prose-p:text-text-secondary prose-p:leading-relaxed
          prose-li:text-body prose-li:text-text-secondary
          prose-strong:text-foreground prose-strong:font-semibold
          prose-ul:my-2 prose-ol:my-2
          prose-hr:border-border">
          <ReactMarkdown>{report.content}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
