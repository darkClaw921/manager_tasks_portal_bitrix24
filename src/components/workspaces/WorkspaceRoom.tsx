'use client';

/**
 * Top-level workspace room composer.
 *
 * Wires together:
 *   - LiveKit Room lifecycle (`useWorkspaceRoom`)
 *   - Realtime op fan-in/out (`useWorkspaceOps`)
 *   - Cursor presence (`useWorkspacePresence`)
 *   - Initial snapshot + op-log replay
 *   - The canvas + selection layer + cursors layer + toolbar + sidebar
 *
 * Bootstrap sequence on mount (or on workspaceId change):
 *   1. GET /snapshot → call `replaceElements(payload, snapshotVersion, snapshotVersion)`.
 *   2. GET /ops?since=<snapshotVersion> → fold each op via `applyOpLocal`,
 *      bump `currentVersion` to maxId.
 *   3. Show the canvas.
 *
 * Reconnect: when LiveKit re-establishes the connection (after a transient
 * drop), we re-issue `GET /ops?since=<currentVersion>` to catch up on what
 * we missed while disconnected.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConnectionState, DisconnectReason } from 'livekit-client';
import { useWorkspaceRoom } from '@/hooks/useWorkspaceRoom';
import { useToast } from '@/components/ui/Toast';
import { useWorkspaceOps } from '@/hooks/useWorkspaceOps';
import { useWorkspacePresence } from '@/hooks/useWorkspacePresence';
import { useWorkspaceSnapshot } from '@/hooks/useWorkspaceSnapshot';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { WorkspaceCanvas } from './Canvas/WorkspaceCanvas';
import { SelectionLayer } from './Canvas/SelectionLayer';
import { CursorsLayer } from './Canvas/CursorsLayer';
import { SnapGuides } from './Canvas/SnapGuides';
import { useUndoRedo, snapshotElement, snapshotElements } from '@/hooks/useUndoRedo';
import type { WorkspaceOpInput } from '@/hooks/useWorkspaceOps';
import { exportWorkspaceAsPng, exportWorkspaceAsPdf } from '@/lib/workspaces/export';
import { useWorkspacePresenter } from '@/hooks/useWorkspacePresenter';
import { PresenterControls } from './Sidebar/PresenterControls';
import { CommentIndicators } from './Comments/CommentIndicators';
import { WorkspaceToolbar } from './Toolbar/WorkspaceToolbar';
import { StyleBar } from './Toolbar/StyleBar';
import { WorkspaceSidebar } from './Sidebar/WorkspaceSidebar';
import { ElementContextMenu, type ElementContextMenuItem } from './ContextMenu/ElementContextMenu';
import { AIEditDialog } from './ContextMenu/AIEditDialog';
import type { Element, WorkspaceOp } from '@/types/workspace';

/** Browser UUID — falls back to a hex token when crypto.randomUUID is missing. */
function newUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export interface WorkspaceRoomProps {
  workspaceId: number;
  /** App user id of the current user. */
  userId: number;
  /** Display name for the local participant (cursors layer label). */
  userName?: string;
  /** True when the current user owns the workspace. */
  isOwner: boolean;
  /** Owner id of the workspace — used by the snapshot hook to pick a leader. */
  ownerId?: number | null;
  /** Currently attached meeting id (or null). Forwarded to the sidebar's
   *  AttachedMeetingPanel. Optional — defaults to null. */
  attachedMeetingId?: number | null;
  /** Called when the user attaches/detaches the workspace from a meeting.
   *  The page-level wrapper should refresh its cached workspace meta. */
  onAttachedMeetingChange?: (newMeetingId: number | null) => void;
  /** LiveKit token + url minted by `POST /api/workspaces/:id/token`. */
  token: string;
  url: string;
  /** Open the invite modal — provided by the page wrapper that owns the modal state. */
  onInvite?: () => void;
}

interface OpListItem {
  id: number;
  userId: number;
  clientOpId: string;
  baseVersion: number;
  op: WorkspaceOp;
  createdAt: string;
}

