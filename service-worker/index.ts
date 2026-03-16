/**
 * Custom service worker code for TaskHub PWA.
 * This file is merged into the generated service worker by @ducanh2912/next-pwa.
 *
 * Handles:
 * - Push notification display
 * - Notification click navigation
 */

// Use 'declare' to tell TypeScript about the ServiceWorkerGlobalScope
declare const self: ServiceWorkerGlobalScope;

// ==================== Push Event ====================

self.addEventListener("push", (event) => {
  if (!(event as any).data) return;

  const pushEvent = event as PushEvent;
  let payload: {
    title?: string;
    body?: string;
    icon?: string;
    badge?: string;
    data?: { url?: string; taskId?: number; portalId?: number };
    tag?: string;
  };

  try {
    payload = pushEvent.data!.json();
  } catch {
    payload = {
      title: "TaskHub",
      body: pushEvent.data!.text(),
    };
  }

  const title = payload.title || "TaskHub";
  const options: NotificationOptions & { renotify?: boolean; vibrate?: number[] } = {
    body: payload.body || "",
    icon: payload.icon || "/icons/icon-192x192.png",
    badge: payload.badge || "/icons/icon-192x192.png",
    data: payload.data || {},
    tag: payload.tag || `taskhub-${Date.now()}`,
    renotify: true,
    vibrate: [200, 100, 200],
  };

  (event as ExtendableEvent).waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ==================== Notification Click ====================

self.addEventListener("notificationclick", (event) => {
  const notifEvent = event as NotificationEvent;
  notifEvent.notification.close();

  const data = notifEvent.notification.data as { url?: string } | undefined;
  const urlPath = data?.url || "/dashboard";

  (event as ExtendableEvent).waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList: readonly WindowClient[]) => {
        // If there's already an open window, navigate it
        for (const client of clientList) {
          if ("focus" in client && "navigate" in client) {
            return client.navigate(urlPath).then((c) => c?.focus());
          }
        }
        // Otherwise open a new window
        return self.clients.openWindow(urlPath);
      })
  );
});
