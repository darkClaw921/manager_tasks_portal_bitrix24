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
