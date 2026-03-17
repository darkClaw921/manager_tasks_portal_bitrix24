import { db } from '@/lib/db';
import { taskComments, portals } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { createBitrix24Client } from './client';
import { getValidToken } from './token-manager';
import type { BitrixComment } from '@/types';

/**
 * Get the portal domain for constructing absolute URLs.
 */
function getPortalDomain(portalId: number): string {
  const portal = db
    .select({ domain: portals.domain })
    .from(portals)
    .where(eq(portals.id, portalId))
    .get();
  return portal?.domain || '';
}

/**
 * Make a download URL absolute by prepending portal domain if needed.
 */
function makeAbsoluteUrl(url: string | null, domain: string): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (domain) {
    const cleanDomain = domain.replace(/\/$/, '');
    const prefix = cleanDomain.startsWith('http') ? cleanDomain : `https://${cleanDomain}`;
    return `${prefix}${url.startsWith('/') ? '' : '/'}${url}`;
  }
  return url;
}

/**
 * Convert a key to UPPER_SNAKE_CASE.
 */
function toUpperSnakeCase(str: string): string {
  if (/^[A-Z0-9_]+$/.test(str)) return str;
  return str.replace(/([A-Z])/g, '_$1').toUpperCase();
}

/**
 * Normalize keys to UPPER_SNAKE_CASE (Bitrix24 may return camelCase or UPPER_SNAKE_CASE).
 */
function normalizeKeys(obj: Record<string, unknown>): BitrixComment {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    normalized[toUpperSnakeCase(key)] = value;
  }
  return normalized as unknown as BitrixComment;
}

/**
 * Map a Bitrix24 comment to local DB fields.
 */
export function mapBitrixCommentToLocal(
  raw: BitrixComment,
  taskId: number,
  portalDomain: string = ''
) {
  const comment = normalizeKeys(raw as unknown as Record<string, unknown>);

  // Extract attached files from ATTACHED_OBJECTS (old API or normalized chat files)
  let attachedFiles: string | null = null;
  const rawObj = raw as unknown as Record<string, unknown>;
  const attached = rawObj.ATTACHED_OBJECTS || rawObj.attachedObjects
    || (comment as unknown as Record<string, unknown>).ATTACHED_OBJECTS;
  if (attached && typeof attached === 'object') {
    const entries = Object.entries(attached as Record<string, Record<string, unknown>>);
    if (entries.length > 0) {
      const files = entries
        .map(([key, f]) => {
          // Try all known ID field names, fallback to the object key itself
          const fileId = Number(f.FILE_ID || f.ID || f.ATTACHMENT_ID || f.OBJECT_ID
            || f.fileId || f.id || f.attachmentId || f.objectId || key || 0);
          const name = String(f.NAME || f.name || f.FILE_NAME || f.fileName || 'file');
          const size = Number(f.SIZE || f.size || 0) || null;
          const rawUrl = String(f.DOWNLOAD_URL || f.downloadUrl || f.VIEW_URL || f.viewUrl || '');
          const downloadUrl = makeAbsoluteUrl(rawUrl || null, portalDomain);
          const contentType = String(f.CONTENT_TYPE || f.contentType || f.TYPE || f.type || '') || null;

          return { id: isNaN(fileId) ? Number(key) || 0 : fileId, name, size, downloadUrl, contentType };
        })
        .filter(f => f.name !== 'file' || f.downloadUrl); // keep if has name or URL
      if (files.length > 0) {
        attachedFiles = JSON.stringify(files);
      }
    }
  }

  return {
    taskId,
    bitrixCommentId: parseInt(String(comment.ID), 10),
    authorId: comment.AUTHOR_ID || null,
    authorName: comment.AUTHOR_NAME || null,
    authorPhoto: comment.AUTHOR_PHOTO || null,
    postMessage: comment.POST_MESSAGE || null,
    postDate: comment.POST_DATE || null,
    attachedFiles,
  };
}

/**
 * Get the chat ID for a task from Bitrix24.
 * New Bitrix24 task cards use chats instead of old-style comments.
 * The chat ID is retrieved via tasks.task.get with the /api/ prefix.
 */
