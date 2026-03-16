'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';

export interface SearchInputProps {
  value?: string;
  placeholder?: string;
  onChange?: (value: string) => void;
  debounceMs?: number;
  className?: string;
}

export function SearchInput({
  value: controlledValue,
  placeholder = 'Поиск задач...',
  onChange,
  debounceMs = 300,
  className,
}: SearchInputProps) {
  const [localValue, setLocalValue] = useState(controlledValue ?? '');
  const debouncedValue = useDebounce(localValue, debounceMs);

  // Sync controlled value
  useEffect(() => {
    if (controlledValue !== undefined) {
      setLocalValue(controlledValue);
    }
  }, [controlledValue]);

  // Fire onChange on debounced value change
  useEffect(() => {
    onChange?.(debouncedValue);
  }, [debouncedValue]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClear = useCallback(() => {
    setLocalValue('');
    onChange?.('');
  }, [onChange]);

  return (
    <div className={cn('relative', className)}>
      {/* Search icon */}
      <svg
        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={2}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
        />
      </svg>

      <input
        type="text"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-9 py-2 rounded-input border border-border bg-surface text-body text-foreground placeholder:text-text-muted outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
      />

      {/* Clear button */}
      {localValue && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
          aria-label="Очистить поиск"
        >
          <svg
            className="w-4 h-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18 18 6M6 6l12 12"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
