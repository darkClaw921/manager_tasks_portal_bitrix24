'use client';

/**
 * Floating toolbar for the drawing overlay.
 *
 * Bound to `meetingStore.tools` for color/width state and to `useDrawingSync`
 * for the action verbs (undo, clear). The toolbar deliberately does NOT
 * track the per-stroke "last drawn by me" id locally; instead it lifts that
 * concern into a `lastOwnStrokeId` prop. Owners of the toolbar are typically
 * the same components that render `DrawingOverlay`, and they can derive the
 * "last own stroke" from `meetingStore.annotations` filtered by `userId`
 * without us having to re-implement that bookkeeping.
 *
 * Visual: pill-shaped bar with a swatches row + width slider + actions.
 * Compact enough to overlay the screen-share without obscuring much.
 */

import { useMemo } from 'react';
import type { Room } from 'livekit-client';
import { useMeetingStore } from '@/stores/meetingStore';
import { useDrawingSync } from '@/hooks/useDrawingSync';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

export interface DrawingToolbarProps {
  /** Live LiveKit room — used to publish undo/clear events. */
  room: Room | null;
  /** App user id of the local participant. */
  userId: number;
  /** When true, the drawing overlay is accepting input. */
  enabled: boolean;
  /** Toggle drawing on/off. */
  onToggleEnabled: () => void;
  className?: string;
}

/**
 * Curated palette. Limited to a small set so the bar stays compact and
 * users don't waste cycles picking a hex code. Colors chosen for legibility
 * over both light and dark backgrounds (presenters share dashboards, IDEs,
 * presentations — anything goes).
 */
const COLOR_SWATCHES = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // amber
  '#22c55e', // green
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ffffff', // white (for dark surfaces)
];

const MIN_WIDTH = 1;
const MAX_WIDTH = 10;

export function DrawingToolbar({
  room,
  userId,
  enabled,
  onToggleEnabled,
  className,
}: DrawingToolbarProps) {
  const tools = useMeetingStore((s) => s.tools);
  const setTool = useMeetingStore((s) => s.setTool);
  const annotations = useMeetingStore((s) => s.annotations);
  const { publishUndo, publishClear } = useDrawingSync({ room, userId });

  // Derive the most recent stroke authored by the local user. Used to make
  // Undo a no-op when there is nothing of ours to undo.
  const lastOwnStrokeId = useMemo<string | null>(() => {
    for (let i = annotations.length - 1; i >= 0; i -= 1) {
      if (annotations[i].userId === userId) return annotations[i].id;
    }
    return null;
  }, [annotations, userId]);

  const handleUndo = () => {
    if (!lastOwnStrokeId) return;
    void publishUndo(lastOwnStrokeId);
  };

  const handleClear = () => {
    if (annotations.length === 0) return;
    // eslint-disable-next-line no-alert
    const ok = window.confirm('Очистить все пометки на демонстрации?');
    if (!ok) return;
    void publishClear();
  };

  return (
    <div
      className={cn(
        'pointer-events-auto inline-flex items-center gap-3 rounded-full bg-black/70 px-3 py-2 text-white shadow-card backdrop-blur-sm',
        className
      )}
      data-meeting-surface="drawing-toolbar"
    >
      {/* Enable / disable drawing */}
      <button
        type="button"
        onClick={onToggleEnabled}
        className={cn(
          'rounded-full px-3 py-1 text-small transition-colors',
          enabled
            ? 'bg-white text-black'
            : 'bg-white/10 text-white hover:bg-white/20'
        )}
        aria-pressed={enabled}
        title={enabled ? 'Выключить рисование' : 'Включить рисование'}
      >
        {enabled ? 'Рисую' : 'Рисовать'}
      </button>

      {/* Color swatches */}
      <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Цвет">
        {COLOR_SWATCHES.map((color) => {
          const selected = tools.color.toLowerCase() === color.toLowerCase();
          return (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`Цвет ${color}`}
              onClick={() => setTool({ color })}
              className={cn(
                'h-6 w-6 rounded-full border-2 transition-transform',
                selected
                  ? 'scale-110 border-white'
                  : 'border-white/30 hover:border-white/70'
              )}
              style={{ backgroundColor: color }}
            />
          );
        })}
      </div>

      {/* Width slider */}
      <label className="flex items-center gap-2 text-small">
        <span className="text-white/70">Толщина</span>
        <input
          type="range"
          min={MIN_WIDTH}
          max={MAX_WIDTH}
          step={1}
          value={tools.width}
          onChange={(e) => setTool({ width: parseInt(e.target.value, 10) })}
          className="h-1 w-24 cursor-pointer accent-white"
          aria-label="Толщина линии"
        />
        <span className="w-5 text-right tabular-nums text-white/70">
          {tools.width}
        </span>
      </label>

      {/* Actions */}
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleUndo}
          disabled={!lastOwnStrokeId}
          aria-label="Отменить последний штрих"
        >
          Undo
        </Button>
        <Button
          type="button"
          variant="danger"
          size="sm"
          onClick={handleClear}
          disabled={annotations.length === 0}
          aria-label="Очистить все пометки"
        >
          Очистить
        </Button>
      </div>
    </div>
  );
}
