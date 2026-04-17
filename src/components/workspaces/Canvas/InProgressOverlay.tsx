'use client';

/**
 * In-progress drawing overlay.
 *
 * In Phase 1 the in-progress preview (the rectangle/freehand stroke being
 * drawn before mouseup) is rendered directly on the main canvas by
 * `WorkspaceCanvas` — it keeps the same `drawElements` path as committed
 * elements, so styling stays identical to what gets persisted.
 *
 * This file is a placeholder so the layout from the project plan stays
 * intact. Phase 3 will hoist the preview into a separate top layer when we
 * add multi-select marquee + snapping guides (those benefit from being a
 * layer of their own so they paint above selection handles).
 */

import type { ReactNode } from 'react';

export interface InProgressOverlayProps {
  children?: ReactNode;
}

/** Pass-through wrapper. The canvas handles preview drawing in Phase 1. */
export function InProgressOverlay({ children }: InProgressOverlayProps) {
  return <>{children}</>;
}