async function getTaskChatId(
  portalId: number,
  bitrixTaskId: number
): Promise<number | null> {
  const portal = db
    .select({ clientEndpoint: portals.clientEndpoint })
    .from(portals)
    .where(eq(portals.id, portalId))
    .get();

  if (!portal) return null;

  const accessToken = await getValidToken(portalId);

  // New Bitrix24 API requires /api/ prefix in URL for chat fields
  // clientEndpoint is like "https://domain.bitrix24.ru/rest/"
  // We need "https://domain.bitrix24.ru/rest/api/tasks.task.get"
  const url = `${portal.clientEndpoint}api/tasks.task.get`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        id: bitrixTaskId,
        select: ['id', 'chat.id'],
        auth: accessToken,
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.log(`[comments] New API (chat.id) error for task ${bitrixTaskId}: ${data.error} - ${data.error_description || ''}`);
      return null;
    }

    // Response: { result: { item: { id, chat: { id, entityId, entityType } } } }
    const chatId = data.result?.item?.chat?.id;
    if (chatId) {
      return Number(chatId);
    }

    // Fallback: try old field name
    const taskData = data.result?.task || data.result?.item;
    if (taskData) {
      const id = taskData.chat?.id || taskData.CHAT_ID || taskData.chatId;
      if (id) return Number(id);
    }

    return null;
  } catch (error) {
    console.log(`[comments] Failed to get chat ID for task ${bitrixTaskId}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Chat message from im.dialog.messages.get response.
 */
interface ChatMessage {
  id: number;
  chat_id: number;
  author_id: number;
  date: string;
  text?: string;
  text_legacy?: string;
  params?: {
    FILE_ID?: number[];
    [key: string]: unknown;
  };
  system?: string;
}

/**
 * Chat file from im.dialog.messages.get response `files` map.
 */
interface ChatFile {
  id: number;
  name: string;
  size: number;
  urlDownload?: string;
  type?: string;
  extension?: string;
}

/**
 * Fetch comments from task chat via im.dialog.messages.get.
 * Returns messages mapped to BitrixComment format.
 */
async function fetchChatMessages(
  portalId: number,
  chatId: number,
  bitrixTaskId: number
): Promise<BitrixComment[]> {
  const client = createBitrix24Client(portalId);
  const dialogId = `chat${chatId}`;
  const allMessages: BitrixComment[] = [];
  let firstId = 0;

  try {
    // Paginate through all messages (max 50 per request)
    while (true) {
      const response = await client.call<Record<string, unknown>>('im.dialog.messages.get', {
        DIALOG_ID: dialogId,
        FIRST_ID: firstId,
        LIMIT: 50,
      });

      const result = response.result;

      // Log response structure
      if (firstId === 0) {
        console.log(`[comments] Chat ${chatId} response keys:`, result ? Object.keys(result) : 'null');
        if (result?.files || result?.Files) {
          const fMap = result.files || result.Files;
          console.log(`[comments] Chat ${chatId} files map keys:`, Object.keys(fMap as object).slice(0, 10));
          const firstFile = Object.values(fMap as object)[0];
          if (firstFile) {
            console.log(`[comments] Chat ${chatId} first file keys:`, Object.keys(firstFile as object));
            console.log(`[comments] Chat ${chatId} first file:`, JSON.stringify(firstFile).substring(0, 300));
          }
        }
      }

      // Extract messages array from response
      const messages = (result?.messages || result?.Messages || []) as ChatMessage[];
      // Extract users map for author names and photos
      const users = (result?.users || result?.Users || {}) as Record<string, { name?: string; first_name?: string; last_name?: string; avatar?: string; }>;
      // Extract files and build lookup by file ID
      // Bitrix24 returns files as array-like object { '0': {...}, '1': {...} }, not keyed by file ID
      const rawFiles = (result?.files || result?.Files || {}) as Record<string, ChatFile>;
      const filesMap: Record<string, ChatFile> = {};
      for (const f of Object.values(rawFiles)) {
        if (f && f.id) {
          filesMap[String(f.id)] = f;
        }
      }

      if (!messages || messages.length === 0) break;

      for (const msg of messages) {
        // Skip system messages (task created, status changes, etc.)
        if (msg.system === 'Y' || msg.system === '1') continue;

        const text = msg.text || msg.text_legacy || '';
        const rawMsg = msg as unknown as Record<string, unknown>;
        const fileIds = Array.isArray(msg.params?.FILE_ID) ? msg.params.FILE_ID : [];
        const hasFiles = fileIds.length > 0;

        // Log every non-system message with its raw params
        console.log(`[comments] Chat msg id=${msg.id}, system=${msg.system}, text="${(text).substring(0, 60)}", params keys=${rawMsg.params ? Object.keys(rawMsg.params as object).join(',') : 'none'}, FILE_ID=${JSON.stringify(fileIds)}`);

        // Skip messages with no text AND no files
        if (!text.trim() && !hasFiles) continue;

        // Resolve author name and photo from users map
        let authorName: string | null = null;
        let authorPhoto: string | undefined = undefined;
        const authorId = String(msg.author_id);
        const user = users[authorId];
        if (user) {
          authorName = user.name || [user.first_name, user.last_name].filter(Boolean).join(' ') || null;
          if (user.avatar && typeof user.avatar === 'string' && user.avatar.startsWith('http')) {
            authorPhoto = user.avatar;
          }
        }

        // Resolve file attachments from files map
        let attachedObjects: BitrixComment['ATTACHED_OBJECTS'] = undefined;
        if (hasFiles) {
          attachedObjects = {};
          for (const fileId of fileIds) {
            const f = filesMap[String(fileId)];
            if (f) {
              attachedObjects[String(fileId)] = {
                NAME: f.name,
                FILE_ID: f.id,
                SIZE: f.size,
                DOWNLOAD_URL: f.urlDownload || '',
                CONTENT_TYPE: f.type || '',
              };
            }
          }
          if (Object.keys(attachedObjects).length === 0) {
            attachedObjects = undefined;
          }
        }

        allMessages.push({
          ID: String(msg.id),
          AUTHOR_ID: authorId,
          AUTHOR_NAME: authorName || `User ${authorId}`,
          AUTHOR_PHOTO: authorPhoto,
          POST_MESSAGE: text,
          POST_DATE: msg.date || '',
          ATTACHED_OBJECTS: attachedObjects,
        });
      }

      // Check if there are more messages
      if (messages.length < 50) break;

      // Move cursor to load next batch (messages newer than last ID)
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && lastMsg.id) {
        firstId = lastMsg.id;
      } else {
        break;
      }
    }

    return allMessages;
  } catch (error) {
    console.error(
      `[comments] Failed to fetch chat messages for task ${bitrixTaskId} (chat ${chatId}):`,
      error instanceof Error ? error.message : error
    );
    return [];
  }
}

/**
 * Fetch comments for a task from Bitrix24.
 *
 * Strategy:
 * 1. Try chat API first (im.dialog.messages.get) — file messages live here (FILE_ID in params + files map)
 * 2. Fallback to old task.commentitem.getlist if chat API fails or returns empty
 */
export async function fetchComments(
  portalId: number,
  bitrixTaskId: number
): Promise<BitrixComment[]> {
  try {
    // Strategy 1: Chat API — file messages are only available here
    const chatId = await getTaskChatId(portalId, bitrixTaskId);
    console.log(`[comments] Task ${bitrixTaskId}: chatId=${chatId}`);

    if (chatId) {
      const messages = await fetchChatMessages(portalId, chatId, bitrixTaskId);
      console.log(`[comments] Task ${bitrixTaskId}: chat returned ${messages.length} messages`);
      if (messages.length > 0) {
        for (const msg of messages) {
          const raw = msg as unknown as Record<string, unknown>;
          const hasAttach = !!(raw.ATTACHED_OBJECTS || raw.attachedObjects);
          const textPreview = (msg.POST_MESSAGE || '').substring(0, 60);
          console.log(`[comments]   msg ID=${msg.ID}, text="${textPreview}", hasAttach=${hasAttach}`);
        }
        return messages;
      }
    }

    // Strategy 2: Old API fallback
    console.log(`[comments] Task ${bitrixTaskId}: falling back to task.commentitem.getlist`);
    const client = createBitrix24Client(portalId);
    const response = await client.call<unknown>('task.commentitem.getlist', {
      TASKID: bitrixTaskId,
      ORDER: { POST_DATE: 'asc' },
    });

    const result = response.result;
    let comments: BitrixComment[];
    if (result && !Array.isArray(result) && typeof result === 'object') {
      comments = Object.values(result) as BitrixComment[];
    } else {
      comments = (result as BitrixComment[]) || [];
    }

    console.log(`[comments] Task ${bitrixTaskId}: old API returned ${comments.length} comments`);
    if (comments.length > 0) {
      return comments;
    }

    return [];
  } catch (error) {
    console.error(
      `[comments] Failed to fetch comments for task ${bitrixTaskId}, portal ${portalId}:`,
      error instanceof Error ? error.message : error
    );
    return [];
  }
}

/**
 * Sync comments for a task: fetch from Bitrix24 and upsert into local DB.
 */
export async function syncComments(
  portalId: number,
  bitrixTaskId: number,
  localTaskId: number
): Promise<void> {
  const comments = await fetchComments(portalId, bitrixTaskId);
  const domain = getPortalDomain(portalId);

  // Debug: log first comment with ATTACHED_OBJECTS to see field structure
  const withAttach = comments.find(c => c.ATTACHED_OBJECTS || (c as unknown as Record<string, unknown>).attachedObjects || (c as unknown as Record<string, unknown>).ATTACHED_OBJECTS);
  if (withAttach) {
    const raw = withAttach as unknown as Record<string, unknown>;
    console.log(`[comments] Task ${bitrixTaskId} comment with attachments, keys:`, Object.keys(raw));
    const attached = raw.ATTACHED_OBJECTS || raw.attachedObjects;
    if (attached && typeof attached === 'object') {
      const firstEntry = Object.entries(attached as Record<string, unknown>)[0];
      if (firstEntry) {
        console.log(`[comments] Attachment entry key="${firstEntry[0]}", value keys:`,
          typeof firstEntry[1] === 'object' && firstEntry[1] ? Object.keys(firstEntry[1]) : firstEntry[1]);
      }
    }
  }

  console.log(`[comments] Syncing ${comments.length} comments for task ${bitrixTaskId} (local ${localTaskId})`);

  const now = new Date().toISOString();

  for (const comment of comments) {
    const mapped = mapBitrixCommentToLocal(comment, localTaskId, domain);

    const existing = db
      .select({ id: taskComments.id })
      .from(taskComments)
      .where(
        and(
          eq(taskComments.taskId, localTaskId),
          eq(taskComments.bitrixCommentId, mapped.bitrixCommentId)
        )
      )
      .get();

    if (existing) {
      // Update existing comment
      db.update(taskComments)
        .set({
          authorName: mapped.authorName,
          authorPhoto: mapped.authorPhoto,
          postMessage: mapped.postMessage,
          postDate: mapped.postDate,
          attachedFiles: mapped.attachedFiles,
        })
        .where(eq(taskComments.id, existing.id))
        .run();
    } else {
      // Insert new comment
      db.insert(taskComments)
        .values({ ...mapped, createdAt: now })
        .run();
    }
  }
}

/**
 * Add a comment to a task on Bitrix24.
 * Uses task.commentitem.add (still works in new task cards).
 * Returns the new comment ID from Bitrix24.
 */
export async function addComment(
  portalId: number,
  bitrixTaskId: number,
  message: string
): Promise<number> {
  const client = createBitrix24Client(portalId);

  const response = await client.call<number>('task.commentitem.add', {
    TASKID: bitrixTaskId,
    FIELDS: {
      POST_MESSAGE: message,
    },
  });

  return response.result;
}
