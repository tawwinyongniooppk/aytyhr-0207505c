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

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || payload.data?.title || "AYTY Smart HR";
  const body = payload.notification?.body || payload.data?.body || "";
  const url = payload.data?.url || "/";
  self.registration.showNotification(title, {
    body,
    icon: "/pwa-192x192.png",
    badge: "/pwa-192x192.png",
    data: { url },
    tag: payload.data?.tag || "ayty-notif",
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ("focus" in w) {
          w.navigate(url).catch(() => {});
          return w.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    }),
  );
});
