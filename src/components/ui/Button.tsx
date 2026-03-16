'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-text-inverse hover:bg-primary-hover focus:ring-primary/30',
  secondary:
    'bg-surface text-foreground border border-border hover:bg-background focus:ring-primary/20',
  danger:
    'bg-danger text-text-inverse hover:bg-red-700 focus:ring-danger/30',
  ghost:
    'bg-transparent text-text-secondary hover:bg-background hover:text-foreground focus:ring-primary/20',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-small gap-1.5',
  md: 'px-4 py-2.5 text-body gap-2',
  lg: 'px-6 py-3 text-h3 gap-2.5',
};

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('animate-spin', className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      width="16"
      height="16"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      fullWidth = false,
      disabled,
      className,
      children,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={cn(
          'inline-flex items-center justify-center font-medium rounded-input transition-colors focus:outline-none focus:ring-2',
          variantClasses[variant],
          sizeClasses[size],
          fullWidth && 'w-full',
          isDisabled && 'opacity-60 cursor-not-allowed',
          className
        )}
        {...props}
      >
        {loading && <Spinner />}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

export { Button };
