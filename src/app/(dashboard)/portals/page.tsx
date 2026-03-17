'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AddPortalForm } from '@/components/portals/AddPortalForm';
import { PortalList } from '@/components/portals/PortalList';
import { usePortals, useUpdatePortal, useDisconnectPortal, useSyncPortal } from '@/hooks/usePortals';
import { usePortalStore } from '@/stores/portal-store';

function PortalsContent() {
  const searchParams = useSearchParams();
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  const { data: portals, isLoading } = usePortals();
  const updatePortal = useUpdatePortal();
  const disconnectPortal = useDisconnectPortal();
  const syncPortal = useSyncPortal();
  const setPortalsStore = usePortalStore((s) => s.setPortals);

  // Fetch current user to determine admin status
  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        setIsAdmin(data.user?.isAdmin ?? false);
      })
      .catch(() => {
        setIsAdmin(false);
      })
      .finally(() => setAuthLoading(false));
  }, []);

  // Sync portals to Zustand store when data changes
  useEffect(() => {
    if (portals) {
      setPortalsStore(portals);
    }
  }, [portals, setPortalsStore]);

  // Handle success/error messages from OAuth callback redirect
  useEffect(() => {
    const success = searchParams.get('success');
    const error = searchParams.get('error');

    if (success) {
      setNotification({ type: 'success', message: success });
    } else if (error) {
      setNotification({ type: 'error', message: error });
    }

    // Clear notification after 5 seconds
    if (success || error) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  const handleUpdate = async (id: number, data: { name?: string; color?: string }) => {
    try {
      await updatePortal.mutateAsync({ id, ...data });
    } catch {
      setNotification({ type: 'error', message: 'Не удалось обновить портал' });
    }
  };

  const handleDisconnect = async (id: number) => {
    try {
      await disconnectPortal.mutateAsync(id);
      setNotification({ type: 'success', message: 'Портал отключён' });
    } catch {
      setNotification({ type: 'error', message: 'Не удалось отключить портал' });
    }
  };

  const handleSync = async (id: number) => {
    try {
      await syncPortal.mutateAsync(id);
      setNotification({ type: 'success', message: 'Синхронизация завершена' });
    } catch {
      setNotification({ type: 'error', message: 'Ошибка синхронизации' });
    }
  };

  const activePortals = portals?.filter((p) => p.isActive) || [];

  if (authLoading) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-h2 font-bold text-foreground">Порталы</h1>
          <p className="text-small text-text-secondary mt-1">
            Подключение и управление порталами Bitrix24
          </p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-surface rounded-card border border-border p-6 h-80 animate-pulse" />
          <div className="bg-surface rounded-card border border-border p-6 h-80 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-h2 font-bold text-foreground">Порталы</h1>
        <p className="text-small text-text-secondary mt-1">
          {isAdmin
            ? 'Подключение и управление порталами Bitrix24'
            : 'Ваши назначенные порталы Bitrix24'}
        </p>
      </div>

      {/* Notification */}
      {notification && (
        <div
          className={`mb-4 p-3 rounded-input text-small flex items-center gap-2 ${
            notification.type === 'success'
              ? 'bg-success-light text-success'
              : 'bg-danger-light text-danger'
          }`}
        >
          {notification.type === 'success' ? (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          )}
          <span>{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            className="ml-auto p-0.5 hover:opacity-70"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Content grid */}
      {isAdmin ? (
        /* Admin view: connect form + portal list with management */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Add portal form */}
          <AddPortalForm />

          {/* Right: Connected portals list */}
          {isLoading ? (
            <div className="bg-surface rounded-card border border-border p-6">
              <h2 className="text-h3 font-semibold mb-4">Подключённые порталы</h2>
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-input border border-border animate-pulse">
                    <div className="w-10 h-10 rounded-input bg-background" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-background rounded w-1/2" />
                      <div className="h-3 bg-background rounded w-2/3" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <PortalList
              portals={activePortals}
              onUpdate={handleUpdate}
              onDisconnect={handleDisconnect}
              showSync
              onSync={handleSync}
              isAdmin={isAdmin}
            />
          )}
        </div>
      ) : (
        /* Regular user view: read-only portal list */
        <div className="max-w-2xl">
          {isLoading ? (
            <div className="bg-surface rounded-card border border-border p-6">
              <h2 className="text-h3 font-semibold mb-4">Ваши порталы</h2>
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-input border border-border animate-pulse">
                    <div className="w-10 h-10 rounded-input bg-background" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-background rounded w-1/2" />
                      <div className="h-3 bg-background rounded w-2/3" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <PortalList
              portals={activePortals}
              showSync
              onSync={handleSync}
              isAdmin={false}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default function PortalsPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-5xl mx-auto">
          <div className="mb-6">
            <h1 className="text-h2 font-bold text-foreground">Порталы</h1>
            <p className="text-small text-text-secondary mt-1">
              Подключение и управление порталами Bitrix24
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-surface rounded-card border border-border p-6 h-80 animate-pulse" />
            <div className="bg-surface rounded-card border border-border p-6 h-80 animate-pulse" />
          </div>
        </div>
      }
    >
      <PortalsContent />
    </Suspense>
  );
}
