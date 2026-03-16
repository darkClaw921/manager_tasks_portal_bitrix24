'use client';

import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options: SelectOption[];
  placeholder?: string;
}

const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
  ({ label, error, helperText, options, placeholder, id, className, ...props }, ref) => {
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className={cn('space-y-1.5', className)}>
        {label && (
          <label
            htmlFor={selectId}
            className="block text-small font-medium text-foreground"
          >
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={cn(
              'w-full appearance-none rounded-input border px-3 py-2.5 pr-10 text-body text-foreground bg-surface outline-none transition-colors cursor-pointer',
              error
                ? 'border-danger focus:border-danger focus:ring-2 focus:ring-danger/20'
                : 'border-border focus:border-primary focus:ring-2 focus:ring-primary/20'
            )}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? `${selectId}-error` : undefined}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option
                key={option.value}
                value={option.value}
                disabled={option.disabled}
              >
                {option.label}
              </option>
            ))}
          </select>
          {/* Custom dropdown arrow */}
          <svg
            className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m19.5 8.25-7.5 7.5-7.5-7.5"
            />
          </svg>
        </div>
        {error && (
          <p id={`${selectId}-error`} className="text-xs text-danger">
            {error}
          </p>
        )}
        {helperText && !error && (
          <p className="text-xs text-text-muted">{helperText}</p>
        )}
      </div>
    );
  }
);

SelectField.displayName = 'SelectField';

export { SelectField };
