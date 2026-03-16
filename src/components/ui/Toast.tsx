'use client';

import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { cn } from '@/lib/utils';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextType {
  toast: (type: ToastType, message: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

let nextId = 0;

/**
 * Hook to show toast notifications from any component.
 */
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    // Return a no-op if used outside provider (graceful fallback)
    return {
      toast: (type: ToastType, message: string) => {
        console.log(`[toast] ${type}: ${message}`);
      },
    };
  }
  return context;
}

/**
 * Toast provider. Wrap your app (or layout) with this.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((type: ToastType, message: string) => {
    const id = ++nextId;
    setToasts((prev) => [...prev, { id, type, message }]);

    // Auto-dismiss after 4 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast container */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
          {toasts.map((t) => (
            <ToastMessage key={t.id} toast={t} onDismiss={dismiss} />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

function ToastMessage({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Animate in
    requestAnimationFrame(() => setIsVisible(true));
  }, []);

  const iconMap: Record<ToastType, React.ReactNode> = {
    success: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-success">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    ),
    error: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-danger">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
      </svg>
    ),
    warning: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-warning">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
      </svg>
    ),
    info: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-primary">
        <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
      </svg>
    ),
  };

  const bgMap: Record<ToastType, string> = {
    success: 'border-l-success',
    error: 'border-l-danger',
    warning: 'border-l-warning',
    info: 'border-l-primary',
  };

  return (
    <div
      className={cn(
        'pointer-events-auto bg-surface rounded-card border border-border border-l-4 shadow-lg p-3 flex items-start gap-2 transition-all duration-300',
        bgMap[toast.type],
        isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      )}
    >
      <div className="shrink-0 mt-0.5">{iconMap[toast.type]}</div>
      <p className="text-small text-foreground flex-1">{toast.message}</p>
      <button
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 p-0.5 rounded hover:bg-background transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-text-muted">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
