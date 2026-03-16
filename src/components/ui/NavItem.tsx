'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export interface NavItemProps {
  href: string;
  label: string;
  icon: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export function NavItem({ href, label, icon, className, onClick }: NavItemProps) {
  const pathname = usePathname();
  const isActive =
    pathname === href || (href !== '/dashboard' && pathname.startsWith(href));

  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-input text-small font-medium transition-colors',
        isActive
          ? 'bg-primary text-text-inverse'
          : 'text-slate-300 hover:bg-sidebar-hover hover:text-text-inverse',
        className
      )}
    >
      <span className="w-5 h-5 shrink-0 flex items-center justify-center">{icon}</span>
      <span className="truncate">{label}</span>
    </Link>
  );
}
