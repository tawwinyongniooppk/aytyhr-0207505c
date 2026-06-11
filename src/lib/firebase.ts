import { initializeApp, getApps, getApp } from "firebase/app";
import { getMessaging, getToken, onMessage, isSupported, type Messaging } from "firebase/messaging";

export const FCM_SW_PATH = "/firebase-messaging-sw.js";
export const FCM_SW_SCOPE = "/firebase-cloud-messaging-push-scope/";

export const firebaseConfig = {
  apiKey: "AIzaSyAH7vLtvyQGhVWQkMscb6OnOR7jI70Zrdk",
  authDomain: "ayty-smart-hr.firebaseapp.com",
  projectId: "ayty-smart-hr",
  messagingSenderId: "795102734433",
  appId: "1:795102734433:web:30955ae4719a0bdb9f2220",
};

export const VAPID_KEY =
  "BOC206GaQ8HHd8jcOx1u4dfP7lAp_Ow5_rhfg7CFW-SzjY8CTIusqgzsK4zDyDPhImrSZAEnAZ1kMGm7YlmEDI0";

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

let messagingPromise: Promise<Messaging | null> | null = null;

function getRegistrationScriptUrl(registration: ServiceWorkerRegistration | undefined | null) {
  return (
    registration?.active?.scriptURL ||
    registration?.waiting?.scriptURL ||
    registration?.installing?.scriptURL ||
    ""
  );
}

function isMessagingWorker(registration: ServiceWorkerRegistration | undefined | null) {
  return getRegistrationScriptUrl(registration).endsWith(FCM_SW_PATH);
}

export async function getMessagingSafe(): Promise<Messaging | null> {
  if (typeof window === "undefined") return null;
  if (!messagingPromise) {
    messagingPromise = (async () => {
      try {
        if (!(await isSupported())) return null;
        return getMessaging(firebaseApp);
      } catch {
        return null;
      }
    })();
  }
  return messagingPromise;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration(FCM_SW_SCOPE);
    if (isMessagingWorker(existing)) return existing;

    const rootRegistration = await navigator.serviceWorker.getRegistration("/");
    if (isMessagingWorker(rootRegistration)) {
      await rootRegistration?.unregister().catch(() => false);
    }

    return await navigator.serviceWorker.register(FCM_SW_PATH, { scope: FCM_SW_SCOPE });
  } catch (e) {
    console.error("[fcm] sw register failed", e);
    return null;
  }
}

export async function requestFcmToken(): Promise<string | null> {
  const messaging = await getMessagingSafe();
  if (!messaging) return null;
  if (typeof Notification === "undefined") return null;

  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") return null;

  const swReg = await registerServiceWorker();
  if (!swReg) return null;

  try {
    return await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg,
    });
  } catch (e) {
    console.error("[fcm] getToken failed", e);
    return null;
  }
}

export { onMessage };
