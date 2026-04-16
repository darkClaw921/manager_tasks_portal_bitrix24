/**
 * HTTP client for the meeting-worker service.
 *
 * The meeting-worker is a sibling container that orchestrates LiveKit
 * Egress and ffmpeg post-mux. Next.js API routes call it through this
 * module, never directly, so we have a single surface to reason about
 * retries, timeouts, and inter-service auth.
 *
 * Authentication: we sign a short-lived JWT with the same `JWT_SECRET`
 * shared by the worker. The worker's `verifyToken` (meeting-server/src/auth.ts)
 * accepts it because the issuer/audience match the TaskHub session format.
 * Payload fields (userId/email/isAdmin) describe a synthetic "next-server"
 * service account — they are only used for audit logs on the worker side.
 */

import { SignJWT } from 'jose';
import { getJwtSecret } from '@/lib/auth/jwt';

/** Timeout for every worker HTTP call, in milliseconds. */
const WORKER_TIMEOUT_MS = 10_000;

/** TTL for the internal service token. 60 seconds is plenty for a single RPC. */
const INTERNAL_TOKEN_TTL_SECONDS = 60;

/** Error raised when the worker is unreachable or returns a non-2xx status. */
export class EgressClientError extends Error {
  public readonly status?: number;
  public readonly body?: string;

  constructor(message: string, opts?: { status?: number; body?: string; cause?: unknown }) {
    super(message);
    this.name = 'EgressClientError';
    if (opts?.status !== undefined) this.status = opts.status;
    if (opts?.body !== undefined) this.body = opts.body;
    if (opts?.cause !== undefined) (this as { cause?: unknown }).cause = opts.cause;
  }
}

function getWorkerBaseUrl(): string {
  const url = process.env.MEETING_WORKER_URL;
  if (!url) {
    throw new EgressClientError(
      'MEETING_WORKER_URL env var is required to contact the meeting-worker'
    );
  }
  return url.replace(/\/+$/, '');
}

/**
 * Mint a short-lived internal service token.
 *
 * The worker expects the same issuer/audience the Next.js app uses for
 * regular user sessions (see `src/lib/auth/jwt.ts`). We pass synthetic
 * user-shaped claims so it passes the worker's shape assertions.
 */
async function signInternalToken(): Promise<string> {
  const secret = getJwtSecret();
  return new SignJWT({
    userId: 0,
    email: 'next-server@taskhub.internal',
    isAdmin: true,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer('taskhub')
    .setAudience('taskhub-users')
    .setSubject('next-server')
    .setExpirationTime(`${INTERNAL_TOKEN_TTL_SECONDS}s`)
    .sign(secret);
}

/**
 * Fetch wrapper that signs the request, enforces a timeout, and maps
 * failures to `EgressClientError`. Returns the parsed JSON body on success.
 */
async function workerFetch<T>(
  path: string,
  init?: { method?: 'GET' | 'POST'; body?: unknown }
): Promise<T> {
  const base = getWorkerBaseUrl();
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  const token = await signInternalToken();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WORKER_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: init?.method ?? 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const message = err instanceof Error ? err.message : String(err);
    console.error('[egress-client] network error:', url, message);
    throw new EgressClientError(`Failed to reach meeting-worker at ${url}: ${message}`, {
      cause: err,
    });
  }
  clearTimeout(timer);

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error(
      '[egress-client] non-2xx response:',
      url,
      response.status,
      body.slice(0, 500)
    );
    throw new EgressClientError(
      `meeting-worker ${url} returned HTTP ${response.status}`,
      { status: response.status, body }
    );
  }

  // Allow empty 2xx bodies (e.g. 204).
  const text = await response.text();
  if (!text) return undefined as unknown as T;
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new EgressClientError(`Invalid JSON from meeting-worker (${url})`, {
      cause: err,
      body: text,
    });
  }
}

// ==================== Public API ====================

export interface StartRecordingResponse {
  /** Whether the worker successfully kicked off egress. */
  ok: boolean;
  /** LiveKit egress ids that were started, keyed by track flavour. */
  egressIds?: string[];
}

export interface StopRecordingResponse {
  ok: boolean;
  stoppedEgressIds?: string[];
}

export interface RecordingStatusResponse {
  meetingId: number;
  activeEgress: number;
  processing: number;
  done: number;
  failed: number;
}

/**
 * Ask the worker to start recording the given meeting.
 *
 * The worker uses `roomName` to locate the LiveKit room; `meetingId` is the
 * foreign key it will stamp onto every `meeting_recordings` row.
 */
export async function startRecording(
  meetingId: number,
  roomName: string
): Promise<StartRecordingResponse> {
  return workerFetch<StartRecordingResponse>('/recordings/start', {
    method: 'POST',
    body: { meetingId, roomName },
  });
}

/**
 * Ask the worker to stop all active egress for the given meeting.
 *
 * Safe to call even if no recordings are active — the worker returns
 * `{ ok: true, stoppedEgressIds: [] }` in that case.
 */
export async function stopRecording(meetingId: number): Promise<StopRecordingResponse> {
  return workerFetch<StopRecordingResponse>('/recordings/stop', {
    method: 'POST',
    body: { meetingId },
  });
}

/**
 * Convenience alias used by the meetings service layer when ending a
 * meeting — semantically "stop anything that might still be recording".
 */
export async function stopAllForMeeting(
  meetingId: number
): Promise<StopRecordingResponse> {
  return stopRecording(meetingId);
}

/**
 * Fetch a coarse summary of recording state for the given meeting.
 * Useful for surfacing "processing" / "ready" in the UI without hitting
 * the DB from Next.js and racing the worker.
 */
export async function getRecordingStatus(
  meetingId: number
): Promise<RecordingStatusResponse> {
  return workerFetch<RecordingStatusResponse>(
    `/recordings/status?meetingId=${encodeURIComponent(String(meetingId))}`
  );
}
