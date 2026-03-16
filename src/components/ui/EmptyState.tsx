'use client';

import { Button } from './Button';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionHref?: string;
  className?: string;
}

/**
 * Reusable empty state component.
 * Shows a centered illustration/icon, title, description, and optional CTA button.
 */
export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  actionHref,
  className = '',
}: EmptyStateProps) {
  const handleAction = () => {
    if (onAction) {
      onAction();
    } else if (actionHref) {
      window.location.href = actionHref;
    }
  };

  return (
    <div className={`flex flex-col items-center justify-center py-12 px-4 text-center ${className}`}>
      {icon ? (
        <div className="w-16 h-16 mb-4 rounded-full bg-background flex items-center justify-center text-text-muted">
          {icon}
        </div>
      ) : (
        <div className="w-16 h-16 mb-4 rounded-full bg-background flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-text-muted">
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
          </svg>
        </div>
      )}
      <h3 className="text-small font-semibold text-foreground mb-1">{title}</h3>
      {description && (
        <p className="text-xs text-text-secondary max-w-sm mb-4">{description}</p>
      )}
      {actionLabel && (onAction || actionHref) && (
        <Button variant="primary" size="sm" onClick={handleAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
