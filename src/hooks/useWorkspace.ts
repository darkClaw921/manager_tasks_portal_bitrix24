'use client';

/**
 * React Query hooks for the workspaces feature.
 *
 * Endpoint coverage:
 *   - `GET    /api/workspaces`                          → list
 *   - `GET    /api/workspaces/:id`                      → detail + participants
 *   - `POST   /api/workspaces`                          → create (caller becomes owner)
 *   - `PATCH  /api/workspaces/:id`                      → owner-only update
 *   - `DELETE /api/workspaces/:id`                      → owner-only delete
 *   - `POST   /api/workspaces/:id/token`                → mint LiveKit JWT
 *   - `GET    /api/workspaces/:id/participants`         → joined participant list
 *   - `POST   /api/workspaces/:id/participants`         → owner-only bulk invite
 *   - `DELETE /api/workspaces/:id/participants/:userId` → owner-only remove
 *
 * Mirrors the pattern in `useMeeting.ts` so contributors can move between
 * the two features without re-learning ergonomics.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Workspace,
  WorkspaceParticipant,
  WorkspaceRole,
} from '@/types/workspace';
import type { WorkspaceDetail } from '@/lib/workspaces/workspaces';
import type { WorkspaceParticipantWithUser } from '@/lib/workspaces/access';

// ==================== Types ====================

export interface CreateWorkspaceInput {
  title: string;
  meetingId?: number | null;
  /** Phase 3: pre-seed the workspace from a built-in template id. */
  templateId?: string;
  /** Phase 3: pre-seed by duplicating an existing workspace by id. */
  duplicateFrom?: number;
}

/** Phase 3: built-in template metadata served by /api/workspaces/templates. */
export interface WorkspaceTemplateMeta {
  id: string;
  title: string;
  description: string;
}

export interface UpdateWorkspaceInput {
  title?: string;
  meetingId?: number | null;
}

export interface WorkspaceTokenResponse {
  token: string;
  url: string;
  roomName: string;
}

export interface AddParticipantsInput {
  userIds: number[];
  role?: Exclude<WorkspaceRole, 'owner'>;
}

export interface AddParticipantsResponse {
  added: WorkspaceParticipant[];
  alreadyPresent: number[];
}

// ==================== Fetch helpers ====================

async function throwFromResponse(response: Response, fallback: string): Promise<never> {
  const body = await response.json().catch(() => ({}));
  const message =
    (body && typeof body === 'object' && 'message' in body
      ? (body as { message?: string }).message
      : undefined) ?? fallback;
  throw new Error(message);
}

async function fetchWorkspaces(): Promise<Workspace[]> {
  const res = await fetch('/api/workspaces');
  if (!res.ok) await throwFromResponse(res, 'Failed to load workspaces');
  return ((await res.json()) as { data: Workspace[] }).data;
}

async function fetchWorkspaceDetail(id: number): Promise<WorkspaceDetail> {
  const res = await fetch(`/api/workspaces/${id}`);
  if (!res.ok) await throwFromResponse(res, 'Failed to load workspace');
  return ((await res.json()) as { data: WorkspaceDetail }).data;
}

