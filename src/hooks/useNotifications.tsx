import { createContext, useContext, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useProfile } from "./useProfile";
import { getMessagingSafe, onMessage, requestFcmToken } from "@/lib/firebase";
import { isPushEnabled } from "@/lib/push";
import { toast } from "sonner";

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
        const alreadySynced = typeof sessionStorage !== "undefined" && sessionStorage.getItem(cacheKey) === token;

        if (!alreadySynced) {
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
          } catch {}
        }

        const messaging = await getMessagingSafe();
        if (!messaging || cancelled) return;

        unsub = onMessage(messaging, (payload) => {
          const title = payload.notification?.title || payload.data?.title || "Notification";
          const body = payload.notification?.body || payload.data?.body || "";
          toast(title, { description: body });
        });
      } finally {
        if (cancelled) inFlightRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
      inFlightRef.current = false;
      if (unsub) unsub();
    };
  }, [userId, loading, isItManager]);

  return (
    <NotificationContext.Provider value={{ hasFor: () => false, markRead: () => {} }}>
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationContext);
