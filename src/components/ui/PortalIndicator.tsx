import { cn } from '@/lib/utils';

export type PortalIndicatorSize = 'sm' | 'md';

export interface PortalIndicatorProps {
  /** Hex color for the portal dot */
  color: string;
  size?: PortalIndicatorSize;
  className?: string;
}

const sizeClasses: Record<PortalIndicatorSize, string> = {
  sm: 'w-2.5 h-2.5',
  md: 'w-3.5 h-3.5',
};

export function PortalIndicator({
  color,
  size = 'md',
  className,
}: PortalIndicatorProps) {
  return (
    <span
      className={cn('inline-block rounded-full shrink-0', sizeClasses[size], className)}
      style={{ backgroundColor: color }}
      aria-hidden="true"
    />
  );
}
