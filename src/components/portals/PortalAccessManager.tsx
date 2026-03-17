'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

// ==================== Types ====================

export interface PortalUser {
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
}

interface SelectableUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
}

interface PortalAccessManagerProps {
  portalId: number;
  users: PortalUser[];
  allUsers: SelectableUser[];
  isLoading?: boolean;
  onGrant: (data: {
    userId: number;
    role: 'admin' | 'viewer';
    canSeeResponsible: boolean;
    canSeeAccomplice: boolean;
    canSeeAuditor: boolean;
    canSeeCreator: boolean;
    canSeeAll: boolean;
  }) => Promise<void>;
  onUpdate: (userId: number, data: {
    role?: 'admin' | 'viewer';
    canSeeResponsible?: boolean;
    canSeeAccomplice?: boolean;
    canSeeAuditor?: boolean;
    canSeeCreator?: boolean;
    canSeeAll?: boolean;
  }) => Promise<void>;
  onRevoke: (userId: number) => Promise<void>;
}

// ==================== Permission Checkbox ====================

function PermissionCheckbox({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        'flex items-center gap-2 text-small cursor-pointer select-none',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="rounded border-border text-primary focus:ring-primary/30 w-4 h-4"
      />
      <span className="text-foreground">{label}</span>
    </label>
  );
}

// ==================== Add User Form ====================

function AddUserForm({
  availableUsers,
  onGrant,
}: {
  availableUsers: SelectableUser[];
  onGrant: PortalAccessManagerProps['onGrant'];
}) {
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [role, setRole] = useState<'admin' | 'viewer'>('viewer');
  const [canSeeResponsible, setCanSeeResponsible] = useState(true);
  const [canSeeAccomplice, setCanSeeAccomplice] = useState(false);
  const [canSeeAuditor, setCanSeeAuditor] = useState(false);
  const [canSeeCreator, setCanSeeCreator] = useState(false);
  const [canSeeAll, setCanSeeAll] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!selectedUserId) {
      setError('Выберите пользователя');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await onGrant({
        userId: selectedUserId,
        role,
        canSeeResponsible,
        canSeeAccomplice,
        canSeeAuditor,
        canSeeCreator,
        canSeeAll,
      });

      // Reset form
      setSelectedUserId(null);
      setRole('viewer');
      setCanSeeResponsible(true);
      setCanSeeAccomplice(false);
      setCanSeeAuditor(false);
      setCanSeeCreator(false);
      setCanSeeAll(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось предоставить доступ');
    } finally {
      setLoading(false);
    }
  };

  if (availableUsers.length === 0) {
    return (
      <div className="text-small text-text-muted py-2">
        Все пользователи уже имеют доступ к этому порталу
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4 rounded-input border border-border bg-background">
      <h4 className="text-small font-medium text-foreground">Добавить пользователя</h4>

      {/* User select */}
      <select
        value={selectedUserId ?? ''}
        onChange={(e) => {
          setSelectedUserId(e.target.value ? parseInt(e.target.value, 10) : null);
          setError(null);
        }}
        className="w-full rounded-input border border-border px-3 py-2 text-body text-foreground bg-surface outline-none focus:border-primary"
      >
        <option value="">Выберите пользователя...</option>
        {availableUsers.map((u) => (
          <option key={u.id} value={u.id}>
            {u.firstName} {u.lastName} ({u.email})
          </option>
        ))}
      </select>

      {/* Role select */}
      <div className="flex items-center gap-3">
        <span className="text-small text-text-secondary">Роль:</span>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as 'admin' | 'viewer')}
          className="rounded-input border border-border px-3 py-1.5 text-small text-foreground bg-surface outline-none focus:border-primary"
        >
          <option value="viewer">Наблюдатель</option>
          <option value="admin">Администратор</option>
        </select>
      </div>

      {/* Permissions */}
      <div className="space-y-2">
        <span className="text-small font-medium text-text-secondary">Видимость задач:</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <PermissionCheckbox
            label="Все задачи"
            checked={canSeeAll}
            onChange={(v) => setCanSeeAll(v)}
          />
          <PermissionCheckbox
            label="Как ответственный"
            checked={canSeeResponsible}
            onChange={(v) => setCanSeeResponsible(v)}
            disabled={canSeeAll}
          />
          <PermissionCheckbox
            label="Как соисполнитель"
            checked={canSeeAccomplice}
            onChange={(v) => setCanSeeAccomplice(v)}
            disabled={canSeeAll}
          />
          <PermissionCheckbox
            label="Как наблюдатель"
            checked={canSeeAuditor}
            onChange={(v) => setCanSeeAuditor(v)}
            disabled={canSeeAll}
          />
          <PermissionCheckbox
            label="Как постановщик"
            checked={canSeeCreator}
            onChange={(v) => setCanSeeCreator(v)}
            disabled={canSeeAll}
          />
        </div>
      </div>

      {error && <p className="text-small text-danger">{error}</p>}

      <Button size="sm" onClick={handleSubmit} loading={loading} disabled={!selectedUserId}>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Предоставить доступ
      </Button>
    </div>
  );
}

