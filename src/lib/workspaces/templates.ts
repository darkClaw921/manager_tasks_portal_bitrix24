/**
 * Built-in workspace templates.
 *
 * Each template is a pre-baked snapshot payload (`{ elements: { [id]: Element } }`)
 * the client uses to seed a fresh workspace. Templates live in code (not the
 * DB) so deploys ship them atomically.
 *
 * To add a new template:
 *   1. Append to `WORKSPACE_TEMPLATES` with a stable `id`.
 *   2. The `elements` map should use deterministic ids (we re-mint to fresh
 *      UUIDs at apply time inside `applyTemplate` so multiple uses of the
 *      same template don't collide).
 */

import { randomUUID } from 'node:crypto';
import type { Element, WorkspaceSnapshot } from '@/types/workspace';

export interface WorkspaceTemplate {
  id: string;
  title: string;
  /** Localized description shown in the picker. */
  description: string;
  /** Elements to seed the new workspace with. Ids are remapped on apply. */
  snapshot: WorkspaceSnapshot;
}

const NOW = 0; // updated_at gets bumped on apply

function rect(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  z: number,
  fill: string,
  stroke = '#1f2937'
): Element {
  return {
    id,
    kind: 'rect',
    x,
    y,
    w,
    h,
    z,
    style: { stroke, fill, strokeWidth: 2, opacity: 1 },
    createdBy: 0,
    updatedAt: NOW,
  };
}

function text(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  z: number,
  content: string,
  fontSize = 18
): Element {
  return {
    id,
    kind: 'text',
    x,
    y,
    w,
    h,
    z,
    style: { stroke: '#1f2937', fill: 'transparent', strokeWidth: 0, opacity: 1 },
    createdBy: 0,
    updatedAt: NOW,
    content,
    fontSize,
  };
}

function sticky(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  z: number,
  content: string,
  color: string
): Element {
  return {
    id,
    kind: 'sticky',
    x,
    y,
    w,
    h,
    z,
    style: { stroke: '#1f2937', fill: color, strokeWidth: 1, opacity: 1 },
    createdBy: 0,
    updatedAt: NOW,
    content,
    color,
  };
}

// ==================== Built-in templates ====================

const KANBAN: WorkspaceTemplate = {
  id: 'kanban',
  title: 'Канбан-доска',
  description: 'Три колонки: «To Do», «In Progress», «Done» с примерами стикеров.',
  snapshot: {
    elements: (() => {
      const out: Record<string, Element> = {};
      const colTitles = ['To Do', 'In Progress', 'Done'];
      const colColors = ['#fee2e2', '#fef3c7', '#dcfce7'];
      const colWidth = 280;
      const gap = 32;
      const startX = 0;
      for (let i = 0; i < 3; i += 1) {
        const x = startX + i * (colWidth + gap);
        const colId = `col-${i}`;
        out[colId] = rect(colId, x, 0, colWidth, 600, 1, colColors[i]);
        const titleId = `title-${i}`;
        out[titleId] = text(titleId, x + 16, 12, colWidth - 32, 30, 2, colTitles[i], 22);
        // Two example stickers per column
        for (let j = 0; j < 2; j += 1) {
          const cardId = `card-${i}-${j}`;
          out[cardId] = sticky(
            cardId,
            x + 16,
            64 + j * 100,
            colWidth - 32,
            80,
            3,
            i === 0 && j === 0 ? 'Пример задачи' : '',
            '#fef9c3'
          );
        }
      }
      return out;
    })(),
  },
};

const RETRO: WorkspaceTemplate = {
  id: 'retro',
  title: 'Ретроспектива',
  description: 'Четыре зоны: «Что хорошо», «Что плохо», «Идеи», «План действий».',
  snapshot: {
    elements: (() => {
      const out: Record<string, Element> = {};
      const titles = ['Что хорошо', 'Что плохо', 'Идеи', 'План действий'];
      const colors = ['#dcfce7', '#fee2e2', '#dbeafe', '#fef9c3'];
      const cellW = 320;
      const cellH = 280;
      const gap = 24;
      for (let i = 0; i < 4; i += 1) {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = col * (cellW + gap);
        const y = row * (cellH + gap);
        const id = `cell-${i}`;
        out[id] = rect(id, x, y, cellW, cellH, 1, colors[i]);
        const titleId = `title-${i}`;
        out[titleId] = text(titleId, x + 16, y + 12, cellW - 32, 28, 2, titles[i], 20);
      }
      return out;
    })(),
  },
};

const MIND_MAP: WorkspaceTemplate = {
  id: 'mind-map',
  title: 'Мыслекарта',
  description: 'Центральный узел и три ветви для развития идеи.',
  snapshot: {
    elements: (() => {
      const out: Record<string, Element> = {};
      out['center'] = {
        id: 'center',
        kind: 'ellipse',
        x: 200,
        y: 200,
        w: 200,
        h: 80,
        z: 1,
        style: { stroke: '#1f2937', fill: '#dbeafe', strokeWidth: 2, opacity: 1 },
        createdBy: 0,
        updatedAt: NOW,
      };
      out['center-text'] = text('center-text', 220, 220, 160, 40, 2, 'Главная идея', 18);
      const branches = [
        { x: 500, y: 50, label: 'Ветвь 1' },
        { x: 500, y: 250, label: 'Ветвь 2' },
        { x: 500, y: 450, label: 'Ветвь 3' },
      ];
      branches.forEach((b, i) => {
        const id = `branch-${i}`;
        out[id] = rect(id, b.x, b.y, 200, 80, 1, '#fef3c7');
        out[`${id}-text`] = text(`${id}-text`, b.x + 20, b.y + 24, 160, 32, 2, b.label, 16);
        out[`${id}-arrow`] = {
          id: `${id}-arrow`,
          kind: 'arrow',
          x: 400,
          y: 240,
          w: 100,
          h: b.y + 40 - 240,
          z: 1,
          style: { stroke: '#1f2937', fill: 'transparent', strokeWidth: 2, opacity: 1 },
          createdBy: 0,
          updatedAt: NOW,
        };
      });
      return out;
    })(),
  },
};

export const WORKSPACE_TEMPLATES: ReadonlyArray<WorkspaceTemplate> = [KANBAN, RETRO, MIND_MAP];

export function getTemplate(id: string): WorkspaceTemplate | null {
  return WORKSPACE_TEMPLATES.find((t) => t.id === id) ?? null;
}

/**
 * Apply a template by remapping element ids to fresh UUIDs and bumping
 * `updatedAt`. Sets `createdBy` to the supplied user id.
 *
 * Returns a fresh snapshot payload ready to be persisted via `saveSnapshot`.
 */
export function instantiateTemplate(
  template: WorkspaceTemplate,
  ownerId: number
): WorkspaceSnapshot {
  const idMap = new Map<string, string>();
  const out: Record<string, Element> = {};
  const now = Date.now();
  for (const oldId of Object.keys(template.snapshot.elements)) {
    idMap.set(oldId, randomUUID());
  }
  for (const [oldId, el] of Object.entries(template.snapshot.elements)) {
    const newId = idMap.get(oldId)!;
    out[newId] = {
      ...el,
      id: newId,
      createdBy: ownerId,
      updatedAt: now,
    } as Element;
  }
  return { elements: out };
}
