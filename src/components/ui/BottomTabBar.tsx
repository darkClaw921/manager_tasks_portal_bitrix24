'use client';

import { cn } from '@/lib/utils';

export interface BottomTabBarProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Fixed bottom tab bar wrapper with backdrop blur and border.
 * Shows only on mobile (< md breakpoint).
 * Handles safe-area-inset-bottom for iOS.
 */
export function BottomTabBar({ children, className }: BottomTabBarProps) {
  return (
    <nav
      className={cn(
        'fixed bottom-0 left-0 right-0 z-40 md:hidden',
        'bg-surface/95 backdrop-blur-md border-t border-border',
        'pb-[env(safe-area-inset-bottom)]',
        className
      )}
    >
      <div className="flex items-center justify-around px-2 py-1.5">
        {children}
      </div>
    </nav>
  );
}
