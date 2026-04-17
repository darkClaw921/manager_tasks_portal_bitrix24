'use client';

/**
 * Floating style editor for the currently-selected element.
 *
 * - Renders nothing when there's no single selection.
 * - Shows a colour palette for stroke + fill, sliders for strokeWidth and
 *   opacity, and a font-size input (for text/sticky elements).
 * - On change, dispatches an `update` op via the supplied `onCommit` so the
 *   workspace store, peers, and the server all stay in sync.
 */

import { useCallback, useMemo, type CSSProperties } from 'react';
import { useSelectedElement } from '@/stores/workspaceStore';
import type { Element, ElementStyle } from '@/types/workspace';
import type { WorkspaceOpDraft } from '../Canvas/WorkspaceCanvas';
import { cn } from '@/lib/utils';

const COLORS = [
  '#1f2937',
  '#ef4444',
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#6b7280',
  '#ffffff',
];

const FILLS = ['transparent', ...COLORS];

export interface StyleBarProps {
  onCommit: (op: WorkspaceOpDraft) => void;
  className?: string;
  style?: CSSProperties;
}

export function StyleBar({ onCommit, className, style }: StyleBarProps) {
  const selected = useSelectedElement();

  const dispatch = useCallback(
    (patch: Partial<Element>) => {
      if (!selected) return;
      onCommit({
        type: 'update',
        id: selected.id,
        patch: { ...patch, updatedAt: Date.now() } as Partial<Element>,
      });
    },
    [onCommit, selected]
  );

  const setStyle = useCallback(
    (next: Partial<ElementStyle>) => {
      if (!selected) return;
      const merged: ElementStyle = { ...selected.style, ...next };
      dispatch({ style: merged } as Partial<Element>);
    },
    [dispatch, selected]
  );

  const isText = selected?.kind === 'text';
  const isSticky = selected?.kind === 'sticky';
  const supportsFill = useMemo(
    () => selected?.kind === 'rect' || selected?.kind === 'ellipse',
    [selected]
  );

  if (!selected) return null;

  return (
    <div
      className={cn(
        'inline-flex flex-wrap items-center gap-3 rounded-card bg-surface border border-border px-3 py-2 shadow-card',
        className
      )}
      style={style}
    >
      {/* Stroke / text colour */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-text-secondary mr-1">Цвет</span>
        {COLORS.map((c) => (
          <button
            key={`stroke-${c}`}
            type="button"
            aria-label={`stroke ${c}`}
            onClick={() => setStyle({ stroke: c })}
            className={cn(
              'h-5 w-5 rounded-full border',
              selected.style.stroke === c ? 'ring-2 ring-primary ring-offset-1' : 'border-border'
            )}
            style={{ background: c }}
          />
        ))}
      </div>

      {/* Fill (only for closed shapes) */}
      {supportsFill && (
        <div className="flex items-center gap-1">
          <span className="text-xs text-text-secondary mr-1">Заливка</span>
          {FILLS.map((c) => (
            <button
              key={`fill-${c}`}
              type="button"
              aria-label={`fill ${c}`}
              onClick={() => setStyle({ fill: c })}
              className={cn(
                'h-5 w-5 rounded border',
                selected.style.fill === c ? 'ring-2 ring-primary ring-offset-1' : 'border-border',
                c === 'transparent' && 'bg-transparent relative'
              )}
              style={
                c === 'transparent'
                  ? {
                      backgroundImage:
                        'linear-gradient(45deg, #ddd 25%, transparent 25%), linear-gradient(-45deg, #ddd 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ddd 75%), linear-gradient(-45deg, transparent 75%, #ddd 75%)',
                      backgroundSize: '6px 6px',
                      backgroundPosition: '0 0, 0 3px, 3px -3px, -3px 0',
                    }
                  : { background: c }
              }
            />
          ))}
        </div>
      )}

      {/* Stroke width */}
      <label className="flex items-center gap-2 text-xs text-text-secondary">
        Толщина
        <input
          type="range"
          min={1}
          max={10}
          step={1}
          value={selected.style.strokeWidth ?? 2}
          onChange={(e) => setStyle({ strokeWidth: Number(e.target.value) })}
          className="w-24"
        />
      </label>

      {/* Opacity */}
      <label className="flex items-center gap-2 text-xs text-text-secondary">
        Прозрачн.
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={Math.round((selected.style.opacity ?? 1) * 100)}
          onChange={(e) => setStyle({ opacity: Number(e.target.value) / 100 })}
          className="w-20"
        />
      </label>

      {/* Font size */}
      {isText && (
        <label className="flex items-center gap-2 text-xs text-text-secondary">
          Размер
          <input
            type="number"
            min={8}
            max={96}
            step={1}
            value={selected.fontSize}
            onChange={(e) => dispatch({ fontSize: Number(e.target.value) } as Partial<Element>)}
            className="w-14 rounded-input border border-border bg-background px-2 py-1 text-foreground"
          />
        </label>
      )}

      {/* Sticky colour */}
      {isSticky && (
        <div className="flex items-center gap-1">
          <span className="text-xs text-text-secondary mr-1">Фон</span>
          {['#fef08a', '#fecaca', '#bbf7d0', '#bfdbfe', '#e9d5ff'].map((c) => (
            <button
              key={`sticky-${c}`}
              type="button"
              aria-label={`sticky ${c}`}
              onClick={() => dispatch({ color: c } as Partial<Element>)}
              className={cn(
                'h-5 w-5 rounded border border-border',
                selected.color === c ? 'ring-2 ring-primary ring-offset-1' : ''
              )}
              style={{ background: c }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
