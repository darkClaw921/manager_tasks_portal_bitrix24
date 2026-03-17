'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { InputField } from '@/components/ui/InputField';

interface CreateUserFormProps {
  onSubmit: (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    isAdmin: boolean;
  }) => void;
  onCancel: () => void;
  isLoading?: boolean;
  error?: string | null;
}

export function CreateUserForm({ onSubmit, onCancel, isLoading, error }: CreateUserFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (!email.trim()) errors.email = 'Email обязателен';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Неверный формат email';

    if (!password) errors.password = 'Пароль обязателен';
    else if (password.length < 6) errors.password = 'Пароль должен быть не менее 8 символов';

    if (!firstName.trim()) errors.firstName = 'Имя обязательно';
    if (!lastName.trim()) errors.lastName = 'Фамилия обязательна';

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    onSubmit({
      email: email.trim().toLowerCase(),
      password,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      isAdmin,
    });
  };

  return (
    <div className="bg-surface rounded-card border border-border p-6">
      <h3 className="text-h3 font-semibold mb-4">Создать пользователя</h3>

      {error && (
        <div className="mb-4 p-3 bg-danger-light text-danger text-small rounded-input">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InputField
            label="Имя"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Иван"
            error={validationErrors.firstName}
            required
          />
          <InputField
            label="Фамилия"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Иванов"
            error={validationErrors.lastName}
            required
          />
        </div>

        <InputField
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="user@example.com"
          error={validationErrors.email}
          required
        />

        <InputField
          label="Пароль"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Мин. 8 символов"
          error={validationErrors.password}
          required
        />

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isAdmin}
            onChange={(e) => setIsAdmin(e.target.checked)}
            className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
          />
          <span className="text-small text-foreground">Администратор</span>
          <span className="text-xs text-text-secondary">(может управлять всеми пользователями и данными)</span>
        </label>

        <div className="flex items-center gap-2 pt-2">
          <Button type="submit" variant="primary" loading={isLoading}>
            Создать
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Отмена
          </Button>
        </div>
      </form>
    </div>
  );
}