// ==================== User Row ====================

function UserRow({
  user,
  onUpdate,
  onRevoke,
}: {
  user: PortalUser;
  onUpdate: PortalAccessManagerProps['onUpdate'];
  onRevoke: PortalAccessManagerProps['onRevoke'];
}) {
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState(user.role);
  const [canSeeResponsible, setCanSeeResponsible] = useState(user.canSeeResponsible);
  const [canSeeAccomplice, setCanSeeAccomplice] = useState(user.canSeeAccomplice);
  const [canSeeAuditor, setCanSeeAuditor] = useState(user.canSeeAuditor);
  const [canSeeCreator, setCanSeeCreator] = useState(user.canSeeCreator);
  const [canSeeAll, setCanSeeAll] = useState(user.canSeeAll);
  const [saving, setSaving] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdate(user.userId, {
        role,
        canSeeResponsible,
        canSeeAccomplice,
        canSeeAuditor,
        canSeeCreator,
        canSeeAll,
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async () => {
    setRevoking(true);
    try {
      await onRevoke(user.userId);
    } finally {
      setRevoking(false);
    }
  };

  const handleCancel = () => {
    setRole(user.role);
    setCanSeeResponsible(user.canSeeResponsible);
    setCanSeeAccomplice(user.canSeeAccomplice);
    setCanSeeAuditor(user.canSeeAuditor);
    setCanSeeCreator(user.canSeeCreator);
    setCanSeeAll(user.canSeeAll);
    setEditing(false);
  };

  return (
    <div className="p-3 rounded-input border border-border hover:border-border-hover transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* User avatar */}
          <div className="w-8 h-8 rounded-full bg-primary-light flex items-center justify-center text-primary font-medium text-small shrink-0">
            {user.firstName.charAt(0)}{user.lastName.charAt(0)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium text-body truncate">
                {user.firstName} {user.lastName}
              </p>
              <Badge variant={user.role === 'admin' ? 'primary' : 'default'} size="sm">
                {user.role}
              </Badge>
            </div>
            <p className="text-small text-text-secondary truncate">{user.email}</p>
          </div>
        </div>

        {/* Actions */}
        {!editing && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setEditing(true)}
              className="p-1.5 rounded-input text-text-muted hover:text-foreground hover:bg-background transition-colors"
              title="Редактировать права"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
              </svg>
            </button>
            <button
              onClick={handleRevoke}
              disabled={revoking}
              className="p-1.5 rounded-input text-text-muted hover:text-danger hover:bg-danger-light transition-colors disabled:opacity-50"
              title="Отозвать доступ"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Permissions summary (non-editing) */}
      {!editing && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {user.canSeeAll && (
            <Badge variant="success" size="sm">Все задачи</Badge>
          )}
          {!user.canSeeAll && user.canSeeResponsible && (
            <Badge variant="default" size="sm">Ответственный</Badge>
          )}
          {!user.canSeeAll && user.canSeeAccomplice && (
            <Badge variant="default" size="sm">Соисполнитель</Badge>
          )}
          {!user.canSeeAll && user.canSeeAuditor && (
            <Badge variant="default" size="sm">Наблюдатель</Badge>
          )}
          {!user.canSeeAll && user.canSeeCreator && (
            <Badge variant="default" size="sm">Постановщик</Badge>
          )}
          {!user.canSeeAll && !user.canSeeResponsible && !user.canSeeAccomplice && !user.canSeeAuditor && !user.canSeeCreator && (
            <Badge variant="warning" size="sm">Нет доступа к задачам</Badge>
          )}
        </div>
      )}

      {/* Edit form */}
      {editing && (
        <div className="mt-3 space-y-3 pt-3 border-t border-border">
          <div className="flex items-center gap-3">
            <span className="text-small text-text-secondary">Роль:</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'admin' | 'viewer')}
              className="rounded-input border border-border px-3 py-1.5 text-small text-foreground bg-surface outline-none focus:border-primary"
            >
              <option value="viewer">Наблюдатель</option>
              <option value="admin">Администратор</option>
            </select>
          </div>

          <div className="space-y-2">
            <span className="text-small font-medium text-text-secondary">Видимость задач:</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <PermissionCheckbox
                label="Все задачи"
                checked={canSeeAll}
                onChange={(v) => setCanSeeAll(v)}
              />
              <PermissionCheckbox
                label="Как ответственный"
                checked={canSeeResponsible}
                onChange={(v) => setCanSeeResponsible(v)}
                disabled={canSeeAll}
              />
              <PermissionCheckbox
                label="Как соисполнитель"
                checked={canSeeAccomplice}
                onChange={(v) => setCanSeeAccomplice(v)}
                disabled={canSeeAll}
              />
              <PermissionCheckbox
                label="Как наблюдатель"
                checked={canSeeAuditor}
                onChange={(v) => setCanSeeAuditor(v)}
                disabled={canSeeAll}
              />
              <PermissionCheckbox
                label="Как постановщик"
                checked={canSeeCreator}
                onChange={(v) => setCanSeeCreator(v)}
                disabled={canSeeAll}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} loading={saving}>
              Сохранить
            </Button>
            <Button size="sm" variant="ghost" onClick={handleCancel}>
              Отмена
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== Main Component ====================

export function PortalAccessManager({
  portalId,
  users,
  allUsers,
  isLoading,
  onGrant,
  onUpdate,
  onRevoke,
}: PortalAccessManagerProps) {
  // Users not yet assigned to this portal
  const assignedUserIds = new Set(users.map((u) => u.userId));
  const availableUsers = allUsers.filter((u) => !assignedUserIds.has(u.id));

  if (isLoading) {
    return (
      <div className="bg-surface rounded-card border border-border p-6">
        <h3 className="text-h3 font-semibold mb-4">Доступ пользователей</h3>
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

  return (
    <div className="bg-surface rounded-card border border-border p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-h3 font-semibold">Доступ пользователей</h3>
        <Badge variant="primary">{users.length}</Badge>
      </div>

      {/* Add user form */}
      <div className="mb-4">
        <AddUserForm
          availableUsers={availableUsers}
          onGrant={onGrant}
        />
      </div>

      {/* Current users list */}
      {users.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-text-secondary text-small">Пользователи ещё не назначены</p>
        </div>
      ) : (
        <div className="space-y-2">
          {users.map((user) => (
            <UserRow
              key={user.userId}
              user={user}
              onUpdate={onUpdate}
              onRevoke={onRevoke}
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
          Для просмотра отфильтрованных задач пользователям необходима привязка к Bitrix24. Без привязки задачи будут видны только при разрешении &quot;Все задачи&quot;.
        </p>
      </div>
    </div>
  );
}
