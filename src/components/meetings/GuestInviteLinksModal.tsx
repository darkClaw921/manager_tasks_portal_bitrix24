'use client';

/**
 * Host-only modal managing guest invite links for a meeting.
 *
 * Lists currently active guest links (fetched from
 * `GET /api/meetings/[id]/invite-links`), lets the host mint a new link
 * (`POST`) or revoke one (`DELETE ?token=…`). Copy-to-clipboard writes
 * the URL so the host can paste it into any chat/email; no account is
 * required on the receiving end.
 */

import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import {
  useMeetingInviteLinks,
  useCreateInviteLink,
  useRevokeInviteLink,
} from '@/hooks/useMeeting';

interface GuestInviteLinksModalProps {
  meetingId: number;
  open: boolean;
  onClose: () => void;
}

function CloseIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy path
  }
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'absolute';
    el.style.left = '-9999px';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

export function GuestInviteLinksModal({ meetingId, open, onClose }: GuestInviteLinksModalProps) {
  const { data: links, isLoading, isError, error } = useMeetingInviteLinks(meetingId, open);
  const create = useCreateInviteLink(meetingId);
  const revoke = useRevokeInviteLink(meetingId);
  const { toast } = useToast();
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const handleCreate = useCallback(async () => {
    try {
      const link = await create.mutateAsync();
      const ok = await copyToClipboard(link.url);
      if (ok) {
        setCopiedToken(link.token);
        toast('success', 'Ссылка создана и скопирована');
      } else {
        toast('success', 'Ссылка создана');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось создать ссылку';
      toast('error', message);
    }
  }, [create, toast]);

  const handleCopy = useCallback(
    async (link: { url: string; token: string }) => {
      const ok = await copyToClipboard(link.url);
      if (ok) {
        setCopiedToken(link.token);
        toast('success', 'Скопировано');
      } else {
        toast('error', 'Не удалось скопировать');
      }
    },
    [toast]
  );

  const handleRevoke = useCallback(
    async (token: string) => {
      try {
        await revoke.mutateAsync(token);
        toast('success', 'Ссылка отозвана');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Не удалось отозвать';
        toast('error', message);
      }
    },
    [revoke, toast]
  );

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="fixed inset-x-4 top-20 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-lg bg-surface rounded-modal shadow-xl z-50 flex flex-col overflow-hidden max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-h3 font-semibold text-foreground">Ссылки для гостей</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-text-secondary hover:text-foreground transition-colors rounded-input hover:bg-background"
            aria-label="Закрыть"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleCreate}
            disabled={create.isPending}
          >
            {create.isPending ? 'Создание…' : 'Создать ссылку'}
          </Button>
          <p className="text-small text-text-secondary">
            Гость сможет войти без регистрации, введя имя.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {isLoading && (
            <div className="text-body text-text-secondary">Загрузка…</div>
          )}
          {isError && (
            <div className="text-body text-danger">
              {error instanceof Error ? error.message : 'Не удалось загрузить ссылки'}
            </div>
          )}
          {!isLoading && !isError && (links ?? []).length === 0 && (
            <div className="text-body text-text-secondary">
              Нет активных ссылок. Создайте первую.
            </div>
          )}
          {(links ?? []).map((link) => {
            const isCopied = copiedToken === link.token;
            return (
              <div
                key={link.token}
                className="flex flex-col gap-2 rounded-card border border-border bg-background p-3"
              >
                <input
                  readOnly
                  value={link.url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full truncate rounded-input border border-border bg-surface px-2 py-1 text-small text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-text-secondary">
                    Создана {formatDate(link.createdAt)}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => handleCopy(link)}
                    >
                      {isCopied ? 'Скопировано' : 'Копировать'}
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      onClick={() => handleRevoke(link.token)}
                      disabled={revoke.isPending}
                    >
                      Отозвать
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-end px-5 py-4 border-t border-border">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Закрыть
          </Button>
        </div>
      </div>
    </>
  );
}
