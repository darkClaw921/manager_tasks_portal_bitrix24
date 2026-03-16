'use client';

import { Button } from './Button';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

/**
 * Reusable error state component.
 * Shows an error icon, message, and retry button.
 */
export function ErrorState({
  title = 'Something went wrong',
  message = 'Failed to load data. Please try again.',
  onRetry,
  className = '',
}: ErrorStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-4 text-center ${className}`}>
      <div className="w-16 h-16 mb-4 rounded-full bg-danger-light flex items-center justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-danger">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
      </div>
      <h3 className="text-small font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-xs text-text-secondary max-w-sm mb-4">{message}</p>
      {onRetry && (
        <Button variant="primary" size="sm" onClick={onRetry}>
          Try Again
        </Button>
      )}
    </div>
  );
}
