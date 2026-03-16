'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { StatCard } from '@/components/ui/StatCard';
import { PortalIndicator } from '@/components/ui/PortalIndicator';
import type { AdminUser } from '@/hooks/useUsers';

interface UserStats {
  portalCount: number;
  totalTasks: number;
  inProgress: number;
  completed: number;
  overdue: number;
}

interface UserPortal {
  id: number;
  domain: string;
  name: string;
  color: string;
  isActive: boolean;
  lastSyncAt: string | null;
  createdAt: string;
}

interface UserDetailModalProps {
  user: AdminUser;
  onClose: () => void;
}

export function UserDetailModal({ user, onClose }: UserDetailModalProps) {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [portals, setPortals] = useState<UserPortal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const [statsRes, portalsRes] = await Promise.all([
          fetch(`/api/users/${user.id}/stats`),
          fetch(`/api/users/${user.id}/portals`),
        ]);

        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setStats(statsData.data);
        }
        if (portalsRes.ok) {
          const portalsData = await portalsRes.json();
          setPortals(portalsData.data);
        }
      } catch (err) {
        console.error('Failed to fetch user details:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [user.id]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    try {
      return new Date(dateStr).toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-surface rounded-modal border border-border shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4">
        {/* Header */}
        <div className="sticky top-0 bg-surface border-b border-border px-6 py-4 flex items-center justify-between rounded-t-modal">
          <div className="flex items-center gap-3">
            <Avatar name={`${user.firstName} ${user.lastName}`} size="lg" />
            <div>
              <h2 className="text-h3 font-semibold text-foreground">
                {user.firstName} {user.lastName}
              </h2>
              <p className="text-small text-text-secondary">{user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={user.isAdmin ? 'primary' : 'default'}>
              {user.isAdmin ? 'Admin' : 'User'}
            </Badge>
            <button onClick={onClose} className="p-1 rounded-input hover:bg-background transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-text-secondary">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Stats */}
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-background rounded-card p-4 animate-pulse">
                  <div className="h-3 bg-border rounded w-2/3 mb-2" />
                  <div className="h-6 bg-border rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : stats ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard title="Total Tasks" value={stats.totalTasks} icon={
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" />
                </svg>
              } />
              <StatCard title="In Progress" value={stats.inProgress} icon={
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-primary">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              } />
              <StatCard title="Completed" value={stats.completed} icon={
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-success">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              } />
              <StatCard title="Overdue" value={stats.overdue} icon={
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-danger">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
              } />
            </div>
          ) : null}

          {/* Portals */}
          <div>
            <h3 className="text-small font-semibold text-foreground mb-3">Connected Portals</h3>
            {loading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-input border border-border animate-pulse">
                    <div className="w-3 h-3 rounded-full bg-background" />
                    <div className="flex-1 space-y-1">
                      <div className="h-4 bg-background rounded w-1/3" />
                      <div className="h-3 bg-background rounded w-1/4" />
                    </div>
                  </div>
                ))}
              </div>
            ) : portals.length === 0 ? (
              <div className="text-center py-6 text-text-secondary text-small border border-dashed border-border rounded-card">
                No portals connected
              </div>
            ) : (
              <div className="space-y-2">
                {portals.map((portal) => (
                  <div key={portal.id} className="flex items-center gap-3 p-3 rounded-input border border-border">
                    <PortalIndicator color={portal.color} size="md" />
                    <div className="flex-1 min-w-0">
                      <p className="text-small font-medium text-foreground truncate">
                        {portal.name || portal.domain}
                      </p>
                      <p className="text-xs text-text-secondary truncate">{portal.domain}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={portal.isActive ? 'success' : 'default'}
                        size="sm"
                      >
                        {portal.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                      {portal.lastSyncAt && (
                        <span className="text-xs text-text-muted hidden sm:inline">
                          Sync: {formatDate(portal.lastSyncAt)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* User info */}
          <div>
            <h3 className="text-small font-semibold text-foreground mb-3">Account Info</h3>
            <div className="grid grid-cols-2 gap-3 text-small">
              <div className="p-3 rounded-input bg-background">
                <p className="text-text-muted text-xs mb-1">Language</p>
                <p className="text-foreground">{user.language}</p>
              </div>
              <div className="p-3 rounded-input bg-background">
                <p className="text-text-muted text-xs mb-1">Timezone</p>
                <p className="text-foreground">{user.timezone}</p>
              </div>
              <div className="p-3 rounded-input bg-background">
                <p className="text-text-muted text-xs mb-1">Created</p>
                <p className="text-foreground">{formatDate(user.createdAt)}</p>
              </div>
              <div className="p-3 rounded-input bg-background">
                <p className="text-text-muted text-xs mb-1">Updated</p>
                <p className="text-foreground">{formatDate(user.updatedAt)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-surface border-t border-border px-6 py-3 flex justify-end rounded-b-modal">
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}
