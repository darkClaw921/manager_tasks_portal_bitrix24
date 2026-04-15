'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { WalletSummary, WalletRate } from '@/types/wallet';

// ==================== Types ====================

export interface WalletRatesFilters {
  /** Restrict to a single status bucket. */
  group?: 'earned' | 'expected' | 'deferred';
}

export interface SetPaidAmountInput {
  rateId: number;
  paidAmount: number;
}

// ==================== Fetch Functions ====================

async function fetchWalletSummary(): Promise<WalletSummary> {
  const response = await fetch('/api/wallet/summary');
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to fetch wallet summary');
  }
  const json = await response.json();
  return json.data;
}

async function fetchWalletRates(
  filters: WalletRatesFilters
): Promise<WalletRate[]> {
  const params = new URLSearchParams();
  if (filters.group) params.set('group', filters.group);

  const qs = params.toString();
  const url = qs ? `/api/wallet/rates?${qs}` : '/api/wallet/rates';
  const response = await fetch(url);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to fetch wallet rates');
  }
  const json = await response.json();
  return json.data;
}

async function patchPaidAmount(input: SetPaidAmountInput): Promise<void> {
  const { rateId, paidAmount } = input;
  const response = await fetch(`/api/wallet/rates/${rateId}/paid-amount`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paidAmount }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to update paid amount');
  }
}

// ==================== Hooks ====================

/**
 * Hook to fetch the current user's wallet summary (earned / expected /
 * deferred / paid / outstanding).
 */
export function useWalletSummary() {
  return useQuery<WalletSummary>({
    queryKey: ['wallet', 'summary'],
    queryFn: fetchWalletSummary,
    staleTime: 10_000,
  });
}

/**
 * Hook to fetch rate rows for the wallet table, optionally filtered by
 * status bucket (earned / expected / deferred).
 */
export function useWalletRates(filters: WalletRatesFilters = {}) {
  return useQuery<WalletRate[]>({
    queryKey: ['wallet', 'rates', filters],
    queryFn: () => fetchWalletRates(filters),
    staleTime: 10_000,
  });
}

/**
 * Hook to update paidAmount on a rate. On success, invalidates the entire
 * ['wallet', ...] query tree so summary and every rate list refetch.
 */
export function useSetPaidAmount() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, SetPaidAmountInput>({
    mutationFn: patchPaidAmount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      // Also invalidate /payments views so they see the same paid state.
      queryClient.invalidateQueries({ queryKey: ['payments'] });
    },
  });
}
