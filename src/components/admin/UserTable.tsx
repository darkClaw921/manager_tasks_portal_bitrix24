'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { InputField } from '@/components/ui/InputField';
import { SelectField } from '@/components/ui/SelectField';
import type { AdminUser } from '@/hooks/useUsers';

interface UserTableProps {
  users: AdminUser[];
  currentUserId: number;
  onEdit: (user: AdminUser, updates: Record<string, unknown>) => void;
  onDelete: (userId: number) => void;
  onViewDetails?: (user: AdminUser) => void;
  isDeleting?: boolean;
}

export function UserTable({ users, currentUserId, onEdit, onDelete, onViewDetails, isDeleting }: UserTableProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{
    firstName: string;
    lastName: string;
    email: string;
    isAdmin: boolean;
  }>({ firstName: '', lastName: '', email: '', isAdmin: false });
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const startEdit = (user: AdminUser) => {
    setEditingId(user.id);
    setEditForm({
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      isAdmin: user.isAdmin,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = (user: AdminUser) => {
    const updates: Record<string, unknown> = {};
    if (editForm.firstName !== user.firstName) updates.firstName = editForm.firstName;
    if (editForm.lastName !== user.lastName) updates.lastName = editForm.lastName;
    if (editForm.email !== user.email) updates.email = editForm.email;
    if (editForm.isAdmin !== user.isAdmin) updates.isAdmin = editForm.isAdmin;

    if (Object.keys(updates).length > 0) {
      onEdit(user, updates);
    }
    setEditingId(null);
  };

  const confirmDelete = (userId: number) => {
    onDelete(userId);
    setDeleteConfirmId(null);
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  if (users.length === 0) {
    return (
      <div className="bg-surface rounded-card border border-border p-8 text-center">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 mx-auto text-text-muted mb-3">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
        </svg>
        <p className="text-text-secondary text-small">Пользователи не найдены</p>
      </div>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block bg-surface rounded-card border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-background/50">
              <th className="text-left text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">Пользователь</th>
              <th className="text-left text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">Email</th>
              <th className="text-left text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">Роль</th>
              <th className="text-left text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">Порталы</th>
              <th className="text-left text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">Создан</th>
              <th className="text-right text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-background/30 transition-colors">
                {editingId === user.id ? (
                  <>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <InputField
                          value={editForm.firstName}
                          onChange={(e) => setEditForm((p) => ({ ...p, firstName: e.target.value }))}
                          className="text-small"
                          placeholder="Имя"
                        />
                        <InputField
                          value={editForm.lastName}
                          onChange={(e) => setEditForm((p) => ({ ...p, lastName: e.target.value }))}
                          className="text-small"
                          placeholder="Фамилия"
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <InputField
                        value={editForm.email}
                        onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
                        className="text-small"
                        type="email"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <SelectField
                        value={editForm.isAdmin ? 'admin' : 'user'}
                        onChange={(e) => setEditForm((p) => ({ ...p, isAdmin: e.target.value === 'admin' }))}
                        options={[
                          { value: 'user', label: 'Пользователь' },
                          { value: 'admin', label: 'Админ' },
                        ]}
                        className="text-small"
                      />
                    </td>
                    <td className="px-4 py-3 text-small text-text-secondary">{user.portalCount}</td>
                    <td className="px-4 py-3 text-small text-text-secondary">{formatDate(user.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="primary" onClick={() => saveEdit(user)}>Сохранить</Button>
                        <Button size="sm" variant="ghost" onClick={cancelEdit}>Отмена</Button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={`${user.firstName} ${user.lastName}`} size="sm" />
                        <div>
                          <p className="text-small font-medium text-foreground">
                            {user.firstName} {user.lastName}
                            {user.id === currentUserId && (
                              <span className="text-xs text-text-muted ml-1">(you)</span>
                            )}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-small text-text-secondary">{user.email}</td>
                    <td className="px-4 py-3">
                      <Badge variant={user.isAdmin ? 'primary' : 'default'} size="sm">
                        {user.isAdmin ? 'Админ' : 'Пользователь'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-small text-text-secondary">{user.portalCount}</td>
                    <td className="px-4 py-3 text-small text-text-secondary">{formatDate(user.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {onViewDetails && (
                          <Button size="sm" variant="ghost" onClick={() => onViewDetails(user)} title="View details">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                            </svg>
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => startEdit(user)} title="Edit user">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                          </svg>
                        </Button>
                        {user.id !== currentUserId && (
                          deleteConfirmId === user.id ? (
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => confirmDelete(user.id)}
                                loading={isDeleting}
                              >
                                Confirm
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setDeleteConfirmId(null)}>
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => setDeleteConfirmId(user.id)} title="Delete user">
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-danger">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                              </svg>
                            </Button>
                          )
                        )}
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {users.map((user) => (
          <div key={user.id} className="bg-surface rounded-card border border-border p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <Avatar name={`${user.firstName} ${user.lastName}`} size="md" />
                <div>
                  <p className="text-small font-medium text-foreground">
                    {user.firstName} {user.lastName}
                    {user.id === currentUserId && (
                      <span className="text-xs text-text-muted ml-1">(you)</span>
                    )}
                  </p>
                  <p className="text-xs text-text-secondary">{user.email}</p>
                </div>
              </div>
              <Badge variant={user.isAdmin ? 'primary' : 'default'} size="sm">
                {user.isAdmin ? 'Админ' : 'Пользователь'}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-xs text-text-secondary mb-3">
              <span>{user.portalCount} portal{user.portalCount !== 1 ? 's' : ''}</span>
              <span>Created {formatDate(user.createdAt)}</span>
            </div>
            <div className="flex items-center gap-2 border-t border-border pt-3">
              {onViewDetails && (
                <Button size="sm" variant="ghost" onClick={() => onViewDetails(user)} className="flex-1">
                  Details
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => startEdit(user)} className="flex-1">
                Edit
              </Button>
              {user.id !== currentUserId && (
                deleteConfirmId === user.id ? (
                  <div className="flex items-center gap-1 flex-1">
                    <Button size="sm" variant="danger" onClick={() => confirmDelete(user.id)} loading={isDeleting} className="flex-1">
                      Delete
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleteConfirmId(null)}>
                      No
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setDeleteConfirmId(user.id)} className="flex-1 text-danger">
                    Delete
                  </Button>
                )
              )}
            </div>

            {/* Inline edit form for mobile */}
            {editingId === user.id && (
              <div className="border-t border-border pt-3 mt-3 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <InputField
                    label="Имя"
                    value={editForm.firstName}
                    onChange={(e) => setEditForm((p) => ({ ...p, firstName: e.target.value }))}
                  />
                  <InputField
                    label="Фамилия"
                    value={editForm.lastName}
                    onChange={(e) => setEditForm((p) => ({ ...p, lastName: e.target.value }))}
                  />
                </div>
                <InputField
                  label="Email"
                  value={editForm.email}
                  onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
                  type="email"
                />
                <SelectField
                  label="Роль"
                  value={editForm.isAdmin ? 'admin' : 'user'}
                  onChange={(e) => setEditForm((p) => ({ ...p, isAdmin: e.target.value === 'admin' }))}
                  options={[
                    { value: 'user', label: 'Пользователь' },
                    { value: 'admin', label: 'Админ' },
                  ]}
                />
                <div className="flex gap-2">
                  <Button size="sm" variant="primary" onClick={() => saveEdit(user)} className="flex-1">Сохранить</Button>
                  <Button size="sm" variant="ghost" onClick={cancelEdit} className="flex-1">Отмена</Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
