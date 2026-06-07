import { createContext, useContext, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useProfile } from "./useProfile";
import { getMessagingSafe, onMessage, requestFcmToken } from "@/lib/firebase";
import { isPushEnabled } from "@/lib/push";
import { toast } from "sonner";

async function showForegroundNotification(title: string, body: string, url: string) {
  try {
    if (typeof window === "undefined" || typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;

    const registration = await navigator.serviceWorker?.getRegistration();
    const options = {
      body,
      icon: "/pwa-192x192.png",
      badge: "/pwa-192x192.png",
      data: { url },
      tag: `fg-${url}-${Date.now()}`,
      vibrate: [200, 100, 200],
    } as NotificationOptions & { vibrate?: number[]; badge?: string };
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

    const syncToken = async (token: string) => {
      try {
        const { data, error } = await supabase.functions.invoke("register-fcm-token", {
          body: { token, user_agent: navigator.userAgent },
        });
        if (error) throw error;
        if ((data as { ok?: boolean })?.ok) {
          console.log("[fcm] Token registered via edge function (service role)");
          return true;
        }
        console.warn("[fcm] register-fcm-token returned non-ok payload", data);
        return false;
      } catch (e) {
        console.error("[fcm] register-fcm-token invoke failed", e);
        return false;
      }
    };

    (async () => {
      try {
        const token = await requestFcmToken();
        if (cancelled) return;
        if (!token) {
          console.warn("[fcm] No token returned (permission denied or unsupported)");
          return;
        }

        // Always send to the edge function — service role guarantees the row lands.
        await syncToken(token);

        const messaging = await getMessagingSafe();
        if (!messaging || cancelled) return;
        unsub = onMessage(messaging, (payload) => {
          const title = payload.notification?.title || payload.data?.title || "Notification";
          const body = payload.notification?.body || payload.data?.body || "";
          const url = payload.data?.url || "/";
          toast(title, { description: body });
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
    const clearBadge = () => {
      if (document.visibilityState !== "visible") return;
      try {
        sessionStorage.setItem("badge_count", "0");
        const nav: any = navigator;
        if (nav && typeof nav.clearAppBadge === "function") {
          nav.clearAppBadge().catch(() => {});
        }
        if (navigator.serviceWorker?.controller) {
          navigator.serviceWorker.controller.postMessage({ type: "CLEAR_BADGE" });
        }
      } catch {
        /* ignore */
      }
    };
    clearBadge();
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
