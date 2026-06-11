import { initializeApp, getApps, getApp } from "firebase/app";
import { getMessaging, getToken, onMessage, isSupported, type Messaging } from "firebase/messaging";

export const FCM_SW_PATH = "/firebase-messaging-sw.js";
export const FCM_SW_SCOPE = "/firebase-cloud-messaging-push-scope/";

const PREVIEW_HOST_SUFFIXES = [
  ".lovableproject.com",
  ".lovableproject-dev.com",
  ".beta.lovable.dev",
];

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

function isPreviewHost(host: string) {
  return (
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "lovableproject.com" ||
    host === "lovableproject-dev.com" ||
    host === "beta.lovable.dev" ||
    PREVIEW_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
  );
}

export async function getPushAvailability(): Promise<{ supported: boolean; reason?: string }> {
  if (typeof window === "undefined") {
    return { supported: false, reason: "Push notifications are unavailable during server rendering." };
  }

  try {
    if (window.self !== window.top) {
      return {
        supported: false,
        reason: "Push notifications cannot be enabled inside the preview frame. Open the published app directly on your device.",
      };
    }
  } catch {
    return {
      supported: false,
      reason: "Push notifications cannot be enabled inside the preview frame. Open the published app directly on your device.",
    };
  }

  if (isPreviewHost(window.location.hostname)) {
    return {
      supported: false,
      reason: "Push notifications do not work reliably on the preview URL. Open the published app directly on your device.",
    };
  }

  if (!window.isSecureContext) {
    return { supported: false, reason: "Push notifications require a secure HTTPS page." };
  }

  if (typeof Notification === "undefined" || !("serviceWorker" in navigator)) {
    return { supported: false, reason: "This browser does not support web push notifications." };
  }

  try {
    if (!(await isSupported())) {
      return { supported: false, reason: "This browser does not support Firebase web push notifications." };
    }
  } catch {
    return { supported: false, reason: "This browser does not support Firebase web push notifications." };
  }

  return { supported: true };
}

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
        const availability = await getPushAvailability();
        if (!availability.supported) return null;
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

export async function requestFcmToken(options: { prompt?: boolean } = {}): Promise<string | null> {
  const { prompt = true } = options;
  const availability = await getPushAvailability();
  if (!availability.supported) {
    console.warn("[fcm]", availability.reason ?? "Push notifications are unsupported in this browser/context");
    return null;
  }

  const messaging = await getMessagingSafe();
  if (!messaging) return null;

  let permission = Notification.permission;
  if (permission === "default" && prompt) {
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
