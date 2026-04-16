'use client';

import { useState } from 'react';
import { InputField } from '@/components/ui/InputField';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

/** Predefined color options for portal identification */
const PORTAL_COLORS = [
  '#2563EB', // Primary blue
  '#06B6D4', // Cyan
  '#8B5CF6', // Purple
  '#16A34A', // Green
  '#F59E0B', // Amber
  '#F97316', // Orange
  '#DC2626', // Red
  '#EC4899', // Pink
];

const APP_URL = typeof window !== 'undefined'
  ? window.location.origin
  : '';

interface AddPortalFormProps {
  onConnect?: () => void;
}

export function AddPortalForm({ onConnect }: AddPortalFormProps) {
  const [domain, setDomain] = useState('');
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [selectedColor, setSelectedColor] = useState(PORTAL_COLORS[0]);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkResult, setCheckResult] = useState<string | null>(null);
  const [showUrls, setShowUrls] = useState(false);

  const cleanDomain = domain.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');

  const installUrl = `${APP_URL}/api/install`;
  const handlerUrl = `${APP_URL}/api/webhooks/bitrix`;

  const handleCheck = async () => {
    if (!cleanDomain) {
      setError('Введите адрес портала');
      return;
    }

    setChecking(true);
    setError(null);
    setCheckResult(null);

    try {
      // Simple check: try to reach the portal domain
      const response = await fetch(`https://${cleanDomain}/`, {
        method: 'HEAD',
        mode: 'no-cors',
      });
      // In no-cors mode, we can't read the response, but if it doesn't throw, the domain is reachable
      void response;
      setCheckResult('Портал доступен');
    } catch {
      setCheckResult('Не удалось связаться с порталом. Проверьте правильность адреса.');
    } finally {
      setChecking(false);
    }
  };

  const handleConnect = async () => {
    if (!cleanDomain) {
      setError('Введите адрес портала');
      return;
    }
    if (!clientId.trim()) {
      setError('Введите Client ID приложения');
      return;
    }
    if (!clientSecret.trim()) {
      setError('Введите Client Secret приложения');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/portals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: cleanDomain,
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim(),
          name: name.trim() || undefined,
          color: selectedColor,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || 'Не удалось начать подключение');
        return;
      }

      if (data.data?.authUrl) {
        // Redirect to Bitrix24 OAuth page
        window.location.href = data.data.authUrl;
      } else {
        setError('Не получена ссылка для авторизации');
      }

      onConnect?.();
    } catch (err) {
      console.error('Connect error:', err);
      setError('Ошибка подключения. Попробуйте ещё раз.');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  return (
    <div className="bg-surface rounded-card border border-border p-6">
      {/* Header icon */}
      <div className="flex justify-center mb-4">
        <div className="w-12 h-12 rounded-full bg-primary-light flex items-center justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-6 h-6 text-primary"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"
            />
          </svg>
        </div>
      </div>

      <h2 className="text-h3 font-semibold text-center mb-1">
        Подключить новый портал
      </h2>
      <p className="text-small text-text-secondary text-center mb-6">
        Введите данные приложения Bitrix24 для подключения
      </p>

      <div className="space-y-4">
        <InputField
          label="Адрес портала"
          placeholder="ваша-компания.bitrix24.ru"
          value={domain}
          onChange={(e) => {
            setDomain(e.target.value);
            setError(null);
            setCheckResult(null);
          }}
        />

        <InputField
          label="Client ID"
          placeholder="app.xxxxxxxxxxxxxxx.xxxxxxxx"
          value={clientId}
          onChange={(e) => {
            setClientId(e.target.value);
            setError(null);
          }}
        />

        <InputField
          label="Client Secret"
          placeholder="Секретный ключ приложения"
          type="password"
          value={clientSecret}
          onChange={(e) => {
            setClientSecret(e.target.value);
            setError(null);
          }}
        />

        <InputField
          label="Название (необязательно)"
          placeholder="например, Мой проект"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        {/* Color selector */}
        <div className="space-y-1.5">
          <label className="block text-small font-medium text-foreground">
            Цвет портала
          </label>
          <div className="flex gap-2 flex-wrap">
            {PORTAL_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setSelectedColor(color)}
                className={cn(
                  'w-8 h-8 rounded-full transition-all',
                  selectedColor === color
                    ? 'ring-2 ring-offset-2 ring-foreground scale-110'
                    : 'hover:scale-105'
                )}
                style={{ backgroundColor: color }}
                aria-label={`Выбрать цвет ${color}`}
              />
            ))}
          </div>
        </div>

        {/* URLs for Bitrix24 app configuration */}
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => setShowUrls(!showUrls)}
            className="flex items-center gap-1.5 text-small font-medium text-primary hover:text-primary/80 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className={cn('w-4 h-4 transition-transform', showUrls && 'rotate-90')}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
            URL-ы для настройки приложения в Bitrix24
          </button>

          {showUrls && (
            <div className="bg-background rounded-input border border-border p-3 space-y-3 text-small">
              <div>
                <label className="block text-xs text-text-secondary mb-1">
                  Путь установки (Install URL)
                </label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-surface px-2 py-1 rounded text-xs break-all border border-border">
                    {installUrl}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(installUrl)}
                    className="shrink-0 p-1 text-text-secondary hover:text-foreground transition-colors"
                    title="Скопировать"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                    </svg>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs text-text-secondary mb-1">
                  Путь обработки событий (Event Handler URL)
                </label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-surface px-2 py-1 rounded text-xs break-all border border-border">
                    {handlerUrl}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(handlerUrl)}
                    className="shrink-0 p-1 text-text-secondary hover:text-foreground transition-colors"
                    title="Скопировать"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                    </svg>
                  </button>
                </div>
              </div>

              <p className="text-xs text-text-secondary">
                Укажите эти URL-ы при создании приложения в разделе
                «Разработчикам» → «Другое» → «Серверное приложение» на вашем портале Bitrix24.
              </p>
            </div>
          )}
        </div>

        {/* Error display */}
        {error && (
          <p className="text-small text-danger">{error}</p>
        )}

        {/* Check result */}
        {checkResult && (
          <p className={cn(
            'text-small',
            checkResult.includes('доступен') ? 'text-success' : 'text-warning'
          )}>
            {checkResult}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button
            variant="secondary"
            onClick={handleCheck}
            loading={checking}
            disabled={!cleanDomain || loading}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            Проверить
          </Button>
          <Button
            variant="primary"
            onClick={handleConnect}
            loading={loading}
            disabled={!cleanDomain || !clientId.trim() || !clientSecret.trim() || checking}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Подключить портал
          </Button>
        </div>
      </div>
    </div>
  );
}
