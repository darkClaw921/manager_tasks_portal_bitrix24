import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/guards';
import { chatAboutTasks, getChatHistory, clearChatHistory } from '@/lib/ai/chat';
import { AIError } from '@/lib/ai/client';

/**
 * POST /api/reports/chat
 *
 * AI chat about tasks. Streaming response.
 * Body: { message: string }
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (isAuthError(authResult)) return authResult;
  const { user } = authResult;

  let message: string;
  try {
    const body = await request.json();
    message = body.message;
  } catch {
    return NextResponse.json(
      { error: 'invalid_body', message: 'Невалидный JSON' },
      { status: 400 }
    );
  }

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return NextResponse.json(
      { error: 'missing_message', message: 'Сообщение не может быть пустым' },
      { status: 400 }
    );
  }

  if (message.length > 5000) {
    return NextResponse.json(
      { error: 'message_too_long', message: 'Максимальная длина сообщения: 5000 символов' },
      { status: 400 }
    );
  }

  try {
    const stream = chatAboutTasks(user.userId, message.trim());

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof AIError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.code === 'missing_api_key' ? 503 : 500 }
      );
    }

    console.error('[api/reports/chat] Error:', error);
    return NextResponse.json(
      { error: 'chat_failed', message: 'Ошибка при обработке сообщения' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/reports/chat
 *
 * Get chat history.
 * Query params:
 * - limit (default: 50, max: 100)
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (isAuthError(authResult)) return authResult;
  const { user } = authResult;

  const limit = Math.min(
    100,
    Math.max(1, parseInt(request.nextUrl.searchParams.get('limit') || '50', 10))
  );

  try {
    const messages = getChatHistory(user.userId, limit);
    return NextResponse.json({ data: messages });
  } catch (error) {
    console.error('[api/reports/chat] Error fetching history:', error);
    return NextResponse.json(
      { error: 'fetch_failed', message: 'Ошибка при загрузке истории чата' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/reports/chat
 *
 * Clear chat history for current user.
 */
export async function DELETE(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (isAuthError(authResult)) return authResult;
  const { user } = authResult;

  try {
    clearChatHistory(user.userId);
    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error('[api/reports/chat] Error clearing history:', error);
    return NextResponse.json(
      { error: 'clear_failed', message: 'Ошибка при очистке истории чата' },
      { status: 500 }
    );
  }
}
