import { createContext, useContext, useEffect, useRef } from "react"; // useRef ထည့်သွင်းထားပါတယ်
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

  // အကြိမ်ကြိမ် DB ထဲ သွားမသိမ်းအောင် Token ကို မှတ်ထားမယ့် Ref
  const lastSyncedTokenRef = useRef<string | null>(null);

  // Object အစား Primitive String ကိုပဲ သုံးဖို့ id ကို သီးသန့်ထုတ်ယူပါတယ်
  const userId = user?.id;

  useEffect(() => {
    if (!userId || loading || isItManager) return;
    if (!isPushEnabled()) return;
    let unsub: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      const token = await requestFcmToken();
      if (cancelled || !token) return;

      // အကယ်၍ ဒီ Token ကို အခု Session ထဲမှာ သိမ်းပြီးသားဆိုရင် DB Query ထပ်မလုပ်ဘဲ ကျော်သွားမယ်
      if (lastSyncedTokenRef.current === token) return;

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

        // သိမ်းဆည်းခြင်း အောင်မြင်ရင် Ref ထဲမှာ မှတ်သားထားလိုက်မယ်
        lastSyncedTokenRef.current = token;
        console.log("[fcm] Token synced successfully");
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
  }, [userId, loading, isItManager]); // user နေရာမှာ userId ကို ပြောင်းလဲထားပါတယ်

  return (
    <NotificationContext.Provider value={{ hasFor: () => false, markRead: () => {} }}>
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationContext);
