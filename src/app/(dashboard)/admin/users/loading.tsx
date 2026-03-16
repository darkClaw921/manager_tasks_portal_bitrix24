export default function AdminUsersLoading() {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="h-7 bg-background rounded w-48 animate-pulse mb-2" />
          <div className="h-4 bg-background rounded w-64 animate-pulse" />
        </div>
        <div className="h-10 bg-background rounded w-28 animate-pulse" />
      </div>
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-surface rounded-card border border-border p-4 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-background" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-background rounded w-1/4" />
                <div className="h-3 bg-background rounded w-1/3" />
              </div>
              <div className="h-6 bg-background rounded-badge w-16" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
