import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { portals } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/** Supported Bitrix24 webhook event types */
const SUPPORTED_EVENTS = [
  'ONTASKADD',
  'ONTASKUPDATE',
  'ONTASKDELETE',
  'ONTASKCOMMENTADD',
  'ONTASKCOMMENTUPDATE',
] as const;

type SupportedEvent = typeof SUPPORTED_EVENTS[number];

function isSupportedEvent(event: string): event is SupportedEvent {
  return SUPPORTED_EVENTS.includes(event as SupportedEvent);
}

/**
 * Parse the incoming webhook body.
 * Bitrix24 may send data as application/x-www-form-urlencoded or application/json.
 */
async function parseWebhookBody(request: NextRequest): Promise<Record<string, unknown>> {
  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return request.json();
  }

  // application/x-www-form-urlencoded (most common from Bitrix24)
  const text = await request.text();
  const params = new URLSearchParams(text);
  const result: Record<string, unknown> = {};

  // Bitrix24 sends nested data as flat keys like data[FIELDS_AFTER][ID]
  for (const [key, value] of params.entries()) {
    // Parse nested keys: auth[member_id] -> { auth: { member_id: ... } }
    const parts = key.match(/^([^[]+)(?:\[([^\]]*)\])*$/);
    if (parts) {
      const matches = key.match(/\[([^\]]*)\]/g);
      if (matches) {
        const topKey = key.substring(0, key.indexOf('['));
        let current = result as Record<string, unknown>;
        if (!current[topKey] || typeof current[topKey] !== 'object') {
          current[topKey] = {};
        }
        current = current[topKey] as Record<string, unknown>;

        const nestedKeys = matches.map(m => m.slice(1, -1));
        for (let i = 0; i < nestedKeys.length - 1; i++) {
          const nk = nestedKeys[i];
          if (!current[nk] || typeof current[nk] !== 'object') {
            current[nk] = {};
          }
          current = current[nk] as Record<string, unknown>;
        }
        current[nestedKeys[nestedKeys.length - 1]] = value;
      } else {
        result[key] = value;
      }
    }
  }

  return result;
}

/**
 * Find a portal by member_id and verify the application_token.
 * Returns the portal or null if not found / token mismatch.
 *
 * Note: Does not return userId — webhook handlers resolve recipients
 * themselves via resolveNotificationRecipients (multi-user model).
 */
function findAndVerifyPortal(
  memberId: string,
  applicationToken: string
): { id: number; domain: string } | null {
  // Find all portals matching this member_id (should be one portal per memberId)
  const matchingPortals = db
    .select({
      id: portals.id,
      domain: portals.domain,
      appToken: portals.appToken,
      isActive: portals.isActive,
    })
    .from(portals)
    .where(eq(portals.memberId, memberId))
    .all();

  if (matchingPortals.length === 0) {
    return null;
  }

  // Find the first active portal with matching app_token
  for (const portal of matchingPortals) {
    if (portal.isActive && portal.appToken === applicationToken) {
      return { id: portal.id, domain: portal.domain };
    }
  }

  // If no token match found, try portal without token check (app_token may not be saved yet)
  // This is a fallback - in production, app_token should always be verified
  for (const portal of matchingPortals) {
    if (portal.isActive && !portal.appToken) {
      return { id: portal.id, domain: portal.domain };
    }
  }

  return null;
}

/**
 * Process the webhook event asynchronously.
 * This runs in the background after we've returned 200 to Bitrix24.
 */
async function processEvent(
  event: SupportedEvent,
  data: Record<string, unknown>,
  portal: { id: number; domain: string }
): Promise<void> {
  // Dynamically import handlers to avoid circular dependencies
  const { handleWebhookEvent } = await import('@/lib/bitrix/webhook-handlers');

  await handleWebhookEvent(event, data, portal);
}

/**
 * POST /api/webhooks/bitrix
 *
 * Receives webhook events from Bitrix24.
 * Verifies the application_token and routes to the appropriate handler.
 * Returns 200 OK immediately to acknowledge receipt.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await parseWebhookBody(request);

    const event = String(body.event || '').toUpperCase();
    const data = (body.data || {}) as Record<string, unknown>;
    const auth = (body.auth || {}) as Record<string, unknown>;
    const ts = String(body.ts || '');

    console.log(`[webhook] Received event: ${event}, ts: ${ts}, member_id: ${auth.member_id || 'unknown'}`);

    // Validate event type
    if (!event || !isSupportedEvent(event)) {
      console.log(`[webhook] Unsupported event type: ${event}`);
      // Still return 200 to prevent Bitrix24 from retrying
      return NextResponse.json({ status: 'ok', message: 'Event type not supported' });
    }

    // Extract auth fields
    const memberId = String(auth.member_id || '');
    const applicationToken = String(auth.application_token || '');

    if (!memberId) {
      console.error('[webhook] Missing member_id in auth data');
      return NextResponse.json(
        { error: 'Bad Request', message: 'Missing member_id' },
        { status: 400 }
      );
    }

    // Find and verify portal
    const portal = findAndVerifyPortal(memberId, applicationToken);

    if (!portal) {
      // Check if it's a token mismatch vs unknown portal
      const anyPortal = db
        .select({ id: portals.id })
        .from(portals)
        .where(eq(portals.memberId, memberId))
        .get();

      if (anyPortal) {
        console.error(`[webhook] Invalid application_token for member_id: ${memberId}`);
        return NextResponse.json(
          { error: 'Forbidden', message: 'Invalid application_token' },
          { status: 403 }
        );
      }

      console.error(`[webhook] Unknown member_id: ${memberId}`);
      return NextResponse.json(
        { error: 'Not Found', message: 'Unknown portal' },
        { status: 404 }
      );
    }

    console.log(`[webhook] Event ${event} for portal ${portal.id} (${portal.domain})`);

    // Process the event asynchronously (fire and forget)
    // We return 200 immediately so Bitrix24 doesn't retry
    processEvent(event, data, portal).catch((error) => {
      console.error(
        `[webhook] Error processing event ${event} for portal ${portal.id}:`,
        error instanceof Error ? error.message : String(error)
      );
    });

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('[webhook] Error handling webhook:', error instanceof Error ? error.message : String(error));
    // Return 200 even on error to prevent Bitrix24 from retrying
    return NextResponse.json({ status: 'ok', message: 'Error processing webhook' });
  }
}
