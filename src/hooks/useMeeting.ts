'use client';

/**
 * React Query hooks for the meetings feature.
 *
 * Endpoint coverage (Phase 3 API):
 *   - `GET  /api/meetings`                  → list of meetings the caller can access
 *   - `GET  /api/meetings/:id`              → meeting detail + participants
 *   - `POST /api/meetings`                  → create meeting (current user = host)
 *   - `DELETE /api/meetings/:id`            → end meeting (host only, 403 otherwise)
 *   - `POST /api/meetings/:id/token`        → mint LiveKit token for the caller
 *   - `GET  /api/meetings/:id/recordings`   → recordings manifest
 *
 * Patterns mirror `src/hooks/usePayments.ts` / `src/hooks/useWallet.ts`.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Meeting } from '@/types/meeting';
import type { MeetingDetail } from '@/lib/meetings/meetings';
import type { RecordingsManifest } from '@/lib/meetings/recordings';

// ==================== Types ====================

export interface CreateMeetingInput {
  title: string;
  recordingEnabled?: boolean;
}

export interface MeetingTokenResponse {
  token: string;
  url: string;
  roomName: string;
}

// ==================== Fetch helpers ====================

async function throwFromResponse(
  response: Response,
  fallback: string
): Promise<never> {
  const body = await response.json().catch(() => ({}));
  const message =
    (body && typeof body === 'object' && 'message' in body
      ? (body as { message?: string }).message
      : undefined) ?? fallback;
  throw new Error(message);
}

async function fetchMeetings(): Promise<Meeting[]> {
  const response = await fetch('/api/meetings');
  if (!response.ok) await throwFromResponse(response, 'Failed to load meetings');
  const json = await response.json();
  return json.data as Meeting[];
}

async function fetchMeetingDetail(id: number): Promise<MeetingDetail> {
  const response = await fetch(`/api/meetings/${id}`);
  if (!response.ok) await throwFromResponse(response, 'Failed to load meeting');
  const json = await response.json();
  return json.data as MeetingDetail;
}

async function postCreateMeeting(input: CreateMeetingInput): Promise<Meeting> {
  const response = await fetch('/api/meetings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) await throwFromResponse(response, 'Failed to create meeting');
  const json = await response.json();
  return json.data as Meeting;
}

async function deleteEndMeeting(id: number): Promise<Meeting> {
  const response = await fetch(`/api/meetings/${id}`, { method: 'DELETE' });
  if (!response.ok) await throwFromResponse(response, 'Failed to end meeting');
  const json = await response.json();
  return json.data as Meeting;
}

async function postIssueToken(id: number): Promise<MeetingTokenResponse> {
  const response = await fetch(`/api/meetings/${id}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) await throwFromResponse(response, 'Failed to mint meeting token');
  const json = await response.json();
  return json.data as MeetingTokenResponse;
}

async function fetchRecordings(id: number): Promise<RecordingsManifest> {
  const response = await fetch(`/api/meetings/${id}/recordings`);
  if (!response.ok) await throwFromResponse(response, 'Failed to load recordings');
  const json = await response.json();
  return json.data as RecordingsManifest;
}

async function postStartRecording(id: number): Promise<void> {
  const response = await fetch(`/api/meetings/${id}/recordings/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) await throwFromResponse(response, 'Failed to start recording');
}

async function postStopRecording(id: number): Promise<void> {
  const response = await fetch(`/api/meetings/${id}/recordings/stop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) await throwFromResponse(response, 'Failed to stop recording');
}

export interface InvitableUser {
  id: number;
  firstName: string;
  lastName: string;
}

async function fetchInvitableUsers(): Promise<InvitableUser[]> {
  const response = await fetch('/api/meetings/invitable-users');
  if (!response.ok) await throwFromResponse(response, 'Failed to load users');
  const json = await response.json();
  return json.data as InvitableUser[];
}

async function postInviteParticipants(
  meetingId: number,
  userIds: number[]
): Promise<void> {
  const response = await fetch(`/api/meetings/${meetingId}/participants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userIds }),
  });
  if (!response.ok) await throwFromResponse(response, 'Failed to invite users');
}

async function deleteRemoveParticipant(
  meetingId: number,
  userId: number
): Promise<void> {
  const response = await fetch(
    `/api/meetings/${meetingId}/participants/${userId}`,
    { method: 'DELETE' }
  );
  if (!response.ok) await throwFromResponse(response, 'Failed to remove participant');
}

export interface InviteLink {
  token: string;
  url: string;
  createdAt: string;
}

async function fetchInviteLinks(meetingId: number): Promise<InviteLink[]> {
  const response = await fetch(`/api/meetings/${meetingId}/invite-links`);
  if (!response.ok) await throwFromResponse(response, 'Failed to load invite links');
  const json = await response.json();
  return json.data as InviteLink[];
}

async function postCreateInviteLink(meetingId: number): Promise<InviteLink> {
  const response = await fetch(`/api/meetings/${meetingId}/invite-links`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) await throwFromResponse(response, 'Failed to create invite link');
  const json = await response.json();
  return json.data as InviteLink;
}

async function deleteInviteLink(meetingId: number, token: string): Promise<void> {
  const response = await fetch(
    `/api/meetings/${meetingId}/invite-links?token=${encodeURIComponent(token)}`,
    { method: 'DELETE' }
  );
  if (!response.ok) await throwFromResponse(response, 'Failed to revoke invite link');
}

// ==================== Hooks ====================

/** List of meetings the caller is a host or participant of. */
export function useMeetings() {
  return useQuery<Meeting[]>({
    queryKey: ['meetings'],
    queryFn: fetchMeetings,
    staleTime: 10_000,
  });
}

