'use client';

/**
 * In-memory store for the live state of a single meeting room.
 *
 * Scope:
 *  - `participants` — remote + local participants keyed by their LiveKit `sid`.
 *  - `localTracks`  — publication handles for the current user's mic/cam/screen.
 *  - `tools`        — state of the drawing toolbar (color, width, mode).
 *  - `annotations`  — stroke events accumulated over the data channel.
 *  - `recordingState` — UI feedback while host toggles recording.
 *
 * Not persisted (no `persist` middleware) — meeting state is ephemeral per
 * connection and rehydrating from localStorage would be incorrect.
 */

import { create } from 'zustand';
import type { StrokeEvent } from '@/types/meeting';
import type {
  Participant,
  LocalTrackPublication,
  RemoteTrackPublication,
} from 'livekit-client';

/**
 * Snapshot of a participant for rendering. We intentionally keep a reference
 * to the LiveKit `Participant` object so components can read live-updated
 * fields like `audioLevel`, `isSpeaking`, `connectionQuality` through refs
 * without copying them into store state on every tick.
 */
export interface ParticipantInfo {
  sid: string;
  identity: string;
  name: string;
  isLocal: boolean;
  isHost: boolean;
  /** Live LiveKit participant handle — used for track lookups and event hooks. */
  participant: Participant;
}

/** Known publications for the local user. `null` when the source is off. */
export interface LocalTracksState {
  mic: LocalTrackPublication | null;
  cam: LocalTrackPublication | null;
  screen: LocalTrackPublication | null;
}

/** Drawing toolbar state. `mode` controls pointer behaviour in the overlay. */
export interface ToolsState {
  color: string;
  width: number;
  mode: 'pen' | 'eraser';
}

/** Recording UI state driven by record start/stop mutations. */
export type RecordingUiState = 'idle' | 'recording' | 'stopping';

interface MeetingState {
  participants: Map<string, ParticipantInfo>;
  localTracks: LocalTracksState;
  tools: ToolsState;
  annotations: StrokeEvent[];
  recordingState: RecordingUiState;

  // ==================== Participant actions ====================
  setParticipant: (info: ParticipantInfo) => void;
  removeParticipant: (sid: string) => void;
  clearParticipants: () => void;

  // ==================== Local track actions ====================
  setLocalTrack: (
    kind: keyof LocalTracksState,
    publication: LocalTrackPublication | RemoteTrackPublication | null
  ) => void;

  // ==================== Drawing actions ====================
  addStroke: (stroke: StrokeEvent) => void;
  undoStroke: (strokeId: string) => void;
  clearStrokes: () => void;
  setTool: (patch: Partial<ToolsState>) => void;

  // ==================== Recording actions ====================
  setRecordingState: (state: RecordingUiState) => void;

  // ==================== Reset ====================
  reset: () => void;
}

const DEFAULT_TOOLS: ToolsState = {
  color: '#ef4444',
  width: 3,
  mode: 'pen',
};

const DEFAULT_LOCAL_TRACKS: LocalTracksState = {
  mic: null,
  cam: null,
  screen: null,
};

/**
 * Primary store hook. Instances are singletons at module scope — every
 * meeting page mount reuses the same state, so the top-level MeetingRoom
 * component is responsible for calling `reset()` on unmount.
 */
export const useMeetingStore = create<MeetingState>((set) => ({
  participants: new Map<string, ParticipantInfo>(),
  localTracks: { ...DEFAULT_LOCAL_TRACKS },
  tools: { ...DEFAULT_TOOLS },
  annotations: [],
  recordingState: 'idle',

  setParticipant: (info) =>
    set((state) => {
      const next = new Map(state.participants);
      next.set(info.sid, info);
      return { participants: next };
    }),

  removeParticipant: (sid) =>
    set((state) => {
      if (!state.participants.has(sid)) return state;
      const next = new Map(state.participants);
      next.delete(sid);
      return { participants: next };
    }),

  clearParticipants: () => set({ participants: new Map() }),

  setLocalTrack: (kind, publication) =>
    set((state) => ({
      localTracks: {
        ...state.localTracks,
        // Narrow: we only store local publications in the store. Callers
        // that accidentally pass a remote publication get treated as null.
        [kind]:
          publication && (publication as LocalTrackPublication).track
            ? (publication as LocalTrackPublication)
            : null,
      },
    })),

  addStroke: (stroke) =>
    set((state) => ({
      annotations: [...state.annotations, stroke],
    })),

  undoStroke: (strokeId) =>
    set((state) => ({
      annotations: state.annotations.filter((s) => s.id !== strokeId),
    })),

  clearStrokes: () => set({ annotations: [] }),

  setTool: (patch) =>
    set((state) => ({ tools: { ...state.tools, ...patch } })),

  setRecordingState: (recordingState) => set({ recordingState }),

  reset: () =>
    set({
      participants: new Map(),
      localTracks: { ...DEFAULT_LOCAL_TRACKS },
      tools: { ...DEFAULT_TOOLS },
      annotations: [],
      recordingState: 'idle',
    }),
}));
