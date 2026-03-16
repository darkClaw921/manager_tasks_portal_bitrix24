import { db } from '@/lib/db';
import { tasks, portals, aiChatMessages } from '@/lib/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { streamCompletion, isAIAvailable, AIError } from './client';

// ==================== Types ====================

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

// ==================== System Prompt ====================

function buildChatSystemPrompt(taskContext: string): string {
  return `Ты TaskHub AI ассистент - помощник по управлению задачами из Bitrix24.
У тебя есть доступ к данным задач пользователя. Отвечай на вопросы о задачах, помогай с планированием и приоритизацией.

Правила:
- Отвечай на русском языке
- Будь конкретным - указывай названия задач, порталы, даты
- Используй markdown для форматирования
- Если задачи нет в данных - честно скажи об этом
- Помогай с приоритизацией и управлением временем

Текущие задачи пользователя:
${taskContext}`;
}

// ==================== Task Context ====================

/**
 * Build task context string for the AI system prompt.
 * Includes up to 200 most relevant tasks.
 */
function getTaskContext(userId: number): string {
  // Get user's active portals
  const userPortals = db
    .select({ id: portals.id, name: portals.name, domain: portals.domain })
    .from(portals)
    .where(and(eq(portals.userId, userId), eq(portals.isActive, true)))
    .all();

  if (userPortals.length === 0) {
    return 'У пользователя нет подключённых порталов.';
  }

  const portalIds = userPortals.map((p) => p.id);
  const portalMap = new Map(userPortals.map((p) => [p.id, p]));

  // Get active and recent tasks (prioritize non-completed, then by changed_date)
  const userTasks = db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      deadline: tasks.deadline,
      portalId: tasks.portalId,
      responsibleName: tasks.responsibleName,
      createdDate: tasks.createdDate,
      changedDate: tasks.changedDate,
      closedDate: tasks.closedDate,
    })
    .from(tasks)
    .where(sql`${tasks.portalId} IN (${sql.raw(portalIds.join(','))}) AND ${tasks.excludeFromAi} = 0`)
    .orderBy(
      sql`CASE WHEN ${tasks.status} IN ('COMPLETED', 'DEFERRED') THEN 1 ELSE 0 END`,
      desc(tasks.changedDate)
    )
    .limit(200)
    .all();

  if (userTasks.length === 0) {
    return 'У пользователя пока нет задач. Порталы подключены, но задачи не синхронизированы.';
  }

  const now = new Date().toISOString();
  const lines = userTasks.map((t) => {
    const portal = portalMap.get(t.portalId);
    const isOverdue =
      t.deadline && t.deadline < now && t.status !== 'COMPLETED' && t.status !== 'DEFERRED';
    const deadline = t.deadline ? t.deadline.split('T')[0] : 'без дедлайна';
    const overdueMark = isOverdue ? ' [ПРОСРОЧЕНА]' : '';
    const responsible = t.responsibleName ? ` (${t.responsibleName})` : '';

    return `- [${t.status}] "${t.title}"${responsible} | ${portal?.name || 'Unknown'} | Priority: ${t.priority} | Deadline: ${deadline}${overdueMark}`;
  });

  return lines.join('\n');
}

// ==================== Chat Functions ====================

/**
 * Process a chat message: stream AI response, save both messages to DB.
 *
 * Returns a ReadableStream<Uint8Array> suitable for a streaming HTTP response.
 */
export function chatAboutTasks(
  userId: number,
  message: string
): ReadableStream<Uint8Array> {
  if (!isAIAvailable()) {
    throw new AIError(
      'AI функции недоступны. Настройте OPENROUTER_API_KEY.',
      'missing_api_key'
    );
  }

  // Save user message to DB
  db.insert(aiChatMessages)
    .values({
      userId,
      role: 'user',
      content: message,
      createdAt: new Date().toISOString(),
    })
    .run();

  // Get task context
  const taskContext = getTaskContext(userId);

  // Get recent chat history (last 20 messages)
  const history = db
    .select({
      role: aiChatMessages.role,
      content: aiChatMessages.content,
    })
    .from(aiChatMessages)
    .where(eq(aiChatMessages.userId, userId))
    .orderBy(desc(aiChatMessages.createdAt))
    .limit(20)
    .all()
    .reverse() // Oldest first
    .slice(0, -1) // Exclude the message we just saved (it will be the userMessage param)
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

  // Build system prompt with task context
  const systemPrompt = buildChatSystemPrompt(taskContext);

  // Get AI stream
  const aiStream = streamCompletion(systemPrompt, message, history, {
    maxTokens: 2048,
    temperature: 0.5,
  });

  // Wrap into a byte stream that also saves the response to DB when complete
  const encoder = new TextEncoder();
  let fullResponse = '';

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = aiStream.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          fullResponse += value;
          controller.enqueue(encoder.encode(value));
        }

        // Save assistant message to DB
        if (fullResponse.trim()) {
          db.insert(aiChatMessages)
            .values({
              userId,
              role: 'assistant',
              content: fullResponse,
              createdAt: new Date().toISOString(),
            })
            .run();
        }

        controller.close();
      } catch (error) {
        console.error('[chat] Stream error:', error);
        // Still try to save partial response
        if (fullResponse.trim()) {
          try {
            db.insert(aiChatMessages)
              .values({
                userId,
                role: 'assistant',
                content: fullResponse + '\n\n*[Ответ прерван из-за ошибки]*',
                createdAt: new Date().toISOString(),
              })
              .run();
          } catch {
            // Ignore save error
          }
        }
        controller.error(error);
      }
    },
  });
}

/**
 * Get chat history for a user.
 */
export function getChatHistory(
  userId: number,
  limit: number = 50
): ChatMessage[] {
  const messages = db
    .select()
    .from(aiChatMessages)
    .where(eq(aiChatMessages.userId, userId))
    .orderBy(desc(aiChatMessages.createdAt))
    .limit(limit)
    .all()
    .reverse(); // Oldest first

  return messages.map((m) => ({
    id: m.id,
    role: m.role as 'user' | 'assistant',
    content: m.content,
    createdAt: m.createdAt,
  }));
}

/**
 * Clear chat history for a user.
 */
export function clearChatHistory(userId: number): void {
  db.delete(aiChatMessages)
    .where(eq(aiChatMessages.userId, userId))
    .run();
}
