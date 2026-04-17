'use client';

/**
 * Inline table-cell editor overlay.
 *
 * On double-click of a `table` element the SelectionLayer toggles this
 * component on. It positions an HTML `<table contenteditable>` exactly
 * over the canvas-rendered table (using `worldToScreen` from
 * `WorkspaceCanvas`) so the user can edit cells with native browser
 * caret + Tab / Shift-Tab navigation.
 *
 * Commit semantics:
 *   - On blur of any cell we collect the entire 2D text matrix and emit
 *     a single `update` op via `onCommit`.
 *   - Escape cancels (no commit).
 *   - Click outside the overlay closes the editor (and commits any
 *     pending edits as part of the blur cycle).
 *
 * We intentionally re-render the whole grid as HTML rather than trying
 * to overlay just the focused cell — small N (max 50×20 = 1000 cells in
 * the schema) and HTML tables handle column sizing and Tab navigation
 * for us.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import type { TableElement } from '@/types/workspace';
import type { ViewportState } from '@/stores/workspaceStore';
import { worldToScreen } from './WorkspaceCanvas';

export interface TableEditorProps {
  element: TableElement;
  viewport: ViewportState;
  /** Commit the new cells matrix. Called on first blur with edited content. */
  onCommit: (cells: string[][]) => void;
  /** Cancel without committing (Escape). */
  onCancel: () => void;
}

export function TableEditor({ element, viewport, onCommit, onCancel }: TableEditorProps) {
  const tl = useMemo(
    () => worldToScreen({ x: element.x, y: element.y }, viewport),
    [element.x, element.y, viewport]
  );
  const w = element.w * viewport.zoom;
  const h = element.h * viewport.zoom;

  const rows = Math.max(1, element.rows);
  const cols = Math.max(1, element.cols);

  // Local mutable copy — the original element shape is immutable.
  const [draft, setDraft] = useState<string[][]>(() => {
    const out: string[][] = [];
    for (let r = 0; r < rows; r += 1) {
      const row: string[] = [];
      for (let c = 0; c < cols; c += 1) {
        const v = element.cells?.[r]?.[c];
        row.push(typeof v === 'string' ? v : '');
      }
      out.push(row);
    }
    return out;
  });

  const draftRef = useRef(draft);
  draftRef.current = draft;
  const committedRef = useRef(false);

  const commit = useCallback(() => {
    if (committedRef.current) return;
    committedRef.current = true;
    onCommit(draftRef.current);
  }, [onCommit]);

  // Click outside closes (commits via blur first).
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const node = wrapperRef.current;
      if (!node) return;
      if (!node.contains(e.target as Node)) commit();
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => window.removeEventListener('pointerdown', onPointerDown, true);
  }, [commit]);

  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const onCellInput = useCallback((r: number, c: number, value: string) => {
    setDraft((prev) => {
      const next = prev.slice();
      const row = next[r].slice();
      row[c] = value;
      next[r] = row;
      return next;
    });
  }, []);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        committedRef.current = true; // suppress commit on subsequent blur
        onCancel();
      }
      // Tab / Shift+Tab navigation is the browser default for sequential inputs.
    },
    [onCancel]
  );

  const cellH = h / rows;
  const cellW = w / cols;
  const fontPx = Math.max(11, Math.min(14, Math.floor(cellH * 0.5)));

  return (
    <div
      ref={wrapperRef}
      style={{
        position: 'absolute',
        left: tl.x,
        top: tl.y,
        width: w,
        height: h,
        zIndex: 50,
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <table
        style={{
          width: '100%',
          height: '100%',
          tableLayout: 'fixed',
          borderCollapse: 'collapse',
          background: 'white',
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
        }}
      >
        <tbody>
          {draft.map((row, r) => (
            <tr key={r}>
              {row.map((value, c) => (
                <td
                  key={c}
                  style={{
                    border: '1px solid #d1d5db',
                    padding: 0,
                    width: cellW,
                    height: cellH,
                    verticalAlign: 'middle',
                    background: r === 0 ? '#f9fafb' : '#fff',
                  }}
                >
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => onCellInput(r, c, e.target.value)}
                    onBlur={commit}
                    onKeyDown={onKeyDown}
                    style={{
                      width: '100%',
                      height: '100%',
                      padding: '0 6px',
                      border: 'none',
                      outline: 'none',
                      background: 'transparent',
                      font: `${r === 0 ? '600 ' : ''}${fontPx}px ui-sans-serif, system-ui, sans-serif`,
                      color: '#1f2937',
                      boxSizing: 'border-box',
                    }}
                    autoFocus={r === 0 && c === 0}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
