import { createContext, useContext, useEffect, useRef } from "react"; // useRef ထည့်သွင်းထားပါတယ်
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
    if (registration) {
      await registration.showNotification(title, {
        body,
        icon: "/pwa-192x192.png",
        badge: "/pwa-192x192.png",
        data: { url },
        tag: `fg-${url}-${Date.now()}`,
        renotify: true,
        vibrate: [200, 100, 200],
      });
    } else {
      new Notification(title, { body, icon: "/pwa-192x192.png", tag: `fg-${Date.now()}` });
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
  const { isItManager, loading } = useProfile();

  // Persist across remounts within the tab so we never re-upsert the same token.
  const SYNC_KEY = "fcm_synced_token";
  const inFlightRef = useRef(false);

  const userId = user?.id;

  useEffect(() => {
    if (!userId || loading || isItManager) return;
    if (!isPushEnabled()) return;
    if (inFlightRef.current) return;

    let unsub: (() => void) | undefined;
    let cancelled = false;
    inFlightRef.current = true;

    (async () => {
      try {
        const token = await requestFcmToken();
        if (cancelled || !token) return;

        const cacheKey = `${SYNC_KEY}:${userId}`;
        const alreadySynced =
          typeof sessionStorage !== "undefined" && sessionStorage.getItem(cacheKey) === token;

        if (!alreadySynced) {
          try {
            await supabase.from("fcm_tokens").upsert(
              {
                user_id: userId,
                token,
                user_agent: navigator.userAgent,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "token" },
            );
            try {
              sessionStorage.setItem(cacheKey, token);
            } catch {
              /* ignore */
            }
            console.log("[fcm] Token synced");
          } catch (e) {
            console.error("[fcm] token upsert failed", e);
          }
        }

        const messaging = await getMessagingSafe();
        if (!messaging || cancelled) return;
        unsub = onMessage(messaging, (payload) => {
          const title = payload.notification?.title || payload.data?.title || "Notification";
          const body = payload.notification?.body || payload.data?.body || "";
          const url = payload.data?.url || "/";
          toast(title, { description: body });
          showForegroundNotification(title, body, url);
          // Native-style icon badge for foreground messages too.
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
      } finally {
        if (cancelled) inFlightRef.current = false;
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
      inFlightRef.current = false;
      if (unsub) unsub();
      document.removeEventListener("visibilitychange", clearBadge);
      window.removeEventListener("focus", clearBadge);
    };
  }, [userId, loading, isItManager]);

  return (
    <NotificationContext.Provider value={{ hasFor: () => false, markRead: () => {} }}>
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationContext);
