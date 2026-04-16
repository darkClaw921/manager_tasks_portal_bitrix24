'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import type { PortalPublic } from '@/types';

/** Predefined color options for portal color change */
const PORTAL_COLORS = [
  '#2563EB',
  '#06B6D4',
  '#8B5CF6',
  '#16A34A',
  '#F59E0B',
  '#F97316',
  '#DC2626',
  '#EC4899',
];

interface PortalListProps {
  portals: PortalPublic[];
  onUpdate?: (id: number, data: { name?: string; color?: string }) => Promise<void>;
  onDisconnect?: (id: number) => Promise<void>;
  /** Show sync button and last sync time */
  showSync?: boolean;
  onSync?: (id: number) => Promise<void>;
  /** Whether the current user is an admin */
  isAdmin?: boolean;
}

interface EditingState {
  id: number;
  name: string;
  color: string;
}

export function PortalList({
  portals,
  onUpdate,
  onDisconnect,
  showSync = false,
  onSync,
  isAdmin = false,
}: PortalListProps) {
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [disconnecting, setDisconnecting] = useState<number | null>(null);
  const [syncing, setSyncing] = useState<number | null>(null);

  const handleSave = async () => {
    if (!editing || !onUpdate) return;
    await onUpdate(editing.id, { name: editing.name, color: editing.color });
    setEditing(null);
  };

  const handleDisconnect = async (id: number) => {
    if (!onDisconnect) return;
    setDisconnecting(id);
    try {
      await onDisconnect(id);
    } finally {
      setDisconnecting(null);
    }
  };

  const handleSync = async (id: number) => {
    if (!onSync) return;
    setSyncing(id);
    try {
      await onSync(id);
    } finally {
      setSyncing(null);
    }
  };

  if (portals.length === 0) {
    return (
      <div className="bg-surface rounded-card border border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-h3 font-semibold">
            {isAdmin ? 'Подключённые порталы' : 'Ваши порталы'}
          </h2>
          <Badge variant="default">0</Badge>
        </div>
        <div className="text-center py-8">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-background flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-text-muted">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
            </svg>
          </div>
          <p className="text-text-secondary text-small">
            {isAdmin ? 'Порталы ещё не подключены' : 'Вам не назначены порталы'}
          </p>
          <p className="text-text-muted text-xs mt-1">
            {isAdmin
              ? 'Используйте форму для подключения первого портала Bitrix24'
              : 'Обратитесь к администратору для назначения портала'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-card border border-border p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-h3 font-semibold">
          {isAdmin ? 'Подключённые порталы' : 'Ваши порталы'}
        </h2>
        <Badge variant="primary">{portals.length}</Badge>
      </div>

      <div className="space-y-3">
        {portals.map((portal) => {
          const isEditing = editing?.id === portal.id;
          const isDisconnecting = disconnecting === portal.id;
          const isSyncing = syncing === portal.id;
          const isLocal = portal.domain === 'local' || portal.memberId === '__local__';

          return (
            <div
              key={portal.id}
              className="flex items-start gap-3 p-3 rounded-input border border-border hover:border-border-hover transition-colors"
            >
              {/* Portal avatar with first letter */}
              <div
                className="w-10 h-10 rounded-input flex items-center justify-center text-text-inverse font-bold text-h3 shrink-0"
                style={{ backgroundColor: portal.color }}
              >
                {portal.name.charAt(0).toUpperCase()}
              </div>

              {/* Portal info */}
              <div className="flex-1 min-w-0">
                {isEditing ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editing.name}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                      className="w-full rounded-input border border-border px-2 py-1 text-body text-foreground bg-surface outline-none focus:border-primary"
                      placeholder="Название портала"
                    />
                    <div className="flex gap-1.5">
                      {PORTAL_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setEditing({ ...editing, color })}
                          className={cn(
                            'w-5 h-5 rounded-full transition-all',
                            editing.color === color && 'ring-2 ring-offset-1 ring-foreground'
                          )}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSave}>
                        Сохранить
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                        Отмена
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-body truncate">{portal.name}</p>
                      <Badge variant={portal.isActive ? 'success' : 'default'} size="sm">
                        {portal.isActive ? 'Активен' : 'Отключён'}
                      </Badge>
                      {isLocal && (
                        <Badge variant="primary" size="sm">Локальная</Badge>
                      )}
                    </div>
                    <p className="text-small text-text-secondary truncate">{portal.domain}</p>
                    {showSync && !isLocal && portal.lastSyncAt && (
                      <p className="text-xs text-text-muted mt-0.5">
                        Последняя синхронизация: {new Date(portal.lastSyncAt).toLocaleString('ru-RU')}
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* Actions */}
              {!isEditing && (
                <div className="flex items-center gap-1 shrink-0">
                  {/* Settings button (admin only) */}
                  {isAdmin && (
                    <a
                      href={`/portals/${portal.id}/settings`}
                      className="p-1.5 rounded-input text-text-muted hover:text-primary hover:bg-primary-light transition-colors"
                      title="Настройки"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                      </svg>
                    </a>
                  )}
                  {showSync && onSync && !isLocal && (
                    <button
                      onClick={() => handleSync(portal.id)}
                      disabled={isSyncing}
                      className="p-1.5 rounded-input text-text-muted hover:text-primary hover:bg-primary-light transition-colors disabled:opacity-50"
                      title="Синхронизация"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                        className={cn('w-4 h-4', isSyncing && 'animate-spin')}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
                      </svg>
                    </button>
                  )}
                  {/* Edit button (admin only) */}
                  {isAdmin && onUpdate && (
                    <button
                      onClick={() => setEditing({ id: portal.id, name: portal.name, color: portal.color })}
                      className="p-1.5 rounded-input text-text-muted hover:text-foreground hover:bg-background transition-colors"
                      title="Редактировать"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                      </svg>
                    </button>
                  )}
                  {/* Disconnect button (admin only, not for local portal) */}
                  {isAdmin && onDisconnect && !isLocal && (
                    <button
                      onClick={() => handleDisconnect(portal.id)}
                      disabled={isDisconnecting}
                      className="p-1.5 rounded-input text-text-muted hover:text-danger hover:bg-danger-light transition-colors disabled:opacity-50"
                      title="Отключить"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Info note */}
      <div className="mt-4 flex items-start gap-2 p-3 rounded-input bg-primary-light/50">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-primary shrink-0 mt-0.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
        </svg>
        <p className="text-xs text-primary">
          {isAdmin
            ? 'После подключения портала TaskHub автоматически зарегистрирует обработчики событий и синхронизирует стадии задач.'
            : 'Обратитесь к администратору для управления подключениями порталов и правами доступа.'}
        </p>
      </div>
    </div>
  );
}
