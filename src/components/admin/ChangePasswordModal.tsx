'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { InputField } from '@/components/ui/InputField';
import type { AdminUser } from '@/hooks/useUsers';

interface ChangePasswordModalProps {
  user: AdminUser;
  onClose: () => void;
  onSubmit: (userId: number, password: string) => Promise<void>;
  isLoading?: boolean;
}

export function ChangePasswordModal({ user, onClose, onSubmit, isLoading }: ChangePasswordModalProps) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const validate = (): string | null => {
    if (password.length < 8) return 'Пароль должен содержать минимум 8 символов';
    if (!/[A-Z]/.test(password)) return 'Требуется хотя бы одна заглавная буква (A-Z)';
    if (!/[a-z]/.test(password)) return 'Требуется хотя бы одна строчная буква (a-z)';
    if (!/[0-9]/.test(password)) return 'Требуется хотя бы одна цифра (0-9)';
    if (password !== confirm) return 'Пароли не совпадают';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    try {
      await onSubmit(user.id, password);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сменить пароль');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-surface rounded-card border border-border w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-h3 font-semibold text-foreground">Смена пароля</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-foreground"
            aria-label="Закрыть"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <p className="text-small text-text-secondary">
            Пользователь: <span className="font-medium text-foreground">{user.firstName} {user.lastName}</span> ({user.email})
          </p>

          <InputField
            label="Новый пароль"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />

          <InputField
            label="Подтверждение пароля"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />

          <p className="text-xs text-text-muted">
            Минимум 8 символов, заглавная + строчная буквы, цифра.
          </p>

          {error && (
            <div className="p-3 rounded-input bg-danger-light text-danger text-small">
              {error}
            </div>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={isLoading}>
              Отмена
            </Button>
            <Button type="submit" variant="primary" loading={isLoading}>
              Сменить пароль
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