/** Meeting detail including joined participants. */
export function useMeetingDetail(id: number | null | undefined) {
  return useQuery<MeetingDetail>({
    queryKey: ['meetings', id],
    queryFn: () => fetchMeetingDetail(id as number),
    enabled: typeof id === 'number' && Number.isInteger(id) && id > 0,
    staleTime: 5_000,
  });
}

/** Create meeting. Invalidates the list on success. */
export function useCreateMeeting() {
  const queryClient = useQueryClient();
  return useMutation<Meeting, Error, CreateMeetingInput>({
    mutationFn: postCreateMeeting,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
    },
  });
}

/** End meeting (host only). Invalidates list + this meeting's detail. */
export function useEndMeeting(id: number) {
  const queryClient = useQueryClient();
  return useMutation<Meeting, Error, void>({
    mutationFn: () => deleteEndMeeting(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      queryClient.invalidateQueries({ queryKey: ['meetings', id] });
    },
  });
}

/**
 * Mint a LiveKit access token for the caller. Mutation rather than query
 * because it has a side-effect (upserts participant row, flips meeting to
 * `live` on first join) and must only run on an explicit user gesture.
 */
export function useMeetingToken(id: number) {
  return useMutation<MeetingTokenResponse, Error, void>({
    mutationFn: () => postIssueToken(id),
  });
}

/** Recordings manifest for the meeting. Polled while still processing. */
export function useMeetingRecordings(id: number | null | undefined) {
  return useQuery<RecordingsManifest>({
    queryKey: ['meetings', id, 'recordings'],
    queryFn: () => fetchRecordings(id as number),
    enabled: typeof id === 'number' && Number.isInteger(id) && id > 0,
    staleTime: 5_000,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.status === 'processing' ? 3_000 : false;
    },
  });
}

/** Start recording (host only). Invalidates the recordings manifest. */
export function useStartRecording(id: number) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: () => postStartRecording(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings', id, 'recordings'] });
    },
  });
}

/** Stop recording (host only). Invalidates the recordings manifest. */
export function useStopRecording(id: number) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: () => postStopRecording(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings', id, 'recordings'] });
    },
  });
}

/** Minimal user list for the invite picker (non-admin accessible). */
export function useInvitableUsers(enabled = true) {
  return useQuery<InvitableUser[]>({
    queryKey: ['meetings', 'invitable-users'],
    queryFn: fetchInvitableUsers,
    enabled,
    staleTime: 60_000,
  });
}

/** Invite users. Invalidates the meeting detail so the participants list refreshes. */
export function useInviteMeetingParticipants(meetingId: number) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number[]>({
    mutationFn: (userIds) => postInviteParticipants(meetingId, userIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings', meetingId] });
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
    },
  });
}

/** Remove a participant (host only). */
export function useRemoveMeetingParticipant(meetingId: number) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: (userId) => deleteRemoveParticipant(meetingId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings', meetingId] });
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
    },
  });
}

/** List active guest invite links (host only). */
export function useMeetingInviteLinks(meetingId: number, enabled = true) {
  return useQuery<InviteLink[]>({
    queryKey: ['meetings', meetingId, 'invite-links'],
    queryFn: () => fetchInviteLinks(meetingId),
    enabled,
    staleTime: 10_000,
  });
}

/** Create a fresh guest invite link (host only). */
export function useCreateInviteLink(meetingId: number) {
  const queryClient = useQueryClient();
  return useMutation<InviteLink, Error, void>({
    mutationFn: () => postCreateInviteLink(meetingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings', meetingId, 'invite-links'] });
    },
  });
}

/** Revoke a guest invite link (host only). */
export function useRevokeInviteLink(meetingId: number) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (token) => deleteInviteLink(meetingId, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings', meetingId, 'invite-links'] });
    },
  });
}
