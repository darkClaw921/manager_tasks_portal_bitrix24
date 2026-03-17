'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useDebounce } from '@/hooks/useDebounce';
import type { BitrixUser } from '@/types';
import type { PortalAccessUser } from '@/hooks/usePortals';
import type { MappingWithUser } from '@/hooks/usePortalSettings';

// ==================== Types ====================

interface BitrixUserMappingProps {
  portalId: number;
  portalUsers: PortalAccessUser[];
  mappings: MappingWithUser[];
  bitrixUsers: BitrixUser[];
  isBitrixUsersLoading: boolean;
  isMappingsLoading: boolean;
  onSearch: (query: string) => void;
  onCreateMapping: (data: { userId: number; bitrixUserId: string; bitrixName?: string }) => Promise<void>;
  onDeleteMapping: (userId: number) => Promise<void>;
}

// ==================== Bitrix User Selector ====================

function BitrixUserSelector({
  bitrixUsers,
  isLoading,
  searchQuery,
  onSearchChange,
  onSelect,
  selectedBitrixUserId,
  mappedBitrixUserIds,
}: {
  bitrixUsers: BitrixUser[];
  isLoading: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelect: (user: BitrixUser) => void;
  selectedBitrixUserId: string | null;
  mappedBitrixUserIds: Set<string>;
}) {
  const [isOpen, setIsOpen] = useState(false);

  // Filter out already-mapped Bitrix24 users
  const availableUsers = useMemo(
    () => bitrixUsers.filter((u) => !mappedBitrixUserIds.has(u.ID) || u.ID === selectedBitrixUserId),
    [bitrixUsers, mappedBitrixUserIds, selectedBitrixUserId]
  );

  const selectedUser = bitrixUsers.find((u) => u.ID === selectedBitrixUserId);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-2 rounded-input border border-border px-3 py-2 text-small text-left bg-surface hover:border-border-hover transition-colors outline-none focus:border-primary"
      >
        {selectedUser ? (
          <span className="truncate">
            {selectedUser.NAME} {selectedUser.LAST_NAME}
            {selectedUser.EMAIL ? ` (${selectedUser.EMAIL})` : ''}
          </span>
        ) : (
          <span className="text-text-muted">Выберите пользователя Bitrix24...</span>
        )}
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 shrink-0 text-text-muted">
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-20 mt-1 w-full bg-surface border border-border rounded-input shadow-lg max-h-64 overflow-hidden">
          {/* Search input */}
          <div className="p-2 border-b border-border">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Поиск пользователей..."
              className="w-full rounded-input border border-border px-3 py-1.5 text-small text-foreground bg-background outline-none focus:border-primary"
              autoFocus
            />
          </div>

          {/* User list */}
          <div className="overflow-y-auto max-h-48">
            {isLoading ? (
              <div className="p-3 text-center text-small text-text-muted">Загрузка пользователей...</div>
            ) : availableUsers.length === 0 ? (
              <div className="p-3 text-center text-small text-text-muted">Пользователи не найдены</div>
            ) : (
              availableUsers.map((user) => (
                <button
                  key={user.ID}
                  type="button"
                  onClick={() => {
                    onSelect(user);
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-small hover:bg-background transition-colors"
                >
                  <div className="w-6 h-6 rounded-full bg-primary-light flex items-center justify-center text-primary text-xs font-medium shrink-0">
                    {(user.NAME || '?').charAt(0)}{(user.LAST_NAME || '?').charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-foreground">
                      {user.NAME} {user.LAST_NAME}
                    </p>
                    {user.EMAIL && (
                      <p className="truncate text-xs text-text-muted">{user.EMAIL}</p>
                    )}
                  </div>
                  {user.ID === selectedBitrixUserId && (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-primary shrink-0">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== User Mapping Row ====================

function UserMappingRow({
  user,
  mapping,
  bitrixUsers,
  isBitrixUsersLoading,
  mappedBitrixUserIds,
  onSearch,
  onCreateMapping,
  onDeleteMapping,
}: {
  user: PortalAccessUser;
  mapping: MappingWithUser | undefined;
  bitrixUsers: BitrixUser[];
  isBitrixUsersLoading: boolean;
  mappedBitrixUserIds: Set<string>;
  onSearch: (query: string) => void;
  onCreateMapping: BitrixUserMappingProps['onCreateMapping'];
  onDeleteMapping: BitrixUserMappingProps['onDeleteMapping'];
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [selectedBitrixUser, setSelectedBitrixUser] = useState<BitrixUser | null>(null);

  // Trigger parent search when debounced value changes
  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    // Debouncing is handled by useBitrixUsers in parent via search state
    onSearch(query);
  };

  const handleSave = async () => {
    if (!selectedBitrixUser) return;
    setSaving(true);
    try {
      await onCreateMapping({
        userId: user.userId,
        bitrixUserId: selectedBitrixUser.ID,
        bitrixName: `${selectedBitrixUser.NAME} ${selectedBitrixUser.LAST_NAME}`.trim() || undefined,
      });
      setSelectedBitrixUser(null);
      setSearchQuery('');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await onDeleteMapping(user.userId);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="p-3 rounded-input border border-border hover:border-border-hover transition-colors">
      <div className="flex items-start gap-3">
        {/* App user info */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-full bg-primary-light flex items-center justify-center text-primary font-medium text-small shrink-0">
            {user.firstName.charAt(0)}{user.lastName.charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-body truncate">
              {user.firstName} {user.lastName}
            </p>
            <p className="text-small text-text-secondary truncate">{user.email}</p>
          </div>
        </div>

        {/* Arrow */}
        <div className="flex items-center shrink-0 pt-2">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-text-muted">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
          </svg>
        </div>

        {/* Bitrix24 user mapping */}
        <div className="flex-1 min-w-0">
          {mapping ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0 py-1">
                <div className="w-8 h-8 rounded-full bg-success-light flex items-center justify-center text-success font-medium text-small shrink-0">
                  B24
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-body truncate">
                    {mapping.bitrixName || `Bitrix24 #${mapping.bitrixUserId}`}
                  </p>
                  <p className="text-xs text-text-muted">ID: {mapping.bitrixUserId}</p>
                </div>
              </div>
              <button
                onClick={handleRemove}
                disabled={removing}
                className="p-1.5 rounded-input text-text-muted hover:text-danger hover:bg-danger-light transition-colors disabled:opacity-50 shrink-0"
                title="Удалить привязку"
              >
                {removing ? (
                  <svg className="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                )}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <BitrixUserSelector
                  bitrixUsers={bitrixUsers}
                  isLoading={isBitrixUsersLoading}
                  searchQuery={searchQuery}
                  onSearchChange={handleSearchChange}
                  onSelect={setSelectedBitrixUser}
                  selectedBitrixUserId={selectedBitrixUser?.ID ?? null}
                  mappedBitrixUserIds={mappedBitrixUserIds}
                />
              </div>
              {selectedBitrixUser && (
                <Button size="sm" onClick={handleSave} loading={saving}>
                  Сохранить
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== Main Component ====================

export function BitrixUserMapping({
  portalId,
  portalUsers,
  mappings,
  bitrixUsers,
  isBitrixUsersLoading,
  isMappingsLoading,
  onSearch,
  onCreateMapping,
  onDeleteMapping,
}: BitrixUserMappingProps) {
  // Build a set of already-mapped Bitrix24 user IDs
  const mappedBitrixUserIds = useMemo(
    () => new Set(mappings.map((m) => m.bitrixUserId)),
    [mappings]
  );

  // Build a map of userId -> mapping for quick lookup
  const mappingsByUserId = useMemo(() => {
    const map = new Map<number, MappingWithUser>();
    for (const m of mappings) {
      map.set(m.userId, m);
    }
    return map;
  }, [mappings]);

  // Count of mapped vs total
  const mappedCount = mappings.length;
  const totalCount = portalUsers.length;

  if (isMappingsLoading) {
    return (
      <div className="bg-surface rounded-card border border-border p-6">
        <h3 className="text-h3 font-semibold mb-4">Привязка пользователей Bitrix24</h3>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-input border border-border animate-pulse">
              <div className="w-8 h-8 rounded-full bg-background" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-background rounded w-1/3" />
                <div className="h-3 bg-background rounded w-1/2" />
              </div>
              <div className="w-5 h-5 bg-background rounded" />
              <div className="flex-1 space-y-2">
                <div className="h-8 bg-background rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-card border border-border p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-h3 font-semibold">Привязка пользователей Bitrix24</h3>
        <div className="flex items-center gap-2">
          <Badge variant={mappedCount === totalCount && totalCount > 0 ? 'success' : 'default'}>
            {mappedCount}/{totalCount} привязано
          </Badge>
        </div>
      </div>

      {/* User mapping list */}
      {portalUsers.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-text-secondary text-small">К этому порталу ещё не назначены пользователи</p>
        </div>
      ) : (
        <div className="space-y-2">
          {portalUsers.map((user) => (
            <UserMappingRow
              key={user.userId}
              user={user}
              mapping={mappingsByUserId.get(user.userId)}
              bitrixUsers={bitrixUsers}
              isBitrixUsersLoading={isBitrixUsersLoading}
              mappedBitrixUserIds={mappedBitrixUserIds}
              onSearch={onSearch}
              onCreateMapping={onCreateMapping}
              onDeleteMapping={onDeleteMapping}
            />
          ))}
        </div>
      )}

      {/* Info note */}
      <div className="mt-4 flex items-start gap-2 p-3 rounded-input bg-primary-light/50">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-primary shrink-0 mt-0.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
        </svg>
        <p className="text-xs text-primary">
          Привяжите каждого пользователя приложения к соответствующему аккаунту Bitrix24.
          Это позволит фильтровать задачи по ролям (ответственный, соисполнитель, наблюдатель, постановщик)
          и отправлять целевые уведомления.
        </p>
      </div>
    </div>
  );
}
