import type {
  Meeting as DbMeeting,
  NewMeeting as DbNewMeeting,
  MeetingParticipant as DbMeetingParticipant,
  NewMeetingParticipant as DbNewMeetingParticipant,
  MeetingRecording as DbMeetingRecording,
  NewMeetingRecording as DbNewMeetingRecording,
  MeetingAnnotation as DbMeetingAnnotation,
  NewMeetingAnnotation as DbNewMeetingAnnotation,
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
