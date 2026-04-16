/**
 * Meeting chat service layer.
 *
 * Reads and writes rows in `meeting_messages`. All three creators return a
 * canonical `MeetingMessage` (DB row + joined author snapshot) so the API and
 * the LiveKit data-channel broadcast can ship the exact same payload the UI
 * will render — no per-consumer shape translation.
 *
 * Why validation is here (not in the API route): background jobs, tests and
 * future automated senders (e.g. bot replies) should also be protected by the
 * same "content non-empty and <= 4000 chars" + "kind matches mimeType" rules.
 *
 * Access control (`canJoinMeeting`) stays in the route layer — this module
 * assumes the caller has already authorised the user.
 */
import { db } from '@/lib/db';
import { meetingMessages, users } from '@/lib/db/schema';
import { and, desc, eq, lt } from 'drizzle-orm';
import type {
  MeetingMessage,
  MeetingMessageKind,
  MeetingMessageUser,
} from '@/types/meeting';

/** Hard cap on a single text message body. Matches the API route validation. */
export const MAX_TEXT_LENGTH = 4000;

/** Default page size for `listMessages`. The API clamps to MAX_LIMIT. */
export const DEFAULT_LIMIT = 50;
/** Hard cap enforced by the API layer; exposed here for symmetry in tests. */
export const MAX_LIMIT = 100;

// ==================== Inputs ====================

export interface ListMessagesOptions {
  /** Max rows to return. Defaults to 50; API route clamps to 100. */
  limit?: number;
  /**
   * Cursor: return messages strictly older than this instant. Accepts either
   * a `Date` or an ISO 8601 string. `undefined` returns the most recent page.
   */
  before?: Date | string;
}

export interface CreateFileMessageInput {
  filePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  /**
   * Optional caller hint. When omitted, `kind` is derived from `mimeType`
   * (`image/*` → `'image'`, everything else → `'file'`). If supplied and it
   * disagrees with the mimeType, we reject — the route layer should not lie
   * to the DB about what's on disk.
   */
  kind?: Exclude<MeetingMessageKind, 'text'>;
  width?: number;
  height?: number;
}

// ==================== Helpers ====================

/**
 * Normalise SQLite's `CURRENT_TIMESTAMP` format (`"YYYY-MM-DD HH:MM:SS"`, no
 * timezone) to RFC 3339 (`"YYYY-MM-DDTHH:MM:SS.sssZ"`) so browsers + clients
 * can feed it into `new Date(...)` without relying on the `sqlite3` quirk.
 */
function toIsoString(raw: string): string {
  // Already ISO — pass through.
  if (raw.includes('T')) return raw;
  // SQLite's native format: "YYYY-MM-DD HH:MM:SS" (UTC).
  const parsed = new Date(raw.replace(' ', 'T') + 'Z');
  if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
  return raw;
}

/** Build the author snapshot attached to each message. */
function buildUser(row: {
  userId: number;
  firstName: string | null;
  lastName: string | null;
}): MeetingMessageUser {
  const first = row.firstName?.trim() ?? '';
  const last = row.lastName?.trim() ?? '';
  const combined = `${first} ${last}`.trim();
  return {
    id: row.userId,
    name: combined || '—',
    avatar: null,
  };
}

/** Assemble the canonical wire message from the DB join. */
function hydrate(row: {
  id: number;
  meetingId: number;
  userId: number;
  kind: string;
  content: string | null;
  filePath: string | null;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  createdAt: string;
  firstName: string | null;
  lastName: string | null;
}): MeetingMessage {
  return {
    id: row.id,
    meetingId: row.meetingId,
    userId: row.userId,
    user: buildUser({
      userId: row.userId,
      firstName: row.firstName,
      lastName: row.lastName,
    }),
    kind: row.kind as MeetingMessageKind,
    content: row.content,
    filePath: row.filePath,
    fileName: row.fileName,
    fileSize: row.fileSize,
    mimeType: row.mimeType,
    width: row.width,
    height: row.height,
    createdAt: toIsoString(row.createdAt),
  };
}

/** Derive the kind from a mimeType. Nothing else is treated as an image. */
export function inferKindFromMime(
  mimeType: string
): Exclude<MeetingMessageKind, 'text'> {
  return mimeType.toLowerCase().startsWith('image/') ? 'image' : 'file';
}

// ==================== Queries ====================

/**
 * List chat messages for a meeting, newest-first. Cursor-paginated via
 * `before` (exclusive). Always joins `users` to attach the author snapshot.
 *
 * Ordering rationale: the chat UI loads a batch, reverses it into chronological
 * order, and prepends earlier pages at the top. Returning newest-first from
 * the DB is the natural direction for the composite index
 * `(meeting_id, created_at DESC)`.
 */
