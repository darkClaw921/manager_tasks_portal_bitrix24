'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface InputFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

const InputField = forwardRef<HTMLInputElement, InputFieldProps>(
  ({ label, error, helperText, id, className, type = 'text', ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className={cn('space-y-1.5', className)}>
        {label && (
          <label
            htmlFor={inputId}
            className="block text-small font-medium text-foreground"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          type={type}
          className={cn(
            'w-full rounded-input border px-3 py-2.5 text-body text-foreground bg-surface placeholder:text-text-muted outline-none transition-colors',
            error
              ? 'border-danger focus:border-danger focus:ring-2 focus:ring-danger/20'
              : 'border-border focus:border-primary focus:ring-2 focus:ring-primary/20'
          )}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          {...props}
        />
        {error && (
          <p id={`${inputId}-error`} className="text-xs text-danger">
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

InputField.displayName = 'InputField';

export { InputField };
