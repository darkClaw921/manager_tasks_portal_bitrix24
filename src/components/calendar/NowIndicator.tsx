'use client';

import { useState, useEffect } from 'react';
import { timeToPixelOffset, WORK_HOURS } from '@/lib/calendar/utils';
import { cn } from '@/lib/utils';

export interface NowIndicatorProps {
  className?: string;
}

/**
 * Red horizontal line indicating the current time on the calendar grid.
 * Auto-updates position every 60 seconds.
 * Hidden when outside working hours (09:00-18:00).
 */
export function NowIndicator({ className }: NowIndicatorProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 60_000);

    return () => clearInterval(interval);
  }, []);

  const hours = now.getHours();
  const minutes = now.getMinutes();
  const totalHours = hours + minutes / 60;

  // Hide outside working hours
  if (totalHours < WORK_HOURS.start || totalHours >= WORK_HOURS.end) {
    return null;
  }

  const top = timeToPixelOffset(now);

  return (
    <div
      className={cn('absolute left-0 right-0 z-20 pointer-events-none', className)}
      style={{ top }}
    >
      {/* Red dot on the left edge */}
      <div
        className="absolute bg-danger rounded-full"
        style={{
          width: 10,
          height: 10,
          left: -4,
          top: -4,
        }}
      />
      {/* Red line */}
      <div className="w-full bg-danger" style={{ height: 2 }} />
    </div>
  );
}
