import { createBitrix24Client } from './client';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

/** Events we subscribe to for task tracking */
const TASK_EVENTS = [
  'ONTASKADD',
  'ONTASKUPDATE',
  'ONTASKDELETE',
  'ONTASKCOMMENTADD',
] as const;

/**
 * Register event handlers on a Bitrix24 portal.
 * Calls event.bind for each task event.
 * Errors are caught and logged but do not block the connection flow.
 *
 * @param portalId - The local portal ID
 * @returns app_token from the event registration (if available)
 */
export async function registerEventHandlers(portalId: number): Promise<string | null> {
  const client = createBitrix24Client(portalId);
  const handlerUrl = `${APP_URL}/api/webhooks/bitrix`;

  console.log(`[events] Registering handlers for portal ${portalId}, handler URL: ${handlerUrl}`);

  let appToken: string | null = null;

  // Use batch to register all events in a single request
  try {
    const commands: Record<string, { method: string; params: Record<string, unknown> }> = {};

    for (const event of TASK_EVENTS) {
      commands[`bind_${event}`] = {
        method: 'event.bind',
        params: {
          event,
          handler: handlerUrl,
          // event_type defaults to 'online' = POST to handler URL
        },
      };
    }

    const batchResult = await client.callBatch(commands);

    console.log(`[events] Registered ${TASK_EVENTS.length} event handlers for portal ${portalId}`);

    // Try to extract app_token from the first successful result
    // The app_token is typically available from the auth context of the response
    if (batchResult && typeof batchResult === 'object') {
      // app_token may be returned in batch results
      for (const key of Object.keys(batchResult)) {
        const result = batchResult[key] as Record<string, unknown> | undefined;
        if (result && typeof result === 'object' && 'application_token' in result) {
          appToken = String(result.application_token);
          break;
        }
      }
    }

    return appToken;
  } catch (error) {
    console.error(`[events] Failed to register event handlers for portal ${portalId}:`, error);

    // Fall back to individual calls if batch fails
    try {
      for (const event of TASK_EVENTS) {
        try {
          await client.call('event.bind', {
            event,
            handler: handlerUrl,
            // event_type defaults to 'online' = POST to handler URL
          });
        } catch (innerError) {
          console.error(`[events] Failed to bind ${event} for portal ${portalId}:`, innerError);
        }
      }
      console.log(`[events] Registered event handlers individually for portal ${portalId}`);
    } catch (fallbackError) {
      console.error(`[events] Individual registration also failed for portal ${portalId}:`, fallbackError);
    }

    return null;
  }
}

/**
 * Unregister event handlers from a Bitrix24 portal.
 * Calls event.unbind for each task event.
 * Errors are caught and logged but do not block the disconnection flow.
 *
 * @param portalId - The local portal ID
 */
/**
 * List currently registered event handlers on a Bitrix24 portal.
 */
export async function listEventHandlers(portalId: number): Promise<unknown[]> {
  const client = createBitrix24Client(portalId);
  try {
    const response = await client.call<unknown[]>('event.get');
    return response.result || [];
  } catch (error) {
    console.error(`[events] Failed to list events for portal ${portalId}:`, error);
    return [];
  }
}

export async function unregisterEventHandlers(portalId: number): Promise<void> {
  const client = createBitrix24Client(portalId);
  const handlerUrl = `${APP_URL}/api/webhooks/bitrix`;

  try {
    const commands: Record<string, { method: string; params: Record<string, unknown> }> = {};

    for (const event of TASK_EVENTS) {
      commands[`unbind_${event}`] = {
        method: 'event.unbind',
        params: {
          event,
          handler: handlerUrl,
        },
      };
    }

    await client.callBatch(commands);
    console.log(`[events] Unregistered ${TASK_EVENTS.length} event handlers for portal ${portalId}`);
  } catch (error) {
    console.error(`[events] Failed to unregister event handlers for portal ${portalId}:`, error);

    // Fall back to individual calls
    for (const event of TASK_EVENTS) {
      try {
        await client.call('event.unbind', {
          event,
          handler: handlerUrl,
        });
      } catch (innerError) {
        console.error(`[events] Failed to unbind ${event} for portal ${portalId}:`, innerError);
      }
    }
  }
}
