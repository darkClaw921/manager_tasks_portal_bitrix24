'use client';

/**
 * Device picker modal for the meeting room.
 *
 * Lets the local participant choose the active microphone, camera, and —
 * when the browser exposes it — the audio output (speaker). Internally
 * delegates to LiveKit's `Room.getLocalDevices(kind)` (static enumerator
 * that triggers a getUserMedia prompt when labels are blank) and
 * `room.switchActiveDevice(kind, deviceId)`.
 *
 * Active device ids come from `room.getActiveDevice(kind)` and are refreshed
 * on `RoomEvent.ActiveDeviceChanged`.
 */

import { useCallback, useEffect, useState } from 'react';
import { Room, RoomEvent } from 'livekit-client';
import { Button } from '@/components/ui/Button';

interface DeviceSettingsModalProps {
  room: Room | null;
  open: boolean;
  onClose: () => void;
}

function CloseIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}

interface DeviceState {
  items: MediaDeviceInfo[];
  active: string;
}

const EMPTY_STATE: DeviceState = { items: [], active: '' };

async function loadDevices(
  room: Room,
  kind: MediaDeviceKind
): Promise<DeviceState> {
  let items: MediaDeviceInfo[] = [];
  try {
    items = await Room.getLocalDevices(kind);
  } catch (err) {
    console.warn('[DeviceSettingsModal] getLocalDevices failed:', kind, err);
    items = [];
  }
  let active = '';
  try {
    active = room.getActiveDevice(kind) ?? '';
  } catch {
    active = '';
  }
  return { items, active };
}

export function DeviceSettingsModal({ room, open, onClose }: DeviceSettingsModalProps) {
  const [mic, setMic] = useState<DeviceState>(EMPTY_STATE);
  const [cam, setCam] = useState<DeviceState>(EMPTY_STATE);
  const [speaker, setSpeaker] = useState<DeviceState>(EMPTY_STATE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!room) return;
    setLoading(true);
    setError(null);
    try {
      const [m, c, s] = await Promise.all([
        loadDevices(room, 'audioinput'),
        loadDevices(room, 'videoinput'),
        loadDevices(room, 'audiooutput'),
      ]);
      setMic(m);
      setCam(c);
      setSpeaker(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось получить список устройств');
    } finally {
      setLoading(false);
    }
  }, [room]);

  useEffect(() => {
    if (!open || !room) return;
    void refresh();
  }, [open, room, refresh]);

  useEffect(() => {
    if (!room) return;
    const onActiveChanged = (kind: MediaDeviceKind, deviceId: string) => {
      if (kind === 'audioinput') setMic((s) => ({ ...s, active: deviceId }));
      else if (kind === 'videoinput') setCam((s) => ({ ...s, active: deviceId }));
      else if (kind === 'audiooutput') setSpeaker((s) => ({ ...s, active: deviceId }));
    };
    const onDevicesChanged = () => {
      void refresh();
    };
    room.on(RoomEvent.ActiveDeviceChanged, onActiveChanged);
    room.on(RoomEvent.MediaDevicesChanged, onDevicesChanged);
    return () => {
      room.off(RoomEvent.ActiveDeviceChanged, onActiveChanged);
      room.off(RoomEvent.MediaDevicesChanged, onDevicesChanged);
    };
  }, [room, refresh]);

  const switchDevice = useCallback(
    async (kind: MediaDeviceKind, deviceId: string) => {
      if (!room) return;
      try {
        await room.switchActiveDevice(kind, deviceId);
      } catch (err) {
        console.error('[DeviceSettingsModal] switchActiveDevice failed:', kind, err);
        setError(err instanceof Error ? err.message : 'Не удалось переключить устройство');
      }
    },
    [room]
  );

  if (!open) return null;

  const renderSelect = (
    label: string,
    state: DeviceState,
    kind: MediaDeviceKind
  ) => {
    const hasItems = state.items.length > 0;
    return (
      <label className="flex flex-col gap-1">
        <span className="text-small text-text-secondary">{label}</span>
        <select
          className="rounded-input border border-border bg-background px-3 py-2 text-body text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
          value={state.active}
          onChange={(e) => void switchDevice(kind, e.target.value)}
          disabled={!hasItems || loading}
        >
          {!hasItems && <option value="">Нет доступных устройств</option>}
          {state.items.map((d, idx) => (
            <option key={d.deviceId || `idx-${idx}`} value={d.deviceId}>
              {d.label || `${label} ${idx + 1}`}
            </option>
          ))}
        </select>
      </label>
    );
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="fixed inset-x-4 top-20 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-md bg-surface rounded-modal shadow-xl z-50 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-h3 font-semibold text-foreground">Настройки устройств</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-text-secondary hover:text-foreground transition-colors rounded-input hover:bg-background"
            aria-label="Закрыть"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {error && (
            <div className="rounded-input border border-danger bg-red-50 px-3 py-2 text-small text-danger">
              {error}
            </div>
          )}
          {renderSelect('Микрофон', mic, 'audioinput')}
          {renderSelect('Камера', cam, 'videoinput')}
          {renderSelect('Динамик', speaker, 'audiooutput')}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-border">
          <Button type="button" variant="ghost" size="sm" onClick={() => void refresh()} disabled={loading}>
            {loading ? 'Обновление…' : 'Обновить'}
          </Button>
          <Button type="button" variant="primary" size="sm" onClick={onClose}>
            Готово
          </Button>
        </div>
      </div>
    </>
  );
}