export function listMessages(
  meetingId: number,
  options: ListMessagesOptions = {}
): MeetingMessage[] {
  const limit = Math.min(
    Math.max(1, Math.floor(options.limit ?? DEFAULT_LIMIT)),
    MAX_LIMIT
  );

  const beforeDate = (() => {
    if (!options.before) return null;
    const d = options.before instanceof Date ? options.before : new Date(options.before);
    if (!Number.isFinite(d.getTime())) return null;
    // SQLite stores the TIMESTAMP as local-style `YYYY-MM-DD HH:MM:SS`.
    // Compare via ISO string (drizzle passes it through quoting) — it works
    // because both formats are lex-sortable for the same calendar instants.
    return d.toISOString();
  })();

  const whereClause = beforeDate
    ? and(
        eq(meetingMessages.meetingId, meetingId),
        lt(meetingMessages.createdAt, beforeDate)
      )
    : eq(meetingMessages.meetingId, meetingId);

  const rows = db
    .select({
      id: meetingMessages.id,
      meetingId: meetingMessages.meetingId,
      userId: meetingMessages.userId,
      kind: meetingMessages.kind,
      content: meetingMessages.content,
      filePath: meetingMessages.filePath,
      fileName: meetingMessages.fileName,
      fileSize: meetingMessages.fileSize,
      mimeType: meetingMessages.mimeType,
      width: meetingMessages.width,
      height: meetingMessages.height,
      createdAt: meetingMessages.createdAt,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(meetingMessages)
    .leftJoin(users, eq(users.id, meetingMessages.userId))
    .where(whereClause)
    .orderBy(desc(meetingMessages.createdAt), desc(meetingMessages.id))
    .limit(limit)
    .all();

  return rows.map(hydrate);
}

/**
 * Fetch a single message by id, joined to `users`. Used by the upload route
 * and API handlers that need to echo the just-inserted row in hydrated form.
 * Returns null when the id does not match any row (also if the message's
 * meeting was deleted and CASCADE cleaned up the row).
 */
export function getMessage(id: number): MeetingMessage | null {
  const row = db
    .select({
      id: meetingMessages.id,
      meetingId: meetingMessages.meetingId,
      userId: meetingMessages.userId,
      kind: meetingMessages.kind,
      content: meetingMessages.content,
      filePath: meetingMessages.filePath,
      fileName: meetingMessages.fileName,
      fileSize: meetingMessages.fileSize,
      mimeType: meetingMessages.mimeType,
      width: meetingMessages.width,
      height: meetingMessages.height,
      createdAt: meetingMessages.createdAt,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(meetingMessages)
    .leftJoin(users, eq(users.id, meetingMessages.userId))
    .where(eq(meetingMessages.id, id))
    .get();

  return row ? hydrate(row) : null;
}

// ==================== Mutations ====================

/**
 * Insert a text message.
 *
 * @throws Error when `content` is empty after trim or longer than MAX_TEXT_LENGTH.
 */
export function createTextMessage(
  meetingId: number,
  userId: number,
  content: string
): MeetingMessage {
  if (!Number.isInteger(meetingId) || meetingId <= 0) {
    throw new Error('createTextMessage: meetingId must be a positive integer');
  }
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error('createTextMessage: userId must be a positive integer');
  }

  const trimmed = (content ?? '').trim();
  if (!trimmed) {
    throw new Error('createTextMessage: content must not be empty');
  }
  if (trimmed.length > MAX_TEXT_LENGTH) {
    throw new Error(
      `createTextMessage: content exceeds ${MAX_TEXT_LENGTH} characters`
    );
  }

  const inserted = db
    .insert(meetingMessages)
    .values({
      meetingId,
      userId,
      kind: 'text',
      content: trimmed,
    })
    .returning({ id: meetingMessages.id })
    .get();

  const hydrated = getMessage(inserted.id);
  if (!hydrated) {
    throw new Error('createTextMessage: failed to hydrate inserted row');
  }
  return hydrated;
}

/**
 * Insert a file or image message. The caller is responsible for persisting
 * the file on disk first — this function only writes the DB row and assumes
 * the file at `filePath` exists.
 *
 * Validation:
 *   - All string fields must be non-empty after trim.
 *   - `fileSize >= 0`.
 *   - `mimeType` controls `kind` unless the caller overrode it; an override
 *     that disagrees is rejected.
 *   - For `kind === 'image'`, both `width` and `height` must be positive.
 */
export function createFileMessage(
  meetingId: number,
  userId: number,
  input: CreateFileMessageInput
): MeetingMessage {
  if (!Number.isInteger(meetingId) || meetingId <= 0) {
    throw new Error('createFileMessage: meetingId must be a positive integer');
  }
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error('createFileMessage: userId must be a positive integer');
  }

  const filePath = input.filePath?.trim();
  const fileName = input.fileName?.trim();
  const mimeType = input.mimeType?.trim();

  if (!filePath) throw new Error('createFileMessage: filePath required');
  if (!fileName) throw new Error('createFileMessage: fileName required');
  if (!mimeType) throw new Error('createFileMessage: mimeType required');
  if (!Number.isFinite(input.fileSize) || input.fileSize < 0) {
    throw new Error('createFileMessage: fileSize must be >= 0');
  }

  const derived = inferKindFromMime(mimeType);
  const kind: Exclude<MeetingMessageKind, 'text'> = input.kind ?? derived;
  if (input.kind && input.kind !== derived) {
    throw new Error(
      `createFileMessage: kind='${input.kind}' mismatches mimeType='${mimeType}' (derived '${derived}')`
    );
  }

  if (kind === 'image') {
    if (
      !Number.isFinite(input.width) ||
      !Number.isFinite(input.height) ||
      (input.width ?? 0) <= 0 ||
      (input.height ?? 0) <= 0
    ) {
      throw new Error(
        'createFileMessage: image messages require positive width/height'
      );
    }
  }

  const inserted = db
    .insert(meetingMessages)
    .values({
      meetingId,
      userId,
      kind,
      filePath,
      fileName,
      fileSize: Math.floor(input.fileSize),
      mimeType,
      width: kind === 'image' ? (input.width ?? null) : null,
      height: kind === 'image' ? (input.height ?? null) : null,
    })
    .returning({ id: meetingMessages.id })
    .get();

  const hydrated = getMessage(inserted.id);
  if (!hydrated) {
    throw new Error('createFileMessage: failed to hydrate inserted row');
  }
  return hydrated;
}
