import { createContext, useContext, useEffect } from "react";
import { useAuth } from "./useAuth";
import { useProfile } from "./useProfile";
import { FCM_SW_SCOPE, getMessagingSafe, getPushAvailability, onMessage, requestFcmToken } from "@/lib/firebase";
import { isPushEnabled, registerCurrentDevicePushToken } from "@/lib/push";
import { toast } from "sonner";

async function showForegroundNotification(title: string, body: string, url: string) {
  try {
    if (typeof window === "undefined" || typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;

    const registration =
      (await navigator.serviceWorker?.getRegistration(FCM_SW_SCOPE)) ||
      (await navigator.serviceWorker?.getRegistration());
    const options = {
      body,
      icon: "/pwa-192x192.png",
      badge: "/pwa-192x192.png",
      data: { url },
      tag: `fg-${url}-${Date.now()}`,
      sound: "default",
      vibrate: [200, 100, 200],
    } as NotificationOptions & { vibrate?: number[]; badge?: string; sound?: string };
    if (registration) {
      await registration.showNotification(title, options as NotificationOptions);
    } else {
      new Notification(title, options);
    }
  } catch (e) {
    console.warn("[fcm] foreground notification failed", e);
  }
}

interface Ctx {
  hasFor: (_route: string) => boolean;
  markRead: (_route: string) => void;
}

const NotificationContext = createContext<Ctx>({
  hasFor: () => false,
  markRead: () => {},
});

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { loading } = useProfile();

  const userId = user?.id;

  useEffect(() => {
    // Register FCM token for EVERY signed-in user (including admin/it_manager).
    if (!userId || loading) return;
    if (!isPushEnabled()) return;

    let unsub: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const availability = await getPushAvailability();
        if (!availability.supported) {
          console.warn("[fcm]", availability.reason ?? "Push notifications are unsupported in this browser/context");
          return;
        }

        const token = await requestFcmToken({ prompt: false });
        if (cancelled) return;
        if (!token) {
          console.warn("[fcm] No token returned (permission not granted yet)");
          return;
        }

        const registered = await registerCurrentDevicePushToken({ prompt: false, token });
        if (!registered.ok) {
          console.warn("[fcm] token sync skipped", registered.reason);
        }

        const messaging = await getMessagingSafe();
        if (!messaging || cancelled) return;
        unsub = onMessage(messaging, (payload) => {
          const title = payload.notification?.title || payload.data?.title || "Notification";
          const body = payload.notification?.body || payload.data?.body || "";
          const url = payload.data?.url || "/";
          toast(title, {
            description: body,
            action: url && url !== "/" ? {
              label: "Open",
              onClick: () => {
                if (/^https?:\/\//i.test(url)) window.open(url, "_blank", "noopener");
                else window.location.assign(url);
              },
            } : undefined,
          });
          showForegroundNotification(title, body, url);
          try {
            const nav: any = navigator;
            if (nav && typeof nav.setAppBadge === "function") {
              const next = (Number(sessionStorage.getItem("badge_count") || "0") || 0) + 1;
              sessionStorage.setItem("badge_count", String(next));
              nav.setAppBadge(next).catch(() => {});
            }
          } catch {
            /* ignore */
          }
        });
      } catch (e) {
        console.error("[fcm] init flow failed", e);
      }
    })();

    // Clear icon badge whenever the app regains focus (native-app behaviour).
    const clearBadge = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        sessionStorage.setItem("badge_count", "0");
        const nav: any = navigator;
        if (nav && typeof nav.clearAppBadge === "function") {
          nav.clearAppBadge().catch(() => {});
        }
        const registration = await navigator.serviceWorker?.getRegistration(FCM_SW_SCOPE);
        if (registration?.active) {
          registration.active.postMessage({ type: "CLEAR_BADGE" });
        }
      } catch {
        /* ignore */
      }
    };
    void clearBadge();
    document.addEventListener("visibilitychange", clearBadge);
    window.addEventListener("focus", clearBadge);

    return () => {
      cancelled = true;
      if (unsub) unsub();
      document.removeEventListener("visibilitychange", clearBadge);
      window.removeEventListener("focus", clearBadge);
    };
  }, [userId, loading]);

  return (
    <NotificationContext.Provider value={{ hasFor: () => false, markRead: () => {} }}>
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationContext);
