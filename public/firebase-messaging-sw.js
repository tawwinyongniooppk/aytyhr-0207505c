/* eslint-disable no-undef */
// Firebase Cloud Messaging service worker for background pushes.
// We send BOTH `webpush.notification` and `data` from the server:
//  • The browser auto-displays the notification (sound + vibration + system badge)
//    because `notification` is present.
//  • When `notification` is present, Firebase does NOT fire `onBackgroundMessage`,
//    so we additionally hook a raw `push` listener that runs before Firebase's
//    own listener — we use it just to bump the in-app badge counter.
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js");

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

// IMPORTANT: register this BEFORE firebase.messaging() so it runs before
// Firebase's internal push handler. Parse the raw payload so we can honor
// `data.badge` for absolute-count badge updates on iOS/Android PWAs.
self.addEventListener("push", (event) => {
  let badgeVal;
  try {
    const json = event.data ? event.data.json() : null;
    badgeVal = json?.data?.badge;
  } catch (_) {
    badgeVal = undefined;
  }
  event.waitUntil(applyBadge(badgeVal));
});


// ------- Firebase init -------
firebase.initializeApp({
  apiKey: "AIzaSyAH7vLtvyQGhVWQkMscb6OnOR7jI70Zrdk",
  authDomain: "ayty-smart-hr.firebaseapp.com",
  projectId: "ayty-smart-hr",
  messagingSenderId: "795102734433",
  appId: "1:795102734433:web:30955ae4719a0bdb9f2220",
});

const messaging = firebase.messaging();

// Fallback for data-only payloads (rare now that the server includes a
// notification field, but kept so the SW degrades gracefully).
messaging.onBackgroundMessage(async (payload) => {
  const title = payload.notification?.title || payload.data?.title || "AYTY Smart HR";
  const body = payload.notification?.body || payload.data?.body || "";
  const url = payload.data?.url || "/";
  self.registration.showNotification(title, {
    body,
    icon: "/pwa-192x192.png",
    badge: "/pwa-192x192.png",
    sound: "default",
    data: { url },
    tag: payload.data?.tag || "ayty-notif",
    renotify: true,
    vibrate: [200, 100, 200],
    requireInteraction: false,
  });
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
          w.navigate(url).catch(() => {});
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
