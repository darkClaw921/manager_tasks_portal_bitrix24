'use client';

import { Suspense, useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import {
  usePortals,
  usePortalAccess,
  useGrantAccess,
  useUpdateAccess,
  useRevokeAccess,
} from '@/hooks/usePortals';
import { useUsers } from '@/hooks/useUsers';
import {
  useBitrixMappings,
  useBitrixUsers,
} from '@/hooks/usePortalSettings';

// ==================== Lazy-loaded heavy components ====================

const PortalAccessManager = dynamic(
  () => import('@/components/portals/PortalAccessManager').then((m) => ({ default: m.PortalAccessManager })),
  {
    loading: () => <TabSkeleton />,
  }
);

const BitrixUserMapping = dynamic(
  () => import('@/components/portals/BitrixUserMapping').then((m) => ({ default: m.BitrixUserMapping })),
  {
    loading: () => <TabSkeleton />,
  }
);

const StageSettings = dynamic(
  () => import('@/components/portals/StageSettings').then((m) => ({ default: m.StageSettings })),
  {
    loading: () => <TabSkeleton />,
  }
);

// ==================== Types ====================

type TabKey = 'general' | 'users' | 'mappings' | 'stages';

interface TabItem {
  key: TabKey;
  label: string;
  icon: React.ReactNode;
}

// ==================== Skeleton ====================

function TabSkeleton() {
  return (
    <div className="bg-surface rounded-card border border-border p-6">
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-input border border-border animate-pulse">
            <div className="w-8 h-8 rounded-full bg-background" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-background rounded w-1/3" />
              <div className="h-3 bg-background rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==================== Tab Configuration ====================

const TABS: TabItem[] = [
  {
    key: 'general',
    label: 'General',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      </svg>
    ),
  },
  {
    key: 'users',
    label: 'Users',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
      </svg>
    ),
  },
  {
    key: 'mappings',
    label: 'User Mapping',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
      </svg>
    ),
  },
  {
    key: 'stages',
    label: 'Kanban Stages',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125Z" />
      </svg>
    ),
  },
];

// ==================== General Tab ====================

