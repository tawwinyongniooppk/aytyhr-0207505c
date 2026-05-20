import { createContext, useContext, useEffect } from "react";
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

  useEffect(() => {
    if (!user || loading || isItManager) return;
    if (!isPushEnabled()) return;
    let unsub: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      const token = await requestFcmToken();
      if (cancelled || !token) return;

      try {
        await supabase.from("fcm_tokens").upsert(
          {
            user_id: user.id,
            token,
            user_agent: navigator.userAgent,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "token" },
        );
      } catch (e) {
        console.error("[fcm] token upsert failed", e);
      }

      const messaging = await getMessagingSafe();
      if (!messaging || cancelled) return;
      const off = onMessage(messaging, (payload) => {
        const title = payload.notification?.title || payload.data?.title || "Notification";
        const body = payload.notification?.body || payload.data?.body || "";
        toast(title, { description: body });
      });
      unsub = off;
    })();

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, [user, loading, isItManager]);

  return (
    <NotificationContext.Provider value={{ hasFor: () => false, markRead: () => {} }}>
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationContext);
