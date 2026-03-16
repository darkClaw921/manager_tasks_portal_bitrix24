'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { BitrixUser, UserBitrixMapping } from '@/types';

// ==================== Types ====================

export interface MappingWithUser extends UserBitrixMapping {
  email: string;
  firstName: string;
  lastName: string;
}

interface CreateMappingInput {
  portalId: number;
  userId: number;
  bitrixUserId: string;
  bitrixName?: string;
}

interface DeleteMappingInput {
  portalId: number;
  userId: number;
}

// ==================== Fetchers ====================

/** Fetch all Bitrix24 user mappings for a portal */
async function fetchMappings(portalId: number): Promise<MappingWithUser[]> {
  const response = await fetch(`/api/portals/${portalId}/mappings`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch mappings');
  }
  const data = await response.json();
  return data.data || [];
}

/** Create a user-to-Bitrix24 mapping */
async function createMappingApi(input: CreateMappingInput): Promise<void> {
  const { portalId, ...body } = input;
  const response = await fetch(`/api/portals/${portalId}/mappings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to create mapping');
  }
}

/** Delete a user-to-Bitrix24 mapping */
async function deleteMappingApi(input: DeleteMappingInput): Promise<void> {
  const { portalId, userId } = input;
  const response = await fetch(`/api/portals/${portalId}/mappings`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to delete mapping');
  }
}

/** Fetch Bitrix24 users from a portal, with optional search */
async function fetchBitrixUsersApi(
  portalId: number,
  search?: string
): Promise<BitrixUser[]> {
  const params = new URLSearchParams();
  if (search && search.trim()) {
    params.set('search', search.trim());
  }
  const url = `/api/portals/${portalId}/bitrix-users${params.toString() ? `?${params.toString()}` : ''}`;
  const response = await fetch(url);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch Bitrix24 users');
  }
  const data = await response.json();
  return data.data || [];
}

// ==================== Hooks ====================

/**
 * Hook to fetch all Bitrix24 user mappings for a portal.
 */
export function useBitrixMappings(portalId: number | null) {
  return useQuery({
    queryKey: ['bitrix-mappings', portalId],
    queryFn: () => fetchMappings(portalId!),
    enabled: portalId !== null,
  });
}

/**
 * Hook to create a user-to-Bitrix24 mapping.
 * Invalidates the mappings cache on success.
 */
export function useCreateMapping() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createMappingApi,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['bitrix-mappings', variables.portalId] });
    },
  });
}

/**
 * Hook to delete a user-to-Bitrix24 mapping.
 * Invalidates the mappings cache on success.
 */
export function useDeleteMapping() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteMappingApi,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['bitrix-mappings', variables.portalId] });
    },
  });
}

/**
 * Hook to fetch Bitrix24 users from a portal.
 * Supports search query for filtering.
 */
export function useBitrixUsers(portalId: number | null, search?: string) {
  return useQuery({
    queryKey: ['bitrix-users', portalId, search || ''],
    queryFn: () => fetchBitrixUsersApi(portalId!, search),
    enabled: portalId !== null,
  });
}

// ==================== Custom Stage Types ====================

export interface CustomStageWithMappings {
  id: number;
  portalId: number;
  title: string;
  color: string | null;
  sort: number;
  createdAt: string;
  updatedAt: string;
  mappedStages: {
    id: number;
    bitrixStageId: string;
    title: string;
    color: string | null;
    taskStageId: number;
  }[];
}

interface CreateCustomStageInput {
  portalId: number;
  title: string;
  color?: string;
  sort?: number;
}

interface UpdateCustomStageInput {
  portalId: number;
  stageId: number;
  title?: string;
  color?: string;
  sort?: number;
}

interface DeleteCustomStageInput {
  portalId: number;
  stageId: number;
}

interface MapBitrixStageInput {
  portalId: number;
  stageId: number;
  bitrixStageId: number;
}

interface UnmapBitrixStageInput {
  portalId: number;
  stageId: number;
  bitrixStageId: number;
}

export interface PortalStageWithMapping {
  id: number;
  portalId: number;
  bitrixStageId: string;
  entityId: number;
  entityType: string;
  title: string;
  sort: number;
  color: string | null;
  systemType: string | null;
  createdAt: string;
  updatedAt: string;
  customStage: { id: number; title: string; color: string | null } | null;
}

// ==================== Custom Stage Fetchers ====================

/** Fetch custom stages with mappings for a portal */
async function fetchCustomStages(portalId: number): Promise<CustomStageWithMappings[]> {
  const response = await fetch(`/api/portals/${portalId}/custom-stages`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch custom stages');
  }
  const data = await response.json();
  return data.data || [];
}

/** Create a custom stage */
async function createCustomStageApi(input: CreateCustomStageInput): Promise<CustomStageWithMappings> {
  const { portalId, ...body } = input;
  const response = await fetch(`/api/portals/${portalId}/custom-stages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to create custom stage');
  }
  const data = await response.json();
  return data.data;
}

