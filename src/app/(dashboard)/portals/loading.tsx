import { PortalListSkeleton } from '@/components/ui/Skeleton';

export default function PortalsLoading() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="h-7 bg-background rounded w-48 animate-pulse" />
      <div className="bg-surface rounded-card border border-border p-6 space-y-4 animate-pulse">
        <div className="h-10 bg-background rounded" />
        <div className="h-10 bg-background rounded w-1/3" />
      </div>
      <PortalListSkeleton />
    </div>
  );
}
