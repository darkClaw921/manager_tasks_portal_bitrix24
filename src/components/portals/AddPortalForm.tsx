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

interface AddPortalFormProps {
  onConnect?: () => void;
}

export function AddPortalForm({ onConnect }: AddPortalFormProps) {
  const [domain, setDomain] = useState('');
  const [name, setName] = useState('');
  const [selectedColor, setSelectedColor] = useState(PORTAL_COLORS[0]);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkResult, setCheckResult] = useState<string | null>(null);

  const cleanDomain = domain.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');

  const handleCheck = async () => {
    if (!cleanDomain) {
      setError('Enter a portal address');
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
      setCheckResult('Portal is reachable');
    } catch {
      setCheckResult('Could not reach portal. Make sure the address is correct.');
    } finally {
      setChecking(false);
    }
  };

  const handleConnect = async () => {
    if (!cleanDomain) {
      setError('Enter a portal address');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/portals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: cleanDomain }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || 'Failed to initiate connection');
        return;
      }

      if (data.data?.authUrl) {
        // Redirect to Bitrix24 OAuth page
        window.location.href = data.data.authUrl;
      } else {
        setError('No authorization URL received');
      }

      onConnect?.();
    } catch (err) {
      console.error('Connect error:', err);
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
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
        Connect new portal
      </h2>
      <p className="text-small text-text-secondary text-center mb-6">
        Enter the address of your Bitrix24 portal to connect
      </p>

      <div className="space-y-4">
        <InputField
          label="Portal address"
          placeholder="your-company.bitrix24.ru"
          value={domain}
          onChange={(e) => {
            setDomain(e.target.value);
            setError(null);
            setCheckResult(null);
          }}
          error={error && !name ? error : undefined}
        />

        <InputField
          label="Name (optional)"
          placeholder="e.g., My project"
          value={name}
          onChange={(e) => setName(e.target.value)}
          helperText="Display name for the portal in the sidebar"
        />

        {/* Color selector */}
        <div className="space-y-1.5">
          <label className="block text-small font-medium text-foreground">
            Portal color
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
                aria-label={`Select color ${color}`}
              />
            ))}
          </div>
        </div>

        {/* Error display */}
        {error && (
          <p className="text-small text-danger">{error}</p>
        )}

        {/* Check result */}
        {checkResult && (
          <p className={cn(
            'text-small',
            checkResult.includes('reachable') ? 'text-success' : 'text-warning'
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
            Check
          </Button>
          <Button
            variant="primary"
            onClick={handleConnect}
            loading={loading}
            disabled={!cleanDomain || checking}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Connect portal
          </Button>
        </div>
      </div>
    </div>
  );
}
