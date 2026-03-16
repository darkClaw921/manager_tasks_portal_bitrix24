import { cn } from '@/lib/utils';

export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'portal' | 'primary';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  /** Custom color for portal variant (hex) */
  color?: string;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-background text-text-secondary border border-border',
  success: 'bg-success-light text-success',
  warning: 'bg-warning-light text-warning',
  danger: 'bg-danger-light text-danger',
  primary: 'bg-primary-light text-primary',
  portal: '', // custom color via inline style
};

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-small',
};

export function Badge({
  children,
  variant = 'default',
  size = 'sm',
  color,
  className,
}: BadgeProps) {
  const isPortal = variant === 'portal' && color;

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-badge whitespace-nowrap',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      style={
        isPortal
          ? {
              backgroundColor: `${color}20`,
              color: color,
            }
          : undefined
      }
    >
      {children}
    </span>
  );
}
