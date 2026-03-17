'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';

/**
 * Dashboard error boundary.
 * Catches errors within the dashboard layout.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[DashboardError]', error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[400px] p-4">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-danger-light flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-danger">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
        </div>
        <h2 className="text-h3 font-bold text-foreground mb-2">Что-то пошло не так</h2>
        <p className="text-small text-text-secondary mb-6">
          {error.message || 'An unexpected error occurred. Please try again.'}
        </p>
        {error.digest && (
          <p className="text-xs text-text-muted mb-4 font-mono">
            ID ошибки: {error.digest}
          </p>
        )}
        <div className="flex items-center justify-center gap-3">
          <Button variant="primary" onClick={reset}>
            Попробовать снова
          </Button>
          <Button variant="ghost" onClick={() => window.location.href = '/dashboard'}>
            На главную
          </Button>
        </div>
      </div>
    </div>
  );
}
