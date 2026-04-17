'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface UserPortalEntry {
  id: number;
  domain: string;
  name: string;
  color: string;
  memberId: string;
  isActive: boolean;
  lastSyncAt: string | null;
  createdAt: string;
  role: 'admin' | 'viewer';
  canSeeResponsible: boolean;
  canSeeAccomplice: boolean;
  canSeeAuditor: boolean;
  canSeeCreator: boolean;
  canSeeAll: boolean;
}

export interface AdminUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  isAdmin: boolean;
  language: string;
  timezone: string;
  createdAt: string;
  updatedAt: string;
  portalCount: number;
}

export interface UserDetail extends AdminUser {
  digestTime: string;
  notifyTaskAdd: boolean;
  notifyTaskUpdate: boolean;
  notifyTaskDelete: boolean;
  notifyCommentAdd: boolean;
  notifyMention: boolean;
  notifyOverdue: boolean;
  notifyDigest: boolean;
}

interface CreateUserInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  isAdmin?: boolean;
}

interface UpdateUserInput {
  id: number;
  firstName?: string;
  lastName?: string;
  email?: string;
  isAdmin?: boolean;
  password?: string;
  language?: string;
  timezone?: string;
  digestTime?: string;
  notifyTaskAdd?: boolean;
  notifyTaskUpdate?: boolean;
  notifyTaskDelete?: boolean;
  notifyCommentAdd?: boolean;
  notifyMention?: boolean;
  notifyOverdue?: boolean;
  notifyDigest?: boolean;
}

/**
 * Fetch all users (admin only).
 */
export function useUsers() {
  return useQuery<AdminUser[]>({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await fetch('/api/users');
      if (!res.ok) throw new Error('Failed to fetch users');
      const data = await res.json();
      return data.data;
    },
  });
}

/**
 * Fetch the list of portals a user has access to (via user_portal_access).
 * Admin only — backed by GET /api/users/[id]/portals.
 */
export function useUserPortals(userId: number | null) {
  return useQuery<UserPortalEntry[]>({
    queryKey: ['user-portals', userId],
    queryFn: async () => {
      const res = await fetch(`/api/users/${userId}/portals`);
      if (!res.ok) throw new Error('Failed to fetch user portals');
      const data = await res.json();
      return data.data;
    },
    enabled: userId !== null,
  });
}

/**
 * Grant a user access to a portal (admin flow from UserDetailModal).
 * Calls POST /api/portals/{portalId}/access.
 */
export function useGrantUserPortalAccess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      portalId,
      userId,
      role = 'viewer',
      canSeeResponsible = true,
    }: {
      portalId: number;
      userId: number;
      role?: 'admin' | 'viewer';
      canSeeResponsible?: boolean;
    }) => {
      const res = await fetch(`/api/portals/${portalId}/access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role, canSeeResponsible }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || 'Failed to grant portal access');
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      // Refresh user portals so the newly added portal appears
      queryClient.invalidateQueries({ queryKey: ['user-portals', variables.userId] });
      // portalCount on users list may have changed
      queryClient.invalidateQueries({ queryKey: ['users'] });
      // users with access to this portal
      queryClient.invalidateQueries({ queryKey: ['portal-access', variables.portalId] });
    },
  });
}

/**
 * Fetch a single user by ID.
 */
export function useUser(id: number | null) {
  return useQuery<UserDetail>({
    queryKey: ['user', id],
    queryFn: async () => {
      const res = await fetch(`/api/users/${id}`);
      if (!res.ok) throw new Error('Failed to fetch user');
      const data = await res.json();
      return data.data;
    },
    enabled: id !== null,
  });
}

/**
 * Create a new user (admin only).
 */
export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateUserInput) => {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to create user');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

/**
 * Update a user.
 */
export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateUserInput) => {
      const res = await fetch(`/api/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to update user');
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['user', variables.id] });
    },
  });
}

/**
 * Delete a user (admin only).
 */
export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/users/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to delete user');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}
