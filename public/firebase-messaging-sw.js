/* eslint-disable no-undef */
// Firebase Cloud Messaging service worker for background pushes.
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyAH7vLtvyQGhVWQkMscb6OnOR7jI70Zrdk",
  authDomain: "ayty-smart-hr.firebaseapp.com",
  projectId: "ayty-smart-hr",
  messagingSenderId: "795102734433",
  appId: "1:795102734433:web:30955ae4719a0bdb9f2220",
});

const messaging = firebase.messaging();

// Native-style app icon badge counter (Badging API).
let badgeCount = 0;
async function bumpBadge() {
  badgeCount += 1;
  try {
    if (self.navigator && "setAppBadge" in self.navigator) {
      await self.navigator.setAppBadge(badgeCount);
    }
  } catch (_) {
    /* ignore */
  }
}

messaging.onBackgroundMessage(async (payload) => {
  const title = payload.notification?.title || payload.data?.title || "AYTY Smart HR";
  const body = payload.notification?.body || payload.data?.body || "";
  const url = payload.data?.url || "/";
  await bumpBadge();
  self.registration.showNotification(title, {
    body,
    icon: "/pwa-192x192.png",
    badge: "/pwa-192x192.png",
    data: { url },
    tag: payload.data?.tag || "ayty-notif",
    renotify: true,
    vibrate: [200, 100, 200],
    requireInteraction: false,
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    (async () => {
      // Decrement badge when user taps the notification.
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
          w.navigate(url).catch(() => {});
          return w.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })(),
  );
});

// Allow the page to reset the badge (e.g. when the app regains focus).
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