async function fetchSnapshot(workspaceId: number): Promise<{
  version: number;
  payload: { elements?: Record<string, Element> };
}> {
  const res = await fetch(`/api/workspaces/${workspaceId}/snapshot`);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GET /snapshot failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as { data: { version: number; payload: unknown } };
  return {
    version: json.data.version,
    payload:
      json.data.payload && typeof json.data.payload === 'object'
        ? (json.data.payload as { elements?: Record<string, Element> })
        : { elements: {} },
  };
}

async function fetchOpsSince(
  workspaceId: number,
  since: number
): Promise<{ ops: OpListItem[]; maxId: number }> {
  const res = await fetch(`/api/workspaces/${workspaceId}/ops?since=${since}`);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GET /ops failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as { data: { ops: OpListItem[]; maxId: number } };
  return json.data;
}

export function WorkspaceRoom({
  workspaceId,
  userId,
  userName,
  isOwner,
  ownerId = null,
  attachedMeetingId = null,
  onAttachedMeetingChange,
  token,
  url,
  onInvite,
}: WorkspaceRoomProps) {
  const { room, isConnected, connectionState, error: roomError, disconnectReason } =
    useWorkspaceRoom({
      token,
      url,
      userId,
      userName,
    });
  const router = useRouter();
  const { toast } = useToast();
  const kickedRef = useRef(false);

  const handleAccessLost = useCallback(() => {
    if (kickedRef.current) return;
    kickedRef.current = true;
    toast('warning', 'Вас удалили с этой доски');
    router.push('/workspaces');
  }, [router, toast]);

  const { commitOp: rawCommitOp, flushPending } = useWorkspaceOps({
    workspaceId,
    room,
    userId,
    onAccessLost: handleAccessLost,
  });

  // ==================== Undo/redo ====================
  // The hook calls `rawCommitOp` directly when replaying — its internal flag
  // suppresses the recordLocal call that the wrapper below would otherwise
  // make, so undo entries are not pushed onto the stack as side effects of
  // their own application.
  const { recordLocal, undo, redo, clear: clearHistory, canUndo, canRedo } = useUndoRedo({
    commitOp: rawCommitOp,
  });

  /**
   * commitOp wrapper: snapshots the pre-mutation state of affected elements
   * BEFORE applying the op, then dispatches to the underlying hook, then
   * pushes the inverse onto the undo stack via `recordLocal`.
   *
   * Wire-format ops are still mintable as drafts (we accept WorkspaceOpInput
   * — the undo plumbing just observes the result).
   */
  const commitOp = useCallback(
    (op: WorkspaceOpInput): string => {
      // Capture snapshots BEFORE the op applies.
      let beforeSnapshot: import('@/types/workspace').Element | import('@/types/workspace').Element[] | undefined;
      switch (op.type) {
        case 'add':
          // No snapshot needed — inverse is a delete by id.
          break;
        case 'delete':
          beforeSnapshot = snapshotElements(op.ids);
          break;
        case 'update':
        case 'transform':
        case 'z':
          beforeSnapshot = snapshotElement(op.id);
          break;
      }
      const opId = rawCommitOp(op);
      // Synthesise the on-wire op shape with the freshly-minted opId so the
      // inverse builder has a complete record of what was applied.
      const synth: import('@/types/workspace').WorkspaceOp = (() => {
        switch (op.type) {
          case 'add':
            return { type: 'add', el: op.el, opId, v: 0 };
          case 'update':
            return { type: 'update', id: op.id, patch: op.patch, opId, v: 0 };
          case 'transform':
            return {
              type: 'transform',
              id: op.id,
              ...(op.xy ? { xy: op.xy } : {}),
              ...(op.size ? { size: op.size } : {}),
              ...(op.rot !== undefined ? { rot: op.rot } : {}),
              opId,
              v: 0,
            };
          case 'delete':
            return { type: 'delete', ids: op.ids, opId, v: 0 };
          case 'z':
            return { type: 'z', id: op.id, index: op.index, opId, v: 0 };
        }
      })();
      // Skip transform ops (high-frequency drag events) — only the trailing
      // `update` op carries the resting state we want to invert.
      if (synth.type !== 'transform') {
        recordLocal(synth, { before: beforeSnapshot });
      }
      return opId;
    },
    [rawCommitOp, recordLocal]
  );
  const { broadcastCursor } = useWorkspacePresence({
    room,
    currentUserId: userId,
    currentUserName: userName,
  });

  // ==================== Context menu + AI edit dialog ====================
  //
  // Right-click on an element in `select` mode opens `ElementContextMenu`.
  // "AI: изменить" forwards to `AIEditDialog` which POSTs the edit and
  // resolves a patch we apply via `commitOp({type:'update', ...})`.

  const [ctxMenu, setCtxMenu] = useState<{
    open: boolean;
    x: number;
    y: number;
    element: Element | null;
  }>({ open: false, x: 0, y: 0, element: null });
  const [aiEdit, setAiEdit] = useState<{ open: boolean; element: Element | null }>({
    open: false,
    element: null,
  });

  const openContextMenu = useCallback(
    (element: Element, vx: number, vy: number) => {
      setCtxMenu({ open: true, x: vx, y: vy, element });
    },
    []
  );
  const closeContextMenu = useCallback(() => {
    setCtxMenu((s) => ({ ...s, open: false }));
  }, []);

  const onContextMenuSelect = useCallback(
    (itemId: ElementContextMenuItem['id'], element: Element) => {
      switch (itemId) {
        case 'ai-edit':
          setAiEdit({ open: true, element });
          break;
        case 'duplicate': {
          // Clone with a fresh id, offset by (20, 20) for visibility.
          const clone: Element = {
            ...element,
            id: newUuid(),
            x: element.x + 20,
            y: element.y + 20,
            updatedAt: Date.now(),
            createdBy: userId,
          };
          commitOp({ type: 'add', el: clone });
          break;
        }
        case 'delete':
          commitOp({ type: 'delete', ids: [element.id] });
          break;
        case 'bring-front': {
          const elements = useWorkspaceStore.getState().elements;
          let maxZ = element.z;
          for (const el of Object.values(elements)) {
            if (el.z > maxZ) maxZ = el.z;
          }
          commitOp({ type: 'z', id: element.id, index: maxZ + 1 });
          break;
        }
        case 'send-back': {
          const elements = useWorkspaceStore.getState().elements;
          let minZ = element.z;
          for (const el of Object.values(elements)) {
            if (el.z < minZ) minZ = el.z;
          }
          commitOp({ type: 'z', id: element.id, index: minZ - 1 });
          break;
        }
      }
    },
    [commitOp, userId]
  );

  const onApplyAIPatch = useCallback(
    (patch: Partial<Element>) => {
      const target = aiEdit.element;
      if (!target) return;
      // Always bump updatedAt so peers' LWW reducers accept the change.
      commitOp({
        type: 'update',
        id: target.id,
        patch: { ...patch, updatedAt: Date.now() } as Partial<Element>,
      });
    },
    [aiEdit.element, commitOp]
  );

  // Snapshot autosave (one leader per room — owner if present, else lowest identity).
  useWorkspaceSnapshot({
    workspaceId,
    room,
    userId,
    ownerId,
  });

  const replaceElements = useWorkspaceStore((s) => s.replaceElements);
  const applyOpLocal = useWorkspaceStore((s) => s.applyOpLocal);
  const setSnapshotVersion = useWorkspaceStore((s) => s.setSnapshotVersion);
  const setCurrentVersion = useWorkspaceStore((s) => s.setCurrentVersion);
  const reset = useWorkspaceStore((s) => s.reset);

  const [bootstrapped, setBootstrapped] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const lastConnectStateRef = useRef<ConnectionState>(ConnectionState.Disconnected);
  // Phase 3: snap-to-grid toggle. 0 = off; otherwise snap to grid (world units).
  const [snapGridStep, setSnapGridStep] = useState(0);
  // Phase 3: presenter mode plumbing.
  const presenter = useWorkspacePresenter({ room, currentUserId: userId });
  // Selection observer used by the comments tab to focus on the active element.
  const storeSelection = useWorkspaceStore((s) => s.selection);
  const selectedElementId =
    storeSelection.size === 1 ? storeSelection.values().next().value ?? null : null;

  // ==================== Initial bootstrap ====================
  useEffect(() => {
    let cancelled = false;
    setBootstrapped(false);
    setBootstrapError(null);
    reset();
    clearHistory();
    (async () => {
      try {
        const snap = await fetchSnapshot(workspaceId);
        if (cancelled) return;
        const elements = (snap.payload.elements ?? {}) as Record<string, Element>;
        replaceElements(elements, snap.version, snap.version);
        // Catch-up on ops accumulated since the snapshot.
        const opsResp = await fetchOpsSince(workspaceId, snap.version);
        if (cancelled) return;
        for (const item of opsResp.ops) {
          applyOpLocal(item.op);
        }
        setCurrentVersion(opsResp.maxId);
        setSnapshotVersion(snap.version);
        setBootstrapped(true);
      } catch (err) {
        if (cancelled) return;
        setBootstrapError(err instanceof Error ? err.message : 'Failed to load workspace');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, replaceElements, applyOpLocal, setCurrentVersion, setSnapshotVersion, reset, clearHistory]);

  // ==================== Reconnect catch-up ====================
  useEffect(() => {
    const prev = lastConnectStateRef.current;
    lastConnectStateRef.current = connectionState;
    // Trigger a catch-up only on transitions Connecting/Reconnecting → Connected
    // AFTER the initial bootstrap finished (so we don't double-fetch on first connect).
    if (
      bootstrapped &&
      connectionState === ConnectionState.Connected &&
      prev !== ConnectionState.Connected
    ) {
      const since = useWorkspaceStore.getState().currentVersion;
      void fetchOpsSince(workspaceId, since)
        .then((data) => {
          for (const item of data.ops) {
            applyOpLocal(item.op);
          }
          setCurrentVersion(data.maxId);
        })
        .catch((err) => {
          console.warn('[WorkspaceRoom] reconnect catch-up failed:', err);
        });
    }
  }, [connectionState, bootstrapped, workspaceId, applyOpLocal, setCurrentVersion]);

  // ==================== Drain pending ops on unmount ====================
  useEffect(() => {
    return () => {
      void flushPending();
    };
  }, [flushPending]);

  // ==================== Kick handling ====================
  // When the owner removes us via /participants/[userId] DELETE, the worker
  // also calls LiveKit removeParticipant which causes the SDK to emit
  // Disconnected with reason PARTICIPANT_REMOVED. Bounce to the list page.
  useEffect(() => {
    if (kickedRef.current) return;
    if (disconnectReason === DisconnectReason.PARTICIPANT_REMOVED) {
      kickedRef.current = true;
      toast('warning', 'Вас удалили с этой доски');
      router.push('/workspaces');
    }
  }, [disconnectReason, router, toast]);

  const onCanvasPointerMove = useCallback(
    (normX: number, normY: number) => {
      broadcastCursor(normX, normY);
    },
    [broadcastCursor]
  );

  if (bootstrapError) {
    return (
      <div className="flex h-full w-full items-center justify-center p-6">
        <div className="rounded-card bg-surface px-6 py-4 text-body text-danger">
          {bootstrapError}
        </div>
      </div>
    );
  }

  if (!bootstrapped) {
    return (
      <div className="flex h-full w-full items-center justify-center p-6">
        <div className="rounded-card bg-surface px-6 py-4 text-body">
          Загрузка доски…
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full gap-2">
      {/* Canvas pane */}
      <div className="relative flex-1 rounded-card bg-surface shadow-card overflow-hidden">
        <WorkspaceCanvas
          userId={userId}
          onCommit={commitOp}
          onPointerMove={onCanvasPointerMove}
          workspaceId={workspaceId}
        >
          <SelectionLayer
            onCommit={commitOp}
            onElementContextMenu={openContextMenu}
            gridStep={snapGridStep}
          />
          <SnapGuides />
          <CommentIndicators workspaceId={workspaceId} />
          <CursorsLayer currentUserId={userId} />
        </WorkspaceCanvas>

        {/* Toolbar overlay */}
        <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
          <div className="pointer-events-auto">
            <WorkspaceToolbar
              workspaceId={workspaceId}
              onUndo={undo}
              onRedo={redo}
              canUndo={canUndo}
              canRedo={canRedo}
              snapGridStep={snapGridStep}
              onToggleSnapGrid={setSnapGridStep}
              onExportPng={() => exportWorkspaceAsPng(workspaceId)}
              onExportPdf={() => exportWorkspaceAsPdf(workspaceId)}
              onInsertTable={() => {
                const state = useWorkspaceStore.getState();
                const v = state.viewport;
                const rows = 3;
                const cols = 3;
                const w = 360;
                const h = 120;
                const cx = v.x + (window.innerWidth / 2) / v.zoom;
                const cy = v.y + (window.innerHeight / 2) / v.zoom;
                const cells: string[][] = [];
                for (let r = 0; r < rows; r += 1) {
                  const row: string[] = [];
                  for (let c = 0; c < cols; c += 1) {
                    row.push(r === 0 ? `Колонка ${c + 1}` : '');
                  }
                  cells.push(row);
                }
                commitOp({
                  type: 'add',
                  el: {
                    id: newUuid(),
                    kind: 'table',
                    rows,
                    cols,
                    cells,
                    x: cx - w / 2,
                    y: cy - h / 2,
                    w,
                    h,
                    z: 0,
                    style: {},
                    createdBy: userId,
                    updatedAt: Date.now(),
                  } as Element,
                });
              }}
              onImageReady={(asset) => {
                // Place new images centred in the current viewport.
                const state = useWorkspaceStore.getState();
                const v = state.viewport;
                // Default 320 px wide; preserve aspect ratio when known.
                const defaultW = 320;
                const w = defaultW;
                const ratio =
                  asset.width && asset.height && asset.width > 0
                    ? asset.height / asset.width
                    : 1;
                const h = Math.round(w * ratio);
                const cx = v.x + (window.innerWidth / 2) / v.zoom;
                const cy = v.y + (window.innerHeight / 2) / v.zoom;
                const now = Date.now();
                commitOp({
                  type: 'add',
                  el: {
                    id: newUuid(),
                    kind: 'image',
                    assetId: asset.assetId,
                    x: cx - w / 2,
                    y: cy - h / 2,
                    w,
                    h,
                    z: 0,
                    style: {},
                    createdBy: userId,
                    updatedAt: now,
                  } as Element,
                });
              }}
            />
          </div>
          <div className="pointer-events-auto">
            <StyleBar onCommit={commitOp} />
          </div>
        </div>

        {/* Connection status — quiet pill bottom-left */}
        <div className="pointer-events-none absolute bottom-3 left-3 text-xs text-text-secondary">
          {!isConnected
            ? roomError
              ? `Ошибка соединения: ${roomError.message}`
              : 'Подключение…'
            : null}
        </div>
      </div>

      {/* Sidebar */}
      <div className="hidden md:flex shrink-0">
        <WorkspaceSidebar
          workspaceId={workspaceId}
          isOwner={isOwner}
          currentUserId={userId}
          attachedMeetingId={attachedMeetingId}
          onAttachedMeetingChange={onAttachedMeetingChange}
          onInvite={onInvite}
          selectedElementId={selectedElementId}
          extras={
            <PresenterControls
              workspaceId={workspaceId}
              presenter={presenter}
              currentUserId={userId}
              isOwner={isOwner}
            />
          }
          onApplyCommands={(cmds) => {
            // Each command is a self-contained `add` op (or any other op
            // shape the LLM produced — `commitOp` accepts any
            // `WorkspaceOpInput`). We commit them sequentially so the
            // op log keeps a clean apply order.
            for (const cmd of cmds) commitOp(cmd);
          }}
        />
      </div>

      {/* Right-click context menu (rendered in a portal) */}
      <ElementContextMenu
        open={ctxMenu.open}
        x={ctxMenu.x}
        y={ctxMenu.y}
        element={ctxMenu.element}
        onClose={closeContextMenu}
        onSelect={onContextMenuSelect}
      />

      {/* AI per-element edit dialog */}
      <AIEditDialog
        open={aiEdit.open}
        workspaceId={workspaceId}
        element={aiEdit.element}
        onClose={() => setAiEdit({ open: false, element: null })}
        onApplyPatch={onApplyAIPatch}
      />
    </div>
  );
}
