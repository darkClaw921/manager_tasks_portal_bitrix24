'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { PortalPublic } from '@/types';

// ==================== Types ====================

export interface PortalWithAccess extends PortalPublic {
  role: 'admin' | 'viewer';
  canSeeResponsible: boolean;
  canSeeAccomplice: boolean;
  canSeeAuditor: boolean;
  canSeeCreator: boolean;
  canSeeAll: boolean;
}

export interface PortalAccessUser {
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

interface GrantAccessInput {
  portalId: number;
  userId: number;
  role?: 'admin' | 'viewer';
  canSeeResponsible?: boolean;
  canSeeAccomplice?: boolean;
  canSeeAuditor?: boolean;
  canSeeCreator?: boolean;
  canSeeAll?: boolean;
}

interface UpdateAccessInput {
  portalId: number;
  userId: number;
  role?: 'admin' | 'viewer';
  canSeeResponsible?: boolean;
  canSeeAccomplice?: boolean;
  canSeeAuditor?: boolean;
  canSeeCreator?: boolean;
  canSeeAll?: boolean;
}

// ==================== Portal Fetchers ====================

/** Fetch all portals for the current user (via user_portal_access) */
async function fetchPortals(): Promise<PortalWithAccess[]> {
  const response = await fetch('/api/portals');
  if (!response.ok) {
    throw new Error('Failed to fetch portals');
  }
  const data = await response.json();
  return data.data || [];
}

/** Update a portal */
async function updatePortal(
  id: number,
  updates: { name?: string; color?: string; isActive?: boolean }
): Promise<PortalPublic> {
  const response = await fetch(`/api/portals/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!response.ok) {
    throw new Error('Failed to update portal');
  }
  const data = await response.json();
  return data.data;
}

/** Disconnect (soft-delete) a portal */
async function disconnectPortal(id: number): Promise<void> {
  const response = await fetch(`/api/portals/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Failed to disconnect portal');
  }
}

/** Sync a portal (trigger full re-sync via dedicated endpoint) */
async function syncPortal(id: number): Promise<void> {
  const response = await fetch(`/api/portals/${id}/sync`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Failed to sync portal');
  }
}

// ==================== Access Fetchers ====================

/** Fetch users with access to a portal */
async function fetchPortalAccess(portalId: number): Promise<PortalAccessUser[]> {
  const response = await fetch(`/api/portals/${portalId}/access`);
  if (!response.ok) {
    throw new Error('Failed to fetch portal access');
  }
  const data = await response.json();
  return data.data || [];
}

/** Grant access to a portal */
async function grantAccess(input: GrantAccessInput): Promise<void> {
  const { portalId, ...body } = input;
  const response = await fetch(`/api/portals/${portalId}/access`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to grant access');
  }
}

/** Update access permissions */
async function updateAccess(input: UpdateAccessInput): Promise<void> {
  const { portalId, userId, ...body } = input;
  const response = await fetch(`/api/portals/${portalId}/access/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to update access');
  }
}

/** Revoke access from a portal */
async function revokeAccess(portalId: number, userId: number): Promise<void> {
  const response = await fetch(`/api/portals/${portalId}/access/${userId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to revoke access');
  }
}

// ==================== Portal Hooks ====================

/**
 * Hook to fetch and manage portals (now includes access info).
 */
export function usePortals() {
  return useQuery({
    queryKey: ['portals'],
    queryFn: fetchPortals,
  });
}

/**
 * Hook to update a portal (name, color, etc.)
 */
export function useUpdatePortal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...updates }: { id: number; name?: string; color?: string; isActive?: boolean }) =>
      updatePortal(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portals'] });
    },
  });
}

/**
 * Hook to disconnect a portal
 */
export function useDisconnectPortal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: disconnectPortal,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portals'] });
    },
  });
}

/**
 * Hook to sync a portal
 */
export function useSyncPortal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: syncPortal,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portals'] });
    },
  });
}

// ==================== Access Hooks ====================

/**
 * Hook to fetch users with access to a specific portal.
 */
export function usePortalAccess(portalId: number | null) {
  return useQuery({
    queryKey: ['portal-access', portalId],
    queryFn: () => fetchPortalAccess(portalId!),
    enabled: portalId !== null,
  });
}

/**
 * Hook to grant a user access to a portal.
 */
export function useGrantAccess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: grantAccess,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['portal-access', variables.portalId] });
    },
  });
}

/**
 * Hook to update a user's access permissions on a portal.
 */
export function useUpdateAccess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateAccess,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['portal-access', variables.portalId] });
    },
  });
}

/**
 * Hook to revoke a user's access from a portal.
 */
export function useRevokeAccess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ portalId, userId }: { portalId: number; userId: number }) =>
      revokeAccess(portalId, userId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['portal-access', variables.portalId] });
    },
  });
}