async function postCreateWorkspace(input: CreateWorkspaceInput): Promise<Workspace> {
  const res = await fetch('/api/workspaces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) await throwFromResponse(res, 'Failed to create workspace');
  return ((await res.json()) as { data: Workspace }).data;
}

async function patchUpdateWorkspace(
  id: number,
  input: UpdateWorkspaceInput
): Promise<Workspace> {
  const res = await fetch(`/api/workspaces/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) await throwFromResponse(res, 'Failed to update workspace');
  return ((await res.json()) as { data: Workspace }).data;
}

async function deleteWorkspaceCall(id: number): Promise<{ removed: boolean }> {
  const res = await fetch(`/api/workspaces/${id}`, { method: 'DELETE' });
  if (!res.ok) await throwFromResponse(res, 'Failed to delete workspace');
  return ((await res.json()) as { data: { removed: boolean } }).data;
}

async function postIssueToken(id: number): Promise<WorkspaceTokenResponse> {
  const res = await fetch(`/api/workspaces/${id}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) await throwFromResponse(res, 'Failed to mint workspace token');
  return ((await res.json()) as { data: WorkspaceTokenResponse }).data;
}

async function fetchParticipants(
  id: number
): Promise<WorkspaceParticipantWithUser[]> {
  const res = await fetch(`/api/workspaces/${id}/participants`);
  if (!res.ok) await throwFromResponse(res, 'Failed to load participants');
  return ((await res.json()) as { data: WorkspaceParticipantWithUser[] }).data;
}

async function postAddParticipants(
  id: number,
  input: AddParticipantsInput
): Promise<AddParticipantsResponse> {
  const res = await fetch(`/api/workspaces/${id}/participants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) await throwFromResponse(res, 'Failed to invite users');
  return ((await res.json()) as { data: AddParticipantsResponse }).data;
}

async function deleteParticipantCall(
  workspaceId: number,
  userId: number
): Promise<void> {
  const res = await fetch(
    `/api/workspaces/${workspaceId}/participants/${userId}`,
    { method: 'DELETE' }
  );
  if (!res.ok) await throwFromResponse(res, 'Failed to remove participant');
}

// ==================== Hooks ====================

/** List workspaces the caller can access. Always-fresh-ish — 10s stale time. */
export function useWorkspaces() {
  return useQuery<Workspace[]>({
    queryKey: ['workspaces'],
    queryFn: fetchWorkspaces,
    staleTime: 10_000,
  });
}

/** Workspace + participants. */
export function useWorkspace(id: number | null | undefined) {
  return useQuery<WorkspaceDetail>({
    queryKey: ['workspaces', id],
    queryFn: () => fetchWorkspaceDetail(id as number),
    enabled: typeof id === 'number' && Number.isInteger(id) && id > 0,
    staleTime: 5_000,
  });
}

/** Create workspace (caller = owner). Invalidates list. */
export function useCreateWorkspace() {
  const queryClient = useQueryClient();
  return useMutation<Workspace, Error, CreateWorkspaceInput>({
    mutationFn: postCreateWorkspace,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });
}

/** Phase 3: Workspace template catalogue. */
export function useWorkspaceTemplates() {
  return useQuery<WorkspaceTemplateMeta[]>({
    queryKey: ['workspaces', 'templates'],
    queryFn: async () => {
      const res = await fetch('/api/workspaces/templates');
      if (!res.ok) throw new Error('Failed to fetch templates');
      const json = (await res.json()) as { data: { templates: WorkspaceTemplateMeta[] } };
      return json.data.templates;
    },
    staleTime: 60_000,
  });
}

/** Owner-only update. Invalidates list + this workspace. */
export function useUpdateWorkspace(id: number) {
  const queryClient = useQueryClient();
  return useMutation<Workspace, Error, UpdateWorkspaceInput>({
    mutationFn: (input) => patchUpdateWorkspace(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces', id] });
    },
  });
}

/** Owner-only delete. Invalidates list. */
export function useDeleteWorkspace() {
  const queryClient = useQueryClient();
  return useMutation<{ removed: boolean }, Error, number>({
    mutationFn: (id) => deleteWorkspaceCall(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });
}

/**
 * Mint a LiveKit token for the caller. Mutation (not query) because it has
 * a side-effect — flips the participant lastSeenAt + ensures admin viewers
 * are added to the participants pivot.
 */
export function useWorkspaceToken(id: number) {
  return useMutation<WorkspaceTokenResponse, Error, void>({
    mutationFn: () => postIssueToken(id),
  });
}

/** Joined participant list. */
export function useWorkspaceParticipants(id: number | null | undefined) {
  return useQuery<WorkspaceParticipantWithUser[]>({
    queryKey: ['workspaces', id, 'participants'],
    queryFn: () => fetchParticipants(id as number),
    enabled: typeof id === 'number' && Number.isInteger(id) && id > 0,
    staleTime: 5_000,
  });
}

/** Owner-only bulk invite. Invalidates participants + workspace detail. */
export function useAddWorkspaceParticipants(workspaceId: number) {
  const queryClient = useQueryClient();
  return useMutation<AddParticipantsResponse, Error, AddParticipantsInput>({
    mutationFn: (input) => postAddParticipants(workspaceId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces', workspaceId] });
      queryClient.invalidateQueries({
        queryKey: ['workspaces', workspaceId, 'participants'],
      });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });
}

/** Owner-only remove participant. */
export function useRemoveWorkspaceParticipant(workspaceId: number) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: (userId) => deleteParticipantCall(workspaceId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces', workspaceId] });
      queryClient.invalidateQueries({
        queryKey: ['workspaces', workspaceId, 'participants'],
      });
    },
  });
}
