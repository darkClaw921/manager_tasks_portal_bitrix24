'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  PaymentRequest,
  CreatePaymentRequestInput,
  AcceptPaymentRequestInput,
} from '@/types/payment-request';

// ==================== Types ====================

export interface AcceptPaymentRequestVariables {
  id: number;
  input?: AcceptPaymentRequestInput;
}

export interface RejectPaymentRequestVariables {
  id: number;
}

// ==================== Fetch Functions ====================

async function fetchPaymentRequests(
  direction: 'incoming' | 'outgoing'
): Promise<PaymentRequest[]> {
  const response = await fetch(
    `/api/payment-requests?direction=${direction}`
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to fetch payment requests');
  }
  const json = await response.json();
  return json.data;
}

async function postCreatePaymentRequest(
  input: CreatePaymentRequestInput
): Promise<PaymentRequest> {
  const response = await fetch('/api/payment-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to create payment request');
  }
  const json = await response.json();
  return json.data;
}

async function postAcceptPaymentRequest(
  variables: AcceptPaymentRequestVariables
): Promise<PaymentRequest> {
  const body = variables.input ?? {};
  const response = await fetch(
    `/api/payment-requests/${variables.id}/accept`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to accept payment request');
  }
  const json = await response.json();
  return json.data;
}

async function postRejectPaymentRequest(
  variables: RejectPaymentRequestVariables
): Promise<PaymentRequest> {
  const response = await fetch(
    `/api/payment-requests/${variables.id}/reject`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to reject payment request');
  }
  const json = await response.json();
  return json.data;
}

// ==================== Hooks ====================

/**
 * Fetch payment requests where the current user is the recipient (inbox).
 * Used by the user-facing /wallet?tab=requests view.
 */
export function useIncomingRequests() {
  return useQuery<PaymentRequest[]>({
    queryKey: ['payment-requests', 'incoming'],
    queryFn: () => fetchPaymentRequests('incoming'),
    staleTime: 10_000,
  });
}

/**
 * Fetch payment requests sent by the current admin (outgoing).
 * Used by the admin-side /payments view (Phase 6).
 */
export function useOutgoingRequests() {
  return useQuery<PaymentRequest[]>({
    queryKey: ['payment-requests', 'outgoing'],
    queryFn: () => fetchPaymentRequests('outgoing'),
    staleTime: 10_000,
  });
}

/**
 * Admin creates a new payment request. On success invalidates both the
 * outgoing list and the wallet cache (the target user's expected amounts
 * may shift as rates get paid out).
 */
export function useCreatePaymentRequest() {
  const queryClient = useQueryClient();

  return useMutation<PaymentRequest, Error, CreatePaymentRequestInput>({
    mutationFn: postCreatePaymentRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-requests'] });
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
    },
  });
}

/**
 * Recipient accepts a payment request. If `input.overrides` is provided,
 * the backend will mark the request as 'modified' and apply per-item
 * overrides instead of the original proposedAmount.
 *
 * Invalidates:
 *  - ['payment-requests'] (inbox and detail caches)
 *  - ['wallet'] (summary and rate lists — paidAmount changed)
 *  - ['payments'] (admin view shows the same paid state)
 */
export function useAcceptPaymentRequest() {
  const queryClient = useQueryClient();

  return useMutation<PaymentRequest, Error, AcceptPaymentRequestVariables>({
    mutationFn: postAcceptPaymentRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-requests'] });
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
    },
  });
}

/**
 * Recipient rejects a pending payment request. Only payment-requests cache
 * is invalidated — rejecting does not change wallet balances.
 */
export function useRejectPaymentRequest() {
  const queryClient = useQueryClient();

  return useMutation<PaymentRequest, Error, RejectPaymentRequestVariables>({
    mutationFn: postRejectPaymentRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-requests'] });
    },
  });
}
