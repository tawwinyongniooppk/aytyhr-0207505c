/* eslint-disable no-undef */
// Firebase web push service worker.
// We render background notifications ourselves from the raw push payload so
// sound, vibration, body text, badge count, and click navigation are controlled
// in one place on every supported device/browser.

// ------- Badge bumping (runs for EVERY push, regardless of notification field) -------
let badgeCount = 0;
async function applyBadge(absoluteOrIncrement) {
  // If a string like "3" is supplied (from data.badge), set the absolute
  // count. Otherwise increment by one.
  const parsed = Number(absoluteOrIncrement);
  if (Number.isFinite(parsed) && parsed > 0) {
    badgeCount = parsed;
  } else {
    badgeCount += 1;
  }
  try {
    if (self.navigator && "setAppBadge" in self.navigator) {
      await self.navigator.setAppBadge(badgeCount);
    }
  } catch (_) {
    /* ignore */
  }
}

function normalizePayload(json) {
  const rootNotification = json?.notification || {};
  const webpushNotification = json?.webpush?.notification || {};
  const data = json?.data || {};
  const title =
    rootNotification.title || webpushNotification.title || data.title || "AYTY Smart HR";
  const body = rootNotification.body || webpushNotification.body || data.body || "";
  const url = data.url || json?.fcmOptions?.link || json?.webpush?.fcm_options?.link || "/";
  const tag = data.tag || webpushNotification.tag || `ayty-notif-${Date.now()}-${Math.random()}`;

  return {
    title,
    options: {
      body,
      icon: webpushNotification.icon || rootNotification.icon || "/pwa-192x192.png",
      badge: webpushNotification.badge || "/pwa-192x192.png",
      sound: webpushNotification.sound || "default",
      vibrate: webpushNotification.vibrate || [200, 100, 200],
      requireInteraction: webpushNotification.requireInteraction ?? false,
      renotify: webpushNotification.renotify ?? true,
      tag,
      data: {
        ...data,
        url,
      },
    },
    badgeValue: data.badge,
  };
}

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let payload = null;
      try {
        payload = event.data ? event.data.json() : null;
      } catch (_) {
        payload = null;
      }

      const normalized = normalizePayload(payload || {});
      await applyBadge(normalized.badgeValue);
      await self.registration.showNotification(normalized.title, normalized.options);
    })(),
  );
});

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url =
    event.notification.data?.url ||
    event.notification.data?.FCM_MSG?.notification?.click_action ||
    "/";
  event.waitUntil(
    (async () => {
      try {
        badgeCount = Math.max(0, badgeCount - 1);
        if (self.navigator && "setAppBadge" in self.navigator) {
          if (badgeCount === 0 && "clearAppBadge" in self.navigator) {
            await self.navigator.clearAppBadge();
          } else {
            await self.navigator.setAppBadge(badgeCount);
          }
        }
      } catch (_) {
        /* ignore */
      }
      const wins = await clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of wins) {
        if ("focus" in w) {
          if (new URL(w.url).origin === self.location.origin) {
            w.navigate(url).catch(() => {});
          }
          return w.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })(),
  );
});

// Allow the page to reset the badge when the app regains focus.
self.addEventListener("message", async (event) => {
  if (event.data && event.data.type === "CLEAR_BADGE") {
    badgeCount = 0;
    try {
      if (self.navigator && "clearAppBadge" in self.navigator) {
        await self.navigator.clearAppBadge();
      }
    } catch (_) {
      /* ignore */
    }
  }
});
