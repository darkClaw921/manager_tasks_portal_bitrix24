import { ReportSkeleton } from '@/components/ui/Skeleton';

export default function ReportsLoading() {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="h-7 bg-background rounded w-40 mb-6 animate-pulse" />
      <ReportSkeleton />
    </div>
  );
}
