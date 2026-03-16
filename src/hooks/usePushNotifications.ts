'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * Hook to manage push notification subscription.
 *
 * Handles:
 * - Checking browser support and current permission
 * - Requesting notification permission
 * - Subscribing to push notifications via service worker
 * - Sending subscription to server
 * - Unsubscribing
 */
export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isLoading, setIsLoading] = useState(false);

  // Check support and current state on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const supported =
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window;

    setIsSupported(supported);

    if (!supported) return;

    setPermission(Notification.permission);

    // Check if already subscribed
    navigator.serviceWorker.ready.then((registration) => {
      registration.pushManager.getSubscription().then((subscription) => {
        setIsSubscribed(!!subscription);
      });
    });
  }, []);

  /**
   * Request notification permission and subscribe to push notifications.
   */
  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;

    setIsLoading(true);
    try {
      // Request permission
      const result = await Notification.requestPermission();
      setPermission(result);

      if (result !== 'granted') {
        console.log('[push] Notification permission denied');
        return false;
      }

      // Get the VAPID public key
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        console.error('[push] VAPID public key not configured');
        return false;
      }

      // Wait for service worker to be ready
      const registration = await navigator.serviceWorker.ready;

      // Subscribe to push
      const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
      });

      // Send subscription to server
      const response = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      });

      if (!response.ok) {
        throw new Error('Failed to save subscription on server');
      }

      setIsSubscribed(true);
      console.log('[push] Successfully subscribed to push notifications');
      return true;
    } catch (error) {
      console.error('[push] Failed to subscribe:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported]);

  /**
   * Unsubscribe from push notifications.
   */
  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;

    setIsLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();
      }

      // Remove from server
      await fetch('/api/notifications/subscribe', {
        method: 'DELETE',
      });

      setIsSubscribed(false);
      console.log('[push] Successfully unsubscribed from push notifications');
      return true;
    } catch (error) {
      console.error('[push] Failed to unsubscribe:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported]);

  return {
    isSupported,
    isSubscribed,
    permission,
    isLoading,
    subscribe,
    unsubscribe,
  };
}

/**
 * Convert a URL-safe base64 string to a Uint8Array.
 * Required for the applicationServerKey in pushManager.subscribe().
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}