/** Update a custom stage */
async function updateCustomStageApi(input: UpdateCustomStageInput): Promise<void> {
  const { portalId, stageId, ...body } = input;
  const response = await fetch(`/api/portals/${portalId}/custom-stages/${stageId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to update custom stage');
  }
}

/** Delete a custom stage */
async function deleteCustomStageApi(input: DeleteCustomStageInput): Promise<void> {
  const { portalId, stageId } = input;
  const response = await fetch(`/api/portals/${portalId}/custom-stages/${stageId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to delete custom stage');
  }
}

/** Add a Bitrix24 stage mapping to a custom stage */
async function mapBitrixStageApi(input: MapBitrixStageInput): Promise<void> {
  const { portalId, stageId, bitrixStageId } = input;
  const response = await fetch(`/api/portals/${portalId}/custom-stages/${stageId}/mappings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bitrixStageId }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to map Bitrix24 stage');
  }
}

/** Remove a Bitrix24 stage mapping from a custom stage */
async function unmapBitrixStageApi(input: UnmapBitrixStageInput): Promise<void> {
  const { portalId, stageId, bitrixStageId } = input;
  const response = await fetch(`/api/portals/${portalId}/custom-stages/${stageId}/mappings`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bitrixStageId }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to unmap Bitrix24 stage');
  }
}

/** Fetch Bitrix24 stages for a portal (from stages API, enriched with custom stage info) */
async function fetchPortalStages(portalId: number): Promise<PortalStageWithMapping[]> {
  const response = await fetch(`/api/portals/${portalId}/stages`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch portal stages');
  }
  const data = await response.json();
  return data.data || [];
}

// ==================== Custom Stage Hooks ====================

/**
 * Hook to fetch custom stages with mappings for a portal.
 */
export function useCustomStages(portalId: number | null) {
  return useQuery({
    queryKey: ['custom-stages', portalId],
    queryFn: () => fetchCustomStages(portalId!),
    enabled: portalId !== null,
  });
}

/**
 * Hook to create a custom stage.
 * Invalidates the custom-stages cache on success.
 */
export function useCreateCustomStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createCustomStageApi,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['custom-stages', variables.portalId] });
    },
  });
}

/**
 * Hook to update a custom stage.
 * Invalidates the custom-stages cache on success.
 */
export function useUpdateCustomStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateCustomStageApi,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['custom-stages', variables.portalId] });
    },
  });
}

/**
 * Hook to delete a custom stage.
 * Invalidates the custom-stages cache on success.
 */
export function useDeleteCustomStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteCustomStageApi,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['custom-stages', variables.portalId] });
    },
  });
}

/**
 * Hook to add a Bitrix24 stage mapping to a custom stage.
 * Invalidates custom-stages and portal-stages caches on success.
 */
export function useMapBitrixStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: mapBitrixStageApi,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['custom-stages', variables.portalId] });
      queryClient.invalidateQueries({ queryKey: ['portal-stages', variables.portalId] });
    },
  });
}

/**
 * Hook to remove a Bitrix24 stage mapping from a custom stage.
 * Invalidates custom-stages and portal-stages caches on success.
 */
export function useUnmapBitrixStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: unmapBitrixStageApi,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['custom-stages', variables.portalId] });
      queryClient.invalidateQueries({ queryKey: ['portal-stages', variables.portalId] });
    },
  });
}

/**
 * Hook to fetch Bitrix24 stages for a portal (enriched with custom stage mapping info).
 */
export function usePortalStages(portalId: number | null) {
  return useQuery({
    queryKey: ['portal-stages', portalId],
    queryFn: () => fetchPortalStages(portalId!),
    enabled: portalId !== null,
  });
}
