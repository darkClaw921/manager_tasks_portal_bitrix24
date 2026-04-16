import type {
  Meeting as DbMeeting,
  NewMeeting as DbNewMeeting,
  MeetingParticipant as DbMeetingParticipant,
  NewMeetingParticipant as DbNewMeetingParticipant,
  MeetingRecording as DbMeetingRecording,
  NewMeetingRecording as DbNewMeetingRecording,
  MeetingAnnotation as DbMeetingAnnotation,
  NewMeetingAnnotation as DbNewMeetingAnnotation,
  MeetingMessage as DbMeetingMessage,
  NewMeetingMessage as DbNewMeetingMessage,
} from '@/lib/db/schema';

/**
 * Lifecycle status of a meeting.
 *   - 'scheduled': created but not yet started (no participant connected)
 *   - 'live':      at least one participant is currently connected
 *   - 'ended':     host explicitly ended the meeting; LiveKit room closed
 */
export type MeetingStatus = 'scheduled' | 'live' | 'ended';

/** Role of a user inside a single meeting. Host can end the meeting and toggle recording. */
export type ParticipantRole = 'host' | 'participant';

/**
 * Track flavour stored as a meeting recording row.
 *   - 'audio':     per-user raw audio egress (one row per speaker)
 *   - 'video':     RoomComposite video-only egress (rare; usually combined into 'mixed')
 *   - 'mixed':     RoomComposite MP4 with mixed audio + mixed video (preview)
 *   - 'final_mkv': post-muxed MKV with mixed video + N named audio tracks
 */
export type RecordingTrackType = 'audio' | 'video' | 'mixed' | 'final_mkv';

/**
 * Processing status of a recording row, driven by LiveKit egress webhooks + post-mux worker.
 *   - 'recording':  egress is actively writing the file
 *   - 'processing': egress ended; muxer may be combining tracks
 *   - 'done':       file available for download/playback
 *   - 'failed':     egress or muxer reported a failure
 */
export type RecordingStatus = 'recording' | 'processing' | 'done' | 'failed';

/** Domain row for a meeting. Inferred from Drizzle `meetings` select model. */
export type Meeting = DbMeeting;
export type NewMeeting = DbNewMeeting;

/** Domain row for a meeting participant. */
export type MeetingParticipant = DbMeetingParticipant;
export type NewMeetingParticipant = DbNewMeetingParticipant;

/** Domain row for a recording track. Alias `Recording` exposed for UI components. */
export type MeetingRecording = DbMeetingRecording;
export type NewMeetingRecording = DbNewMeetingRecording;
export type Recording = MeetingRecording;

/** Domain row for a persisted drawing snapshot. */
export type MeetingAnnotation = DbMeetingAnnotation;
export type NewMeetingAnnotation = DbNewMeetingAnnotation;

/**
 * A single stroke drawn over the shared screen/video.
 *
 * Points are normalized to [0..1] relative to the source video track dimensions
 * so receivers can scale the stroke onto their own rendering canvas regardless
 * of window size or device pixel ratio.
 */
export interface StrokeEvent {
  /** Discriminator for DrawingPayload. */
  type: 'stroke';
  /** Stable stroke id — assigned by the sender, used to support undo. */
  id: string;
  /** Author id (app user id, not Bitrix id). */
  userId: number;
  /** CSS color string (e.g. '#ff0000'). */
  color: string;
  /** Stroke width in CSS pixels at a 1x canvas. Receiver scales proportionally. */
  width: number;
  /** Ordered polyline points, normalized to [0..1] of the source video track. */
  points: Array<{ x: number; y: number }>;
  /** Epoch ms at which the stroke was authored. */
  timestamp: number;
  /**
   * Local receive time (epoch ms) used to drive the fade-out timer in
   * `DrawingOverlay`. Stamped with `Date.now()` on the local clock of every
   * client (both for locally-drawn strokes and for strokes received over the
   * data channel) so the 2000ms hold + 400ms fade window is immune to clock
   * skew between peers.
   *
   * Optional on the wire: legacy peers may not include this field. Receivers
   * are expected to populate it with `Date.now()` before inserting the stroke
   * into their local store.
   */
  createdAt?: number;
}

/** Remove a single previously drawn stroke (by id). */
export interface UndoEvent {
  type: 'undo';
  userId: number;
  /** Id of the stroke to remove. */
  strokeId: string;
  timestamp: number;
}

/** Clear all strokes on the shared canvas. Host-only in the UI layer. */
export interface ClearEvent {
  type: 'clear';
  userId: number;
  timestamp: number;
}

/**
 * Discriminated union sent over the LiveKit data channel under topic `"draw"`.
 * Serialized via msgpackr on the wire.
 */
export type DrawingPayload = StrokeEvent | UndoEvent | ClearEvent;

// ==================== Chat messages ====================

/**
 * Payload shape of a `meeting_messages` row:
 *   - `text`:  caller sent plain text. `content` holds the body; file_* are null.
 *   - `file`:  caller uploaded a non-image file (pdf, doc, zip, mp4, ...). The
 *              file_path/name/size/mime fields are populated; width/height stay null.
 *   - `image`: same as `file` but we additionally record width/height from
 *              `sharp.metadata()` so the UI can reserve space for thumbnails
 *              without layout shift.
 */
export type MeetingMessageKind = 'text' | 'file' | 'image';

/**
 * Raw domain row for a chat message — mirrors Drizzle's select type for
 * `meeting_messages`. Use this when reading straight from the DB layer.
 */
export type MeetingMessageRow = DbMeetingMessage;
export type NewMeetingMessage = DbNewMeetingMessage;

/**
 * Author snapshot attached to each `MeetingMessage` for rendering.
 *
 * Kept small (id + display name + optional avatar URL) so the payload we ship
 * over the LiveKit data channel stays well under the SDK's reliable-ordered
 * message budget even when a user posts a long burst of messages. The backend
 * populates these fields from `users.firstName/lastName` at query time.
 */
export interface MeetingMessageUser {
  id: number;
  /** Display name (`firstName lastName`). Trimmed, empty string falls back to "—". */
  name: string;
  /** Optional avatar URL. Reserved for a future user-avatar feature. */
  avatar?: string | null;
}

/**
 * Canonical MeetingMessage used by the API, hook, and UI.
 *
 * This is the DB row plus a denormalized `user` snapshot so list endpoints
 * and LiveKit broadcasts can be rendered without additional round-trips.
 * Field types match the Drizzle select projection (hence nullable file_*).
 */
export interface MeetingMessage {
  id: number;
  meetingId: number;
  userId: number;
  user: MeetingMessageUser;
  kind: MeetingMessageKind;
  content: string | null;
  filePath: string | null;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  /**
   * ISO 8601 string (UTC). SQLite stores `DEFAULT CURRENT_TIMESTAMP` as
   * `"YYYY-MM-DD HH:MM:SS"` (space separator, no timezone); the service layer
   * normalises this to RFC 3339 before returning it to API consumers.
   */
  createdAt: string;
}

/**
 * Wire payload sent over the LiveKit data channel under topic `"chat"`.
 *
 * We reuse the canonical `MeetingMessage` shape so receivers can append the
 * incoming row straight into their state with no translation step. This is
 * fine size-wise because images are not inlined — only metadata is — and a
 * typical text bubble serialises to ~150 bytes via msgpackr.
 */
export type ChatPayload = MeetingMessage;
