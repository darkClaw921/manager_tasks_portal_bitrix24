'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || 'Неверный email или пароль');
        return;
      }

      router.push('/dashboard');
    } catch {
      setError('Ошибка подключения к серверу');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-[400px]">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mb-3 flex items-center justify-center gap-2">
            <div className="flex gap-1">
              <span className="inline-block h-3 w-3 rounded-full bg-portal-purple" />
              <span className="inline-block h-3 w-3 rounded-full bg-portal-cyan" />
              <span className="inline-block h-3 w-3 rounded-full bg-portal-orange" />
            </div>
            <h1 className="text-h2 font-bold text-foreground">TaskHub</h1>
          </div>
          <p className="text-small text-text-secondary">
            Управление задачами Bitrix24
          </p>
        </div>

        {/* Card */}
        <div className="rounded-card bg-surface p-8 shadow-lg border border-border">
          <h2 className="mb-6 text-h3 font-semibold text-foreground">Вход в систему</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-small font-medium text-foreground"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@taskhub.local"
                required
                autoComplete="email"
                className="w-full rounded-input border border-border bg-background px-3 py-2.5 text-body text-foreground placeholder:text-text-muted outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-small font-medium text-foreground"
              >
                Пароль
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Введите пароль"
                required
                autoComplete="current-password"
                className="w-full rounded-input border border-border bg-background px-3 py-2.5 text-body text-foreground placeholder:text-text-muted outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            {/* Error message */}
            {error && (
              <div className="rounded-input bg-danger-light px-3 py-2 text-small text-danger">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-input bg-primary py-2.5 text-body font-medium text-text-inverse transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? 'Вход...' : 'Войти'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
