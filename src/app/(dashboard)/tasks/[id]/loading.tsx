export default function TaskDetailLoading() {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6 animate-pulse">
        <div className="h-8 w-8 rounded-input bg-background" />
        <div className="h-6 bg-background rounded w-64" />
      </div>
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Main content */}
        <div className="flex-1 space-y-6 animate-pulse">
          <div className="bg-surface rounded-card border border-border p-6 space-y-3">
            <div className="h-5 bg-background rounded w-3/4" />
            <div className="h-4 bg-background rounded w-full" />
            <div className="h-4 bg-background rounded w-5/6" />
            <div className="h-4 bg-background rounded w-2/3" />
          </div>
          <div className="bg-surface rounded-card border border-border p-6 space-y-3">
            <div className="h-4 bg-background rounded w-24" />
            <div className="h-2 bg-background rounded w-full" />
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-8 bg-background rounded" />
              ))}
            </div>
          </div>
        </div>
        {/* Sidebar */}
        <div className="lg:w-80 space-y-4 animate-pulse">
          <div className="bg-surface rounded-card border border-border p-6 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex justify-between">
                <div className="h-4 bg-background rounded w-20" />
                <div className="h-4 bg-background rounded w-24" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
