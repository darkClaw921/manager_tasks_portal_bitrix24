export default function SettingsLoading() {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="h-7 bg-background rounded w-32 mb-6 animate-pulse" />
      <div className="flex flex-col md:flex-row gap-6">
        <nav className="md:w-56 shrink-0">
          <div className="flex md:flex-col gap-1">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-background rounded-input animate-pulse" />
            ))}
          </div>
        </nav>
        <div className="flex-1 min-w-0">
          <div className="bg-surface rounded-card border border-border p-6 space-y-4 animate-pulse">
            <div className="h-5 bg-background rounded w-1/4" />
            <div className="h-10 bg-background rounded" />
            <div className="h-10 bg-background rounded" />
            <div className="h-10 bg-background rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}
