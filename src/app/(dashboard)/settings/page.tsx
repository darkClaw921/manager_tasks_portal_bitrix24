'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { InputField } from '@/components/ui/InputField';
import { SelectField } from '@/components/ui/SelectField';
import { PortalList } from '@/components/portals/PortalList';
import { SystemSettings } from '@/components/settings/SystemSettings';
import { usePortals, useUpdatePortal, useDisconnectPortal, useSyncPortal } from '@/hooks/usePortals';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import type { UserDetail } from '@/hooks/useUsers';

type SettingsTab = 'profile' | 'notifications' | 'portals' | 'system';

interface TabConfig {
  id: SettingsTab;
  label: string;
  icon: React.ReactNode;
}

function UserIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
    </svg>
  );
}

function CogIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}

const BASE_TABS: TabConfig[] = [
  { id: 'profile', label: 'Профиль', icon: <UserIcon /> },
  { id: 'notifications', label: 'Уведомления', icon: <BellIcon /> },
  { id: 'portals', label: 'Порталы', icon: <GlobeIcon /> },
];

const SYSTEM_TAB: TabConfig = { id: 'system', label: 'Система', icon: <CogIcon /> };

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [userData, setUserData] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const isAdmin = userData?.isAdmin ?? false;

  const tabs = useMemo(() => {
    return isAdmin ? [...BASE_TABS, SYSTEM_TAB] : BASE_TABS;
  }, [isAdmin]);

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        // Fetch full user details including notification prefs
        const detailRes = await fetch(`/api/users/${data.user.id}`);
        if (detailRes.ok) {
          const detailData = await detailRes.json();
          setUserData(detailData.data);
        }
      }
    } catch (err) {
      console.error('Failed to load user:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  return (
    <div className="max-w-5xl mx-auto">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-h2 font-bold text-foreground">Настройки</h1>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Tab navigation - sidebar on desktop, horizontal scroll on mobile */}
        <nav className="md:w-56 shrink-0">
          <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2.5 rounded-input text-small font-medium whitespace-nowrap transition-colors text-left',
                  activeTab === tab.id
                    ? 'bg-primary-light text-primary'
                    : 'text-text-secondary hover:bg-background hover:text-foreground'
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </nav>

        {/* Tab content */}
        <div className="flex-1 min-w-0">
          {loading ? (
            <SettingsSkeleton />
          ) : (
            <>
              {activeTab === 'profile' && userData && (
                <ProfileTab user={userData} onSaved={fetchUser} />
              )}
              {activeTab === 'notifications' && userData && (
                <NotificationsTab user={userData} onSaved={fetchUser} />
              )}
              {activeTab === 'portals' && <PortalsTab />}
              {activeTab === 'system' && isAdmin && <SystemSettings />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ===== Skeleton ===== */
function SettingsSkeleton() {
  return (
    <div className="bg-surface rounded-card border border-border p-6 space-y-4 animate-pulse">
      <div className="h-5 bg-background rounded w-1/4" />
      <div className="space-y-3">
        <div className="h-10 bg-background rounded" />
        <div className="h-10 bg-background rounded" />
        <div className="h-10 bg-background rounded" />
      </div>
    </div>
  );
}

/* ===== Profile Tab ===== */
function ProfileTab({ user, onSaved }: { user: UserDetail; onSaved: () => void }) {
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [email, setEmail] = useState(user.email);
  const [timezone, setTimezone] = useState(user.timezone);
  const [language, setLanguage] = useState(user.language);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const TIMEZONES = [
    { value: 'Europe/Moscow', label: 'Москва (UTC+3)' },
    { value: 'Europe/London', label: 'Лондон (UTC+0)' },
    { value: 'Europe/Berlin', label: 'Берлин (UTC+1)' },
    { value: 'Europe/Kiev', label: 'Киев (UTC+2)' },
    { value: 'Asia/Yekaterinburg', label: 'Екатеринбург (UTC+5)' },
    { value: 'Asia/Novosibirsk', label: 'Новосибирск (UTC+7)' },
    { value: 'Asia/Vladivostok', label: 'Владивосток (UTC+10)' },
    { value: 'America/New_York', label: 'Нью-Йорк (UTC-5)' },
    { value: 'America/Los_Angeles', label: 'Лос-Анджелес (UTC-8)' },
    { value: 'Asia/Tokyo', label: 'Токио (UTC+9)' },
    { value: 'Asia/Shanghai', label: 'Шанхай (UTC+8)' },
  ];

  const LANGUAGES = [
    { value: 'ru', label: 'Русский' },
    { value: 'en', label: 'Английский' },
  ];

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim().toLowerCase(),
          timezone,
          language,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Не удалось сохранить');
      }

      setMessage({ type: 'success', text: 'Профиль успешно обновлён' });
      setTimeout(() => setMessage(null), 4000);
      onSaved();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Не удалось сохранить' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-surface rounded-card border border-border p-6">
      <h2 className="text-h3 font-semibold mb-4">Профиль</h2>

      {message && (
        <div
          className={cn(
            'mb-4 p-3 rounded-input text-small',
            message.type === 'success' ? 'bg-success-light text-success' : 'bg-danger-light text-danger'
          )}
        >
          {message.text}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InputField
            label="Имя"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
          />
          <InputField
            label="Фамилия"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
          />
        </div>

        <InputField
          label="Эл. почта"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SelectField
            label="Часовой пояс"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            options={TIMEZONES}
          />
          <SelectField
            label="Язык"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            options={LANGUAGES}
          />
        </div>

        <div className="pt-2">
          <Button type="submit" variant="primary" loading={saving}>
            Сохранить изменения
          </Button>
        </div>
      </form>
    </div>
  );
}

/* ===== Notifications Tab ===== */
function NotificationsTab({ user, onSaved }: { user: UserDetail; onSaved: () => void }) {
  const [prefs, setPrefs] = useState({
    notifyTaskAdd: user.notifyTaskAdd,
    notifyTaskUpdate: user.notifyTaskUpdate,
    notifyTaskDelete: user.notifyTaskDelete,
    notifyCommentAdd: user.notifyCommentAdd,
    notifyMention: user.notifyMention,
    notifyOverdue: user.notifyOverdue,
    notifyDigest: user.notifyDigest,
  });
  const [digestTime, setDigestTime] = useState(user.digestTime);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const push = usePushNotifications();

  const togglePref = (key: keyof typeof prefs) => {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...prefs, digestTime }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Не удалось сохранить');
      }

      setMessage({ type: 'success', text: 'Настройки уведомлений сохранены' });
      setTimeout(() => setMessage(null), 4000);
      onSaved();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Не удалось сохранить' });
    } finally {
      setSaving(false);
    }
  };

  const handlePushToggle = async () => {
    if (push.isSubscribed) {
      await push.unsubscribe();
    } else {
      await push.subscribe();
    }
  };

  const notifOptions = [
    { key: 'notifyTaskAdd' as const, label: 'Новые задачи', description: 'Когда вам назначена новая задача' },
    { key: 'notifyTaskUpdate' as const, label: 'Обновления задач', description: 'Когда обновляется задача, за которой вы следите' },
    { key: 'notifyTaskDelete' as const, label: 'Удаление задач', description: 'Когда удаляется задача, за которой вы следите' },
    { key: 'notifyCommentAdd' as const, label: 'Новые комментарии', description: 'Когда кто-то комментирует вашу задачу' },
    { key: 'notifyMention' as const, label: 'Упоминания', description: 'Когда вас упоминают в комментарии' },
    { key: 'notifyOverdue' as const, label: 'Просроченные задачи', description: 'Когда задача просрочена' },
    { key: 'notifyDigest' as const, label: 'Ежедневная сводка', description: 'Ежедневная сводка по вашим задачам' },
  ];

  return (
    <div className="space-y-4">
      {message && (
        <div
          className={cn(
            'p-3 rounded-input text-small',
            message.type === 'success' ? 'bg-success-light text-success' : 'bg-danger-light text-danger'
          )}
        >
          {message.text}
        </div>
      )}

      {/* Push notifications */}
      <div className="bg-surface rounded-card border border-border p-6">
        <h2 className="text-h3 font-semibold mb-4">Push-уведомления</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-small font-medium text-foreground">Push-уведомления в браузере</p>
            <p className="text-xs text-text-secondary mt-0.5">
              {!push.isSupported
                ? 'Push-уведомления не поддерживаются в этом браузере'
                : push.permission === 'denied'
                  ? 'Уведомления заблокированы. Включите их в настройках браузера.'
                  : push.isSubscribed
                    ? 'Вы получаете push-уведомления'
                    : 'Включите для получения уведомлений в реальном времени'}
            </p>
          </div>
          <Button
            variant={push.isSubscribed ? 'secondary' : 'primary'}
            size="sm"
            onClick={handlePushToggle}
            loading={push.isLoading}
            disabled={!push.isSupported || push.permission === 'denied'}
          >
            {push.isSubscribed ? 'Отключить' : 'Включить'}
          </Button>
        </div>
      </div>

      {/* Notification preferences */}
      <div className="bg-surface rounded-card border border-border p-6">
        <h2 className="text-h3 font-semibold mb-4">Типы уведомлений</h2>
        <div className="divide-y divide-border">
          {notifOptions.map((opt) => (
            <div key={opt.key} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
              <div>
                <p className="text-small font-medium text-foreground">{opt.label}</p>
                <p className="text-xs text-text-secondary mt-0.5">{opt.description}</p>
              </div>
              <button
                type="button"
                onClick={() => togglePref(opt.key)}
                className={cn(
                  'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-primary',
                  prefs[opt.key] ? 'bg-primary' : 'bg-border'
                )}
                role="switch"
                aria-checked={prefs[opt.key]}
              >
                <span
                  className={cn(
                    'inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm',
                    prefs[opt.key] ? 'translate-x-6' : 'translate-x-1'
                  )}
                />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Digest time */}
      <div className="bg-surface rounded-card border border-border p-6">
        <h2 className="text-h3 font-semibold mb-4">Расписание сводки</h2>
        <div className="flex items-center gap-4">
          <div className="flex-1 max-w-xs">
            <label className="block text-small font-medium text-foreground mb-1">
              Время доставки
            </label>
            <input
              type="time"
              value={digestTime}
              onChange={(e) => setDigestTime(e.target.value)}
              className="w-full px-3 py-2 rounded-input border border-border text-small text-foreground bg-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
            />
            <p className="text-xs text-text-secondary mt-1">
              Ежедневная сводка будет доставлена в это время по вашему часовому поясу
            </p>
          </div>
        </div>
      </div>

      <div className="pt-2">
        <Button variant="primary" onClick={handleSave} loading={saving}>
          Сохранить настройки уведомлений
        </Button>
      </div>
    </div>
  );
}

/* ===== Portals Tab ===== */
function PortalsTab() {
  const { data: portals, isLoading } = usePortals();
  const updatePortal = useUpdatePortal();
  const disconnectPortal = useDisconnectPortal();
  const syncPortal = useSyncPortal();
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleUpdate = async (id: number, data: { name?: string; color?: string }) => {
    try {
      await updatePortal.mutateAsync({ id, ...data });
      setMessage({ type: 'success', text: 'Портал обновлён' });
      setTimeout(() => setMessage(null), 3000);
    } catch {
      setMessage({ type: 'error', text: 'Не удалось обновить портал' });
    }
  };

  const handleDisconnect = async (id: number) => {
    try {
      await disconnectPortal.mutateAsync(id);
      setMessage({ type: 'success', text: 'Портал отключён' });
      setTimeout(() => setMessage(null), 3000);
    } catch {
      setMessage({ type: 'error', text: 'Не удалось отключить портал' });
    }
  };

  const handleSync = async (id: number) => {
    try {
      await syncPortal.mutateAsync(id);
      setMessage({ type: 'success', text: 'Синхронизация завершена успешно' });
      setTimeout(() => setMessage(null), 3000);
    } catch {
      setMessage({ type: 'error', text: 'Ошибка синхронизации. Попробуйте ещё раз.' });
    }
  };

  if (isLoading) {
    return (
      <div className="bg-surface rounded-card border border-border p-6">
        <h2 className="text-h3 font-semibold mb-4">Порталы</h2>
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-input border border-border animate-pulse">
              <div className="w-10 h-10 rounded-input bg-background" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-background rounded w-1/3" />
                <div className="h-3 bg-background rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const allPortals = portals || [];

  if (allPortals.length === 0) {
    return (
      <div className="bg-surface rounded-card border border-border p-8 text-center">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 mx-auto text-text-muted mb-3">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
        </svg>
        <h3 className="text-small font-medium text-foreground mb-1">Порталы не подключены</h3>
        <p className="text-xs text-text-secondary mb-4">
          Подключите портал Bitrix24, чтобы начать управлять задачами
        </p>
        <Button variant="primary" size="sm" onClick={() => window.location.href = '/portals'}>
          Подключить портал
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {message && (
        <div
          className={cn(
            'p-3 rounded-input text-small',
            message.type === 'success' ? 'bg-success-light text-success' : 'bg-danger-light text-danger'
          )}
        >
          {message.text}
        </div>
      )}
      <PortalList
        portals={allPortals}
        onUpdate={handleUpdate}
        onDisconnect={handleDisconnect}
        showSync
        onSync={handleSync}
      />
    </div>
  );
}
