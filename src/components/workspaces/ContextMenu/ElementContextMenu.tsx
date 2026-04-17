'use client';

/**
 * Element-level context menu (right-click on a selected element).
 *
 * Renders a small floating list at the cursor position with five items:
 *   - "AI: изменить"      — opens AIEditDialog for the active element
 *   - "Дублировать"       — clones via add op
 *   - "Удалить"           — deletes via delete op
 *   - "На передний план"  — bumps z to (max + 1)
 *   - "На задний план"    — drops z to (min - 1)
 *
 * The component is fully controlled — open state, position and the
 * active element are passed in. We use a portal so the menu is not
 * clipped by the canvas overflow. Click-outside / Escape close.
 *
 * The menu deliberately does NOT carry domain logic itself: it calls
 * back to the host via callbacks. This keeps the menu reusable from
 * elsewhere (e.g. the future toolbar "actions" button) and lets unit
 * tests poke individual handlers.
 */

import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { Element } from '@/types/workspace';

export interface ElementContextMenuItem {
  id:
    | 'ai-edit'
    | 'duplicate'
    | 'delete'
    | 'bring-front'
    | 'send-back';
  label: string;
  /** Optional disabled flag (e.g. AI item when no API key). */
  disabled?: boolean;
}

const DEFAULT_ITEMS: ElementContextMenuItem[] = [
  { id: 'ai-edit', label: 'AI: изменить' },
  { id: 'duplicate', label: 'Дублировать' },
  { id: 'delete', label: 'Удалить' },
  { id: 'bring-front', label: 'На передний план' },
  { id: 'send-back', label: 'На задний план' },
];

export interface ElementContextMenuProps {
  /** Whether the menu is currently visible. */
  open: boolean;
  /** Anchor point in viewport coordinates (clientX/clientY). */
  x: number;
  y: number;
  /** Element this menu is acting on. */
  element: Element | null;
  /** Override the item list (e.g. drop "AI: изменить" when AI is off). */
  items?: ElementContextMenuItem[];
  /** Close request (click outside, Escape, item selected). */
  onClose: () => void;
  /** Item activation. Caller decides what each item does. */
  onSelect: (itemId: ElementContextMenuItem['id'], element: Element) => void;
}

const MENU_WIDTH = 200;
const MENU_PADDING = 8;

export function ElementContextMenu({
  open,
  x,
  y,
  element,
  items = DEFAULT_ITEMS,
  onClose,
  onSelect,
}: ElementContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Click-outside + Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const node = menuRef.current;
      if (!node) return;
      if (!node.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  const handleSelect = useCallback(
    (itemId: ElementContextMenuItem['id']) => {
      if (!element) return;
      onSelect(itemId, element);
      onClose();
    },
    [element, onSelect, onClose]
  );

  if (!open || !element || typeof document === 'undefined') return null;

  // Clamp position so the menu does not spill past the viewport edge.
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const left = Math.min(x, vw - MENU_WIDTH - MENU_PADDING);
  // Estimate height ≈ 36 px per item plus padding; clamps below.
  const estHeight = items.length * 36 + 16;
  const top = Math.min(y, vh - estHeight - MENU_PADDING);

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="Действия с элементом"
      style={{
        position: 'fixed',
        left,
        top,
        width: MENU_WIDTH,
        zIndex: 9999,
      }}
      className="rounded-card bg-surface border border-border shadow-card py-1"
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item) => (
        <button
          type="button"
          key={item.id}
          role="menuitem"
          disabled={item.disabled}
          onClick={() => handleSelect(item.id)}
          className="w-full text-left px-3 py-2 text-small text-foreground hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body
  );
}
