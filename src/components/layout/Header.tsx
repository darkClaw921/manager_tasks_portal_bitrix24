'use client';

import { useState, useCallback } from 'react';
import { SearchInput } from '@/components/ui/SearchInput';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { NotificationDropdown } from '@/components/notifications/NotificationDropdown';
import { ActiveTimersWidget } from '@/components/time-tracking';
import { useUIStore } from '@/stores/ui-store';
import { useUnreadCount } from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';
import { useRouter, usePathname } from 'next/navigation';

export interface HeaderProps {
  className?: string;
}

function HamburgerIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

export function Header({ className }: HeaderProps) {
  const { toggleSidebar, openModal, globalSearch, setGlobalSearch, hasActiveFilters } = useUIStore();
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const { data: unreadCount = 0 } = useUnreadCount();

  const filtersActive = hasActiveFilters();

  const handleSearchChange = useCallback((value: string) => {
    setGlobalSearch(value);
    // Navigate to tasks page when searching from other pages
    if (value && pathname !== '/tasks' && pathname !== '/dashboard') {
      router.push('/tasks');
    }
  }, [setGlobalSearch, router, pathname]);

  const toggleNotifications = useCallback(() => {
    setIsNotificationsOpen((prev) => !prev);
  }, []);

  const closeNotifications = useCallback(() => {
    setIsNotificationsOpen(false);
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-30 bg-surface border-b border-border px-4 md:px-6',
        className
      )}
    >
      <div className="flex items-center gap-3 h-16">
        {/* Mobile hamburger */}
        <button
          type="button"
          onClick={toggleSidebar}
          className="md:hidden p-2 -ml-2 text-text-secondary hover:text-foreground transition-colors rounded-input hover:bg-background"
          aria-label="Открыть меню"
        >
          <HamburgerIcon />
        </button>

        {/* Mobile logo */}
        <span className="md:hidden text-h3 font-bold text-foreground">TaskHub</span>

        {/* Search - hidden on mobile */}
        <div className="hidden md:block flex-1 max-w-md">
          <SearchInput
            value={globalSearch}
            onChange={handleSearchChange}
            placeholder="Поиск задач..."
          />
        </div>

        {/* Spacer */}
        <div className="flex-1 md:hidden" />

        {/* Right section */}
        <div className="flex items-center gap-2">
          {/* Filters button - hidden on mobile */}
          <div className="relative hidden lg:block">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => openModal('filters')}
            >
              <FilterIcon />
              Фильтры
            </Button>
            {filtersActive && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-primary" />
            )}
          </div>

          {/* Create task button */}
          <Button
            variant="primary"
            size="sm"
            className="hidden sm:inline-flex"
            onClick={() => openModal('createTask')}
          >
            <PlusIcon />
            <span className="hidden md:inline">Создать задачу</span>
          </Button>

          {/* Mobile create button (icon only) */}
          <Button
            variant="primary"
            size="sm"
            className="sm:hidden"
            onClick={() => openModal('createTask')}
            aria-label="Создать задачу"
          >
            <PlusIcon />
          </Button>

          {/* Active Timers */}
          <ActiveTimersWidget />

          {/* Notifications */}
          <div className="relative">
            <button
              type="button"
              onClick={toggleNotifications}
              className="relative p-2 text-text-secondary hover:text-foreground transition-colors rounded-input hover:bg-background"
              aria-label="Уведомления"
            >
              <BellIcon />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 flex items-center justify-center w-4 h-4 rounded-full bg-danger text-[10px] font-bold text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            <NotificationDropdown
              isOpen={isNotificationsOpen}
              onClose={closeNotifications}
            />
          </div>

          {/* User avatar */}
          <Avatar name="Администратор" size="sm" className="hidden sm:flex" />
        </div>
      </div>
    </header>
  );
}
