/**
 * Calendar page loading skeleton.
 * Mirrors the real calendar layout: header bar + 7-column time grid
 * with placeholder task blocks. Server component (no 'use client').
 */
export default function CalendarLoading() {
  return (
    <div className="flex flex-col h-full -m-4 md:-m-6">
      {/* ---- Header skeleton ---- */}
      <div className="flex flex-wrap items-center gap-4 px-4 md:px-8 py-3.5 bg-surface border-b border-border animate-pulse">
        {/* Icon + Title */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-5 h-5 bg-background rounded" />
          <div className="h-5 bg-background rounded w-24" />
        </div>

        <div className="flex-1 min-w-0" />

        {/* Navigation buttons placeholder */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-7 h-7 bg-background rounded-md" />
          <div className="h-4 bg-background rounded w-36" />
          <div className="w-7 h-7 bg-background rounded-md" />
          <div className="h-7 bg-background rounded-md w-16" />
        </div>

        {/* View tabs placeholder */}
        <div className="flex rounded-lg border border-border overflow-hidden shrink-0">
          <div className="h-8 bg-background w-16" />
          <div className="h-8 bg-background/60 w-20" />
          <div className="h-8 bg-background/60 w-16" />
        </div>

        {/* Action button placeholder */}
        <div className="h-8 bg-background rounded-md w-28 shrink-0" />
      </div>

      {/* ---- Grid skeleton ---- */}
      <div className="flex-1 overflow-hidden">
        <div className="flex flex-col h-full">
          {/* Column headers */}
          <div className="flex shrink-0 border-b border-border bg-surface animate-pulse">
            <div className="shrink-0 border-r border-border" style={{ width: 56 }} />
            {Array.from({ length: 7 }, (_, i) => (
              <div
                key={i}
                className="flex-1 flex flex-col items-center justify-center gap-1 py-2 border-l border-border"
              >
                <div className="h-3 bg-background rounded w-6" />
                <div className="h-7 w-7 bg-background rounded-full" />
              </div>
            ))}
          </div>

          {/* Grid body with hour rows and task placeholders */}
          <div className="flex-1 overflow-y-auto">
            <div className="flex" style={{ height: 720 }}>
              {/* Time gutter */}
              <div
                className="shrink-0 relative border-r border-border animate-pulse"
                style={{ width: 56, height: 720 }}
              >
                {Array.from({ length: 10 }, (_, i) => (
                  <div
                    key={i}
                    className="absolute right-2"
                    style={{ top: i * 80 - 6, fontSize: 11 }}
                  >
                    <div className="h-3 bg-background rounded w-8" />
                  </div>
                ))}
              </div>

              {/* 7 columns with fake task blocks */}
              {Array.from({ length: 7 }, (_, col) => {
                // Pseudo-random task block positions per column
                const blocks = SKELETON_BLOCKS[col];

                return (
                  <div
                    key={col}
                    className="flex-1 relative border-l border-border"
                    style={{ height: 720 }}
                  >
                    {/* Hour lines */}
                    {Array.from({ length: 9 }, (_, i) => (
                      <div
                        key={i}
                        className="absolute left-0 right-0 border-b border-border"
                        style={{ top: (i + 1) * 80 }}
                      />
                    ))}

                    {/* Skeleton task blocks */}
                    {blocks.map((block, bi) => (
                      <div
                        key={bi}
                        className="absolute left-1 right-1 bg-background animate-pulse rounded-md"
                        style={{
                          top: block.top,
                          height: block.height,
                          borderLeft: '3px solid var(--color-border)',
                        }}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Pre-defined skeleton task block positions per column (deterministic, no randomness)
const SKELETON_BLOCKS: { top: number; height: number }[][] = [
  // Mon
  [
    { top: 40, height: 80 },
    { top: 200, height: 60 },
    { top: 480, height: 100 },
  ],
  // Tue
  [
    { top: 80, height: 120 },
    { top: 320, height: 60 },
  ],
  // Wed
  [
    { top: 0, height: 60 },
    { top: 160, height: 80 },
    { top: 400, height: 60 },
    { top: 560, height: 80 },
  ],
  // Thu
  [
    { top: 120, height: 100 },
    { top: 360, height: 80 },
  ],
  // Fri
  [
    { top: 40, height: 60 },
    { top: 200, height: 120 },
    { top: 520, height: 60 },
  ],
  // Sat
  [
    { top: 160, height: 60 },
  ],
  // Sun
  [
    { top: 240, height: 80 },
  ],
];
