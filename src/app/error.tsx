'use client';

import { useEffect } from 'react';

/**
 * Global error boundary.
 * Catches unhandled errors in the root layout tree.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[GlobalError]', error);
  }, [error]);

  return (
    <html>
      <body className="bg-[#F8FAFC] text-[#0F172A] font-sans">
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="max-w-md w-full text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#FEE2E2] flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="#DC2626" className="w-8 h-8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold mb-2">Something went wrong</h1>
            <p className="text-sm text-[#64748B] mb-6">
              An unexpected error occurred. Please try again or contact support if the problem persists.
            </p>
            {error.digest && (
              <p className="text-xs text-[#94A3B8] mb-4 font-mono">
                Error ID: {error.digest}
              </p>
            )}
            <button
              onClick={reset}
              className="inline-flex items-center px-4 py-2 bg-[#2563EB] text-white text-sm font-medium rounded-lg hover:bg-[#1D4ED8] transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
