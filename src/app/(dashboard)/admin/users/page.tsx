'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { UserTable } from '@/components/admin/UserTable';
import { CreateUserForm } from '@/components/admin/CreateUserForm';
import { UserDetailModal } from '@/components/admin/UserDetailModal';
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser } from '@/hooks/useUsers';
import type { AdminUser } from '@/hooks/useUsers';

export default function AdminUsersPage() {
  const { data: users, isLoading, error } = useUsers();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<number>(0);
  const [detailUser, setDetailUser] = useState<AdminUser | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Get current user ID from /api/auth/me on mount
  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.user?.id) setCurrentUserId(data.user.id);
      })
      .catch(() => {});
  }, []);

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const handleCreate = async (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    isAdmin: boolean;
  }) => {
    try {
      await createUser.mutateAsync(data);
      setShowCreateForm(false);
      showMsg('success', 'Пользователь создан');
    } catch (err) {
      showMsg('error', err instanceof Error ? err.message : 'Не удалось создать пользователя');
    }
  };

  const handleEdit = async (user: AdminUser, updates: Record<string, unknown>) => {
    try {
      await updateUser.mutateAsync({ id: user.id, ...updates });
      showMsg('success', 'Пользователь обновлён');
    } catch (err) {
      showMsg('error', err instanceof Error ? err.message : 'Не удалось обновить пользователя');
    }
  };

  const handleDelete = async (userId: number) => {
    try {
      await deleteUser.mutateAsync(userId);
      showMsg('success', 'Пользователь удалён');
    } catch (err) {
      showMsg('error', err instanceof Error ? err.message : 'Не удалось удалить пользователя');
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-h2 font-bold text-foreground">User Management</h1>
          <p className="text-small text-text-secondary mt-1">
            Manage users, assign roles, and monitor activity
          </p>
        </div>
        {!showCreateForm && (
          <Button variant="primary" onClick={() => setShowCreateForm(true)}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
            </svg>
            Add User
          </Button>
        )}
      </div>

      {/* Messages */}
      {message && (
        <div
          className={`mb-4 p-3 rounded-input text-small ${
            message.type === 'success'
              ? 'bg-success-light text-success'
              : 'bg-danger-light text-danger'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Create user form */}
      {showCreateForm && (
        <div className="mb-6">
          <CreateUserForm
            onSubmit={handleCreate}
            onCancel={() => setShowCreateForm(false)}
            isLoading={createUser.isPending}
            error={createUser.isError ? createUser.error.message : null}
          />
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-surface rounded-card border border-border p-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-background" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-background rounded w-1/4" />
                  <div className="h-3 bg-background rounded w-1/3" />
                </div>
                <div className="h-6 bg-background rounded-badge w-16" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="bg-surface rounded-card border border-border p-8 text-center">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 mx-auto text-danger mb-3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          <p className="text-text-secondary text-small">Failed to load users. Please try again.</p>
        </div>
      )}

      {/* User table */}
      {users && (
        <UserTable
          users={users}
          currentUserId={currentUserId}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onViewDetails={(user) => setDetailUser(user)}
          isDeleting={deleteUser.isPending}
        />
      )}

      {/* Stats summary */}
      {users && users.length > 0 && (
        <div className="mt-4 flex items-center gap-4 text-xs text-text-muted">
          <span>{users.length} user{users.length !== 1 ? 's' : ''} total</span>
          <span>{users.filter((u) => u.isAdmin).length} admin{users.filter((u) => u.isAdmin).length !== 1 ? 's' : ''}</span>
          <span>{users.reduce((sum, u) => sum + u.portalCount, 0)} portal{users.reduce((sum, u) => sum + u.portalCount, 0) !== 1 ? 's' : ''} connected</span>
        </div>
      )}

      {/* User detail modal */}
      {detailUser && (
        <UserDetailModal user={detailUser} onClose={() => setDetailUser(null)} />
      )}
    </div>
  );
}
