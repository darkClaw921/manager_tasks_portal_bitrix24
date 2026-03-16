'use client';

import { forwardRef, type TextareaHTMLAttributes, useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

export interface TextareaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  autoResize?: boolean;
}

const TextareaField = forwardRef<HTMLTextAreaElement, TextareaFieldProps>(
  ({ label, error, helperText, autoResize = true, id, className, onChange, ...props }, ref) => {
    const textareaId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
    const internalRef = useRef<HTMLTextAreaElement | null>(null);

    const setRefs = useCallback(
      (node: HTMLTextAreaElement | null) => {
        internalRef.current = node;
        if (typeof ref === 'function') {
          ref(node);
        } else if (ref) {
          ref.current = node;
        }
      },
      [ref]
    );

    const adjustHeight = useCallback(() => {
      const textarea = internalRef.current;
      if (textarea && autoResize) {
        textarea.style.height = 'auto';
        textarea.style.height = `${Math.max(textarea.scrollHeight, 100)}px`;
      }
    }, [autoResize]);

    useEffect(() => {
      adjustHeight();
    }, [adjustHeight]);

    return (
      <div className={cn('space-y-1.5', className)}>
        {label && (
          <label
            htmlFor={textareaId}
            className="block text-small font-medium text-foreground"
          >
            {label}
          </label>
        )}
        <textarea
          ref={setRefs}
          id={textareaId}
          className={cn(
            'w-full rounded-input border px-3 py-2.5 text-body text-foreground bg-surface placeholder:text-text-muted outline-none transition-colors resize-none',
            error
              ? 'border-danger focus:border-danger focus:ring-2 focus:ring-danger/20'
              : 'border-border focus:border-primary focus:ring-2 focus:ring-primary/20'
          )}
          style={{ minHeight: '100px' }}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${textareaId}-error` : undefined}
          onChange={(e) => {
            onChange?.(e);
            adjustHeight();
          }}
          {...props}
        />
        {error && (
          <p id={`${textareaId}-error`} className="text-xs text-danger">
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

TextareaField.displayName = 'TextareaField';

export { TextareaField };
