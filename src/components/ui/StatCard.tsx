import { cn } from '@/lib/utils';

export interface StatCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  /** Trend value, e.g. "+5" or "-2". Positive = success, negative = danger */
  trend?: string;
  /** Optional: label for the trend, e.g. "за сегодня" */
  trendLabel?: string;
  className?: string;
}

export function StatCard({
  title,
  value,
  icon,
  trend,
  trendLabel,
  className,
}: StatCardProps) {
  const isPositiveTrend = trend?.startsWith('+');
  const isNegativeTrend = trend?.startsWith('-');

  return (
    <div
      className={cn(
        'rounded-card bg-surface p-5 border border-border shadow-sm',
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-small text-text-secondary">{title}</p>
          <p className="text-h1 font-bold text-foreground">{value}</p>
        </div>
        <div className="w-10 h-10 rounded-card bg-primary-light flex items-center justify-center text-primary shrink-0">
          {icon}
        </div>
      </div>

      {trend && (
        <div className="mt-3 flex items-center gap-1.5">
          <span
            className={cn(
              'text-small font-medium',
              isPositiveTrend && 'text-success',
              isNegativeTrend && 'text-danger',
              !isPositiveTrend && !isNegativeTrend && 'text-text-secondary'
            )}
          >
            {trend}
          </span>
          {trendLabel && (
            <span className="text-xs text-text-muted">{trendLabel}</span>
          )}
        </div>
      )}
    </div>
  );
}
