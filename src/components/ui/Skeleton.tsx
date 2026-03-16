'use client';

import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
}

/**
 * Basic skeleton loading element with pulse animation.
 */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div className={cn('animate-pulse bg-background rounded', className)} />
  );
}

/**
 * Skeleton for a single TaskRow.
 */
export function TaskRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-card bg-surface animate-pulse">
      <div className="w-2.5 h-2.5 rounded-full bg-background" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-background rounded w-3/4" />
        <div className="flex items-center gap-2">
          <div className="h-3 bg-background rounded w-16" />
          <div className="h-3 bg-background rounded w-20" />
        </div>
      </div>
      <div className="hidden sm:flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-background" />
        <div className="h-3 bg-background rounded w-20" />
      </div>
    </div>
  );
}

/**
 * Skeleton for StatCard.
 */
export function StatCardSkeleton() {
  return (
    <div className="bg-surface rounded-card border border-border p-4 animate-pulse">
      <div className="flex items-center justify-between mb-2">
        <div className="h-3 bg-background rounded w-20" />
        <div className="w-8 h-8 rounded-input bg-background" />
      </div>
      <div className="h-7 bg-background rounded w-12 mt-1" />
    </div>
  );
}

/**
 * Skeleton for full dashboard page.
 */
export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* StatCards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
      {/* Task list */}
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <TaskRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

/**
 * Skeleton for portal list.
 */
export function PortalListSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 p-4 rounded-card border border-border bg-surface animate-pulse">
          <div className="w-10 h-10 rounded-input bg-background" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-background rounded w-1/3" />
            <div className="h-3 bg-background rounded w-1/2" />
          </div>
          <div className="h-6 bg-background rounded-badge w-16" />
        </div>
      ))}
    </div>
  );
}

/**
 * Skeleton for reports page.
 */
export function ReportSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
      <div className="bg-surface rounded-card border border-border p-6 space-y-3">
        <div className="h-4 bg-background rounded w-2/3" />
        <div className="h-3 bg-background rounded w-full" />
        <div className="h-3 bg-background rounded w-5/6" />
        <div className="h-3 bg-background rounded w-3/4" />
        <div className="h-3 bg-background rounded w-4/5" />
      </div>
    </div>
  );
}

/**
 * Skeleton for notification list.
 */
export function NotificationSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-start gap-3 p-3 rounded-input animate-pulse">
          <div className="w-8 h-8 rounded-full bg-background" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-background rounded w-2/3" />
            <div className="h-3 bg-background rounded w-1/2" />
          </div>
          <div className="h-3 bg-background rounded w-12" />
        </div>
      ))}
    </div>
  );
}
