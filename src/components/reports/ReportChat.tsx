'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';

// ==================== Types ====================

interface ChatMessage {
  id: number | string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  isStreaming?: boolean;
}

// ==================== Icons ====================

function SendIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
    </svg>
  );
}

function ChatBotIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
  );
}

// ==================== Message Bubble ====================

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}>
      {/* Avatar */}
      <div
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
          isUser
            ? 'bg-primary text-text-inverse'
            : 'bg-primary-light text-primary'
        )}
      >
        {isUser ? <UserIcon /> : <ChatBotIcon />}
      </div>

      {/* Content */}
      <div
        className={cn(
          'max-w-[80%] rounded-card px-4 py-3',
          isUser
            ? 'bg-primary text-text-inverse'
            : 'bg-background border border-border text-foreground'
        )}
      >
        {isUser ? (
          <p className="text-body whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className={cn(
            'prose prose-sm max-w-none',
            'prose-p:text-body prose-p:leading-relaxed prose-p:my-1',
            'prose-li:text-body prose-li:my-0.5',
            'prose-headings:text-body prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1',
            'prose-strong:font-semibold',
            'prose-ul:my-1 prose-ol:my-1',
            'prose-code:text-xs prose-code:bg-border/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded'
          )}>
            <ReactMarkdown>{message.content}</ReactMarkdown>
            {message.isStreaming && (
              <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-0.5" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== Suggestion Chips ====================

const SUGGESTIONS = [
  'Какие задачи просрочены?',
  'Что нужно сделать сегодня?',
  'Расставь приоритеты на неделю',
  'Какие задачи я завершил недавно?',
];

function SuggestionChips({ onSelect }: { onSelect: (text: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {SUGGESTIONS.map((suggestion) => (
        <button
          key={suggestion}
          onClick={() => onSelect(suggestion)}
          className="px-3 py-1.5 text-small text-primary bg-primary-light rounded-badge hover:bg-primary/20 transition-colors"
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}

// ==================== Main Component ====================

export function ReportChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isHistoryLoaded, setIsHistoryLoaded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when messages change
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Load chat history on mount
  useEffect(() => {
    async function loadHistory() {
      try {
        const response = await fetch('/api/reports/chat?limit=50');
        if (response.ok) {
          const result = await response.json();
          if (result.data && result.data.length > 0) {
            setMessages(result.data);
          }
        }
      } catch (error) {
        console.error('[chat] Failed to load history:', error);
      } finally {
        setIsHistoryLoaded(true);
      }
    }

    loadHistory();
  }, []);

  // Send message with streaming
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text.trim(),
      createdAt: new Date().toISOString(),
    };

    const assistantMessage: ChatMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/reports/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim() }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Ошибка при отправке' }));
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessage.id
              ? { ...m, content: `*Ошибка: ${error.message}*`, isStreaming: false }
              : m
          )
        );
        return;
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;

        // Update streaming message
        const currentText = fullText;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessage.id
              ? { ...m, content: currentText }
              : m
          )
        );
      }

      // Mark as done streaming
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessage.id
            ? { ...m, isStreaming: false }
            : m
        )
      );
    } catch (error) {
      console.error('[chat] Error:', error);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessage.id
            ? { ...m, content: '*Произошла ошибка при получении ответа*', isStreaming: false }
            : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  // Clear chat history
  const clearChat = useCallback(async () => {
    try {
      await fetch('/api/reports/chat', { method: 'DELETE' });
      setMessages([]);
    } catch (error) {
      console.error('[chat] Failed to clear history:', error);
    }
  }, []);

  // Handle form submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  // Handle Ctrl+Enter / Enter
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // Auto-resize
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  };

  return (
    <div className="rounded-card bg-surface border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary-light flex items-center justify-center text-primary">
            <ChatBotIcon />
          </div>
          <div>
            <h3 className="text-h3 font-semibold text-foreground">AI Ассистент</h3>
            <p className="text-xs text-text-muted">
              Задайте вопрос о ваших задачах
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className="p-2 text-text-muted hover:text-danger hover:bg-danger-light rounded-input transition-colors"
            title="Очистить историю"
          >
            <TrashIcon />
          </button>
        )}
      </div>

      {/* Messages area */}
      <div className="h-[400px] overflow-y-auto px-6 py-4 space-y-4">
        {!isHistoryLoaded ? (
          // Loading skeleton
          <div className="space-y-4 animate-pulse">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className={cn('flex gap-3', i % 2 === 0 ? 'flex-row' : 'flex-row-reverse')}>
                <div className="w-8 h-8 rounded-full bg-border shrink-0" />
                <div className={cn('rounded-card p-3', i % 2 === 0 ? 'bg-background' : 'bg-primary/10', 'max-w-[60%]')}>
                  <div className="h-3 bg-border rounded w-full mb-2" />
                  <div className="h-3 bg-border rounded w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          // Empty state with suggestions
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-full bg-primary-light flex items-center justify-center mb-4">
              <ChatBotIcon />
            </div>
            <h4 className="text-h3 font-semibold text-foreground mb-2">
              Чем могу помочь?
            </h4>
            <p className="text-small text-text-secondary mb-6 max-w-sm">
              Я могу проанализировать ваши задачи, помочь с приоритетами и ответить на вопросы о прогрессе.
            </p>
            <SuggestionChips onSelect={sendMessage} />
          </div>
        ) : (
          // Message list
          messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <form
        onSubmit={handleSubmit}
        className="flex items-end gap-2 px-6 py-4 border-t border-border bg-background/50"
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Спросите о задачах..."
          rows={1}
          disabled={isLoading}
          className="flex-1 resize-none px-4 py-2.5 rounded-input border border-border bg-surface text-body text-foreground placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-60"
          style={{ minHeight: '42px', maxHeight: '120px' }}
        />
        <Button
          type="submit"
          disabled={!input.trim() || isLoading}
          loading={isLoading}
          className="shrink-0"
        >
          <SendIcon />
        </Button>
      </form>
    </div>
  );
}