function GeneralTab({ portal }: { portal: { id: number; name: string; domain: string; color: string; isActive: boolean; lastSyncAt: string | null; createdAt: string } }) {
  return (
    <div className="bg-surface rounded-card border border-border p-6">
      <h3 className="text-h3 font-semibold mb-4">Portal Information</h3>

      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-small font-medium text-text-secondary mb-1">Name</label>
            <p className="text-body text-foreground">{portal.name}</p>
          </div>
          <div>
            <label className="block text-small font-medium text-text-secondary mb-1">Domain</label>
            <p className="text-body text-foreground">{portal.domain}</p>
          </div>
          <div>
            <label className="block text-small font-medium text-text-secondary mb-1">Color</label>
            <div className="flex items-center gap-2">
              <span
                className="w-6 h-6 rounded-full border border-border/50"
                style={{ backgroundColor: portal.color }}
              />
              <span className="text-body text-foreground">{portal.color}</span>
            </div>
          </div>
          <div>
            <label className="block text-small font-medium text-text-secondary mb-1">Status</label>
            <Badge variant={portal.isActive ? 'success' : 'danger'} size="md">
              {portal.isActive ? 'Active' : 'Inactive'}
            </Badge>
          </div>
          <div>
            <label className="block text-small font-medium text-text-secondary mb-1">Last sync</label>
            <p className="text-body text-foreground">
              {portal.lastSyncAt ? new Date(portal.lastSyncAt).toLocaleString() : 'Never'}
            </p>
          </div>
          <div>
            <label className="block text-small font-medium text-text-secondary mb-1">Created</label>
            <p className="text-body text-foreground">
              {new Date(portal.createdAt).toLocaleString()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== Users Tab Wrapper ====================

function UsersTabContent({ portalId }: { portalId: number }) {
  const { data: portalUsers, isLoading: isAccessLoading } = usePortalAccess(portalId);
  const { data: allUsers, isLoading: isUsersLoading } = useUsers();
  const grantAccess = useGrantAccess();
  const updateAccess = useUpdateAccess();
  const revokeAccess = useRevokeAccess();

  const handleGrant = useCallback(async (data: {
    userId: number;
    role: 'admin' | 'viewer';
    canSeeResponsible: boolean;
    canSeeAccomplice: boolean;
    canSeeAuditor: boolean;
    canSeeCreator: boolean;
    canSeeAll: boolean;
  }) => {
    await grantAccess.mutateAsync({ portalId, ...data });
  }, [portalId, grantAccess]);

  const handleUpdate = useCallback(async (userId: number, data: {
    role?: 'admin' | 'viewer';
    canSeeResponsible?: boolean;
    canSeeAccomplice?: boolean;
    canSeeAuditor?: boolean;
    canSeeCreator?: boolean;
    canSeeAll?: boolean;
  }) => {
    await updateAccess.mutateAsync({ portalId, userId, ...data });
  }, [portalId, updateAccess]);

  const handleRevoke = useCallback(async (userId: number) => {
    await revokeAccess.mutateAsync({ portalId, userId });
  }, [portalId, revokeAccess]);

  const selectableUsers = useMemo(() =>
    (allUsers || []).map((u) => ({
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
    })),
    [allUsers]
  );

  return (
    <PortalAccessManager
      portalId={portalId}
      users={(portalUsers || []) as Array<{
        userId: number;
        email: string;
        firstName: string;
        lastName: string;
        role: 'admin' | 'viewer';
        canSeeResponsible: boolean;
        canSeeAccomplice: boolean;
        canSeeAuditor: boolean;
        canSeeCreator: boolean;
        canSeeAll: boolean;
        accessCreatedAt: string;
      }>}
      allUsers={selectableUsers}
      isLoading={isAccessLoading || isUsersLoading}
      onGrant={handleGrant}
      onUpdate={handleUpdate}
      onRevoke={handleRevoke}
    />
  );
}

// ==================== Mappings Tab Wrapper ====================

function MappingsTabContent({ portalId }: { portalId: number }) {
  const { data: portalUsers, isLoading: isAccessLoading } = usePortalAccess(portalId);
  const { data: mappings, isLoading: isMappingsLoading } = useBitrixMappings(portalId);
  const [bitrixSearch, setBitrixSearch] = useState('');
  const { data: bitrixUsers, isLoading: isBitrixUsersLoading } = useBitrixUsers(portalId, bitrixSearch);

  const handleCreateMapping = useCallback(async (data: { userId: number; bitrixUserId: string; bitrixName?: string }) => {
    const response = await fetch(`/api/portals/${portalId}/mappings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to create mapping');
    }
    // Force refetch
    window.dispatchEvent(new Event('mapping-changed'));
  }, [portalId]);

  const handleDeleteMapping = useCallback(async (userId: number) => {
    const response = await fetch(`/api/portals/${portalId}/mappings`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to delete mapping');
    }
  }, [portalId]);

  return (
    <BitrixUserMapping
      portalId={portalId}
      portalUsers={(portalUsers || []) as Array<{
        userId: number;
        email: string;
        firstName: string;
        lastName: string;
        role: 'admin' | 'viewer';
        canSeeResponsible: boolean;
        canSeeAccomplice: boolean;
        canSeeAuditor: boolean;
        canSeeCreator: boolean;
        canSeeAll: boolean;
        accessCreatedAt: string;
      }>}
      mappings={mappings || []}
      bitrixUsers={bitrixUsers || []}
      isBitrixUsersLoading={isBitrixUsersLoading}
      isMappingsLoading={isMappingsLoading || isAccessLoading}
      onSearch={setBitrixSearch}
      onCreateMapping={handleCreateMapping}
      onDeleteMapping={handleDeleteMapping}
    />
  );
}

// ==================== Main Settings Content ====================

function SettingsContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const portalId = parseInt(params.id as string, 10);

  const [isAdmin, setIsAdmin] = useState(false);
  const [isPortalAdminUser, setIsPortalAdminUser] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  const { data: portals } = usePortals();

  // Get the current tab from URL query params
  const activeTab = (searchParams.get('tab') as TabKey) || 'general';

  // Fetch current user to determine admin status + portal admin status
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

  // Check if user is portal admin
  useEffect(() => {
    if (portals && !isNaN(portalId)) {
      const portal = portals.find((p) => p.id === portalId);
      if (portal) {
        setIsPortalAdminUser(portal.role === 'admin');
      }
    }
  }, [portals, portalId]);

  const handleTabChange = (tab: TabKey) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.push(`/portals/${portalId}/settings?${params.toString()}`);
  };

  // Find the portal
  const portal = portals?.find((p) => p.id === portalId);

  if (authLoading) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <div className="h-6 bg-background rounded w-48 animate-pulse mb-2" />
          <div className="h-4 bg-background rounded w-32 animate-pulse" />
        </div>
        <div className="bg-surface rounded-card border border-border p-6 h-96 animate-pulse" />
      </div>
    );
  }

  // Access check: only portal admin or app admin
  if (!isAdmin && !isPortalAdminUser) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="text-center py-12">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 text-text-muted mx-auto mb-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
          </svg>
          <h2 className="text-h3 font-semibold text-foreground mb-2">Access Denied</h2>
          <p className="text-text-secondary text-small mb-4">
            You need portal admin permissions to access this page.
          </p>
          <Button variant="secondary" onClick={() => router.push('/portals')}>
            Back to Portals
          </Button>
        </div>
      </div>
    );
  }

  if (!portal) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="text-center py-12">
          <h2 className="text-h3 font-semibold text-foreground mb-2">Portal not found</h2>
          <p className="text-text-secondary text-small mb-4">
            The portal you are looking for does not exist or you do not have access.
          </p>
          <Button variant="secondary" onClick={() => router.push('/portals')}>
            Back to Portals
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-small text-text-secondary mb-4">
        <button
          onClick={() => router.push('/portals')}
          className="hover:text-foreground transition-colors"
        >
          Portals
        </button>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
        <span className="text-foreground font-medium truncate max-w-[200px]">{portal.name}</span>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
        <span className="text-foreground">Settings</span>
      </nav>

      {/* Page header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-input border border-border/50 shrink-0"
            style={{ backgroundColor: portal.color }}
          />
          <div>
            <h1 className="text-h2 font-bold text-foreground">{portal.name}</h1>
            <p className="text-small text-text-secondary">{portal.domain}</p>
          </div>
          <Badge variant={portal.isActive ? 'success' : 'danger'} size="sm" className="ml-2">
            {portal.isActive ? 'Active' : 'Inactive'}
          </Badge>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border mb-6">
        <div className="flex gap-0 -mb-px overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={cn(
                'flex items-center gap-2 px-4 py-3 text-small font-medium border-b-2 transition-colors whitespace-nowrap min-h-[44px]',
                activeTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-secondary hover:text-foreground hover:border-border'
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'general' && (
          <GeneralTab portal={portal} />
        )}
        {activeTab === 'users' && (
          <UsersTabContent portalId={portalId} />
        )}
        {activeTab === 'mappings' && (
          <MappingsTabContent portalId={portalId} />
        )}
        {activeTab === 'stages' && (
          <StageSettings portalId={portalId} />
        )}
      </div>
    </div>
  );
}

// ==================== Page Export ====================

export default function PortalSettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-5xl mx-auto">
          <div className="mb-6">
            <div className="h-6 bg-background rounded w-48 animate-pulse mb-2" />
            <div className="h-4 bg-background rounded w-32 animate-pulse" />
          </div>
          <div className="bg-surface rounded-card border border-border p-6 h-96 animate-pulse" />
        </div>
      }
    >
      <SettingsContent />
    </Suspense>
  );
}
