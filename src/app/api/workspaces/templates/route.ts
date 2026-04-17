import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { WORKSPACE_TEMPLATES } from '@/lib/workspaces/templates';

/**
 * GET /api/workspaces/templates
 *
 * Returns the catalogue of built-in workspace templates (id, title, description).
 * The full snapshot payload is intentionally omitted — clients only need
 * metadata for the picker.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;
  const items = WORKSPACE_TEMPLATES.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
  }));
  return NextResponse.json({ data: { templates: items } });
}
