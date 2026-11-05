import { createContext, useContext, useEffect, useState, useRef, useCallback } from "react";
import { useAuth } from "./useAuth";
import { useProfile } from "./useProfile";
import { FCM_SW_SCOPE, getMessagingSafe, getPushAvailability, onMessage } from "@/lib/firebase";
import { isPushEnabled, registerCurrentDevicePushToken, setPushEnabled, unregisterCurrentDevicePushToken } from "@/lib/push";
import { attendanceNotificationsReady, currentNotificationPermission, type NotificationSetupStatus } from "@/lib/notificationSetup";
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
      tag: `fg-${crypto.randomUUID?.() ?? Date.now()}`,
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
  setupStatus: NotificationSetupStatus;
  setupError: string | null;
  pushEnabled: boolean;
  enableNotifications: (prompt?: boolean) => Promise<{ ok: boolean; reason?: string }>;
  disableNotifications: () => Promise<void>;
  attendanceReady: () => boolean;
}

const NotificationContext = createContext<Ctx>({
  hasFor: () => false,
  markRead: () => {},
  setupStatus: "incomplete",
  setupError: null,
  pushEnabled: true,
  enableNotifications: async () => ({ ok: false, reason: "Notification setup is unavailable." }),
  disableNotifications: async () => {},
  attendanceReady: () => false,
});

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { loading } = useProfile();

  const userId = user?.id;
  const [setupStatus, setSetupStatus] = useState<NotificationSetupStatus>("checking");
  const [setupError, setSetupError] = useState<string | null>(null);
  const [pushEnabled, setEnabled] = useState(isPushEnabled);
  const currentUser = useRef(userId);
  currentUser.current = userId;
  const confirmedUser = useRef<string | null>(null);
  const inFlight = useRef<{ userId: string; promise: Promise<{ ok: boolean; reason?: string }> } | null>(null);

  const attendanceReady = useCallback(() =>
    !!userId && confirmedUser.current === userId &&
    attendanceNotificationsReady(setupStatus, isPushEnabled(), currentNotificationPermission()),
  [userId, setupStatus]);

  const enableNotifications = useCallback((prompt = true): Promise<{ ok: boolean; reason?: string }> => {
    if (!userId) return Promise.resolve({ ok: false, reason: "Please sign in first." });
    if (inFlight.current?.userId === userId) return inFlight.current.promise;
    if (confirmedUser.current === userId && isPushEnabled() && currentNotificationPermission() === "granted") {
      return Promise.resolve({ ok: true });
    }
    const owner = userId;
    setSetupStatus("checking");
    setSetupError(null);
    const promise = (async () => {
      try {
        const availability = await getPushAvailability();
        if (!availability.supported) {
          if (currentUser.current === owner) {
            setSetupStatus("unsupported");
            setSetupError(availability.reason ?? "Push notifications are unavailable on this device.");
          }
          return { ok: false, reason: availability.reason };
        }
        const result = await registerCurrentDevicePushToken({ prompt });
        if (currentUser.current !== owner) return { ok: false, reason: "The signed-in account changed. Please retry." };
        if (currentNotificationPermission() !== "granted") {
          confirmedUser.current = null;
          setSetupStatus("incomplete");
          return { ok: false, reason: "Notification permission is required." };
        }
        if (!result.ok) {
          confirmedUser.current = null;
          setSetupStatus(currentNotificationPermission() === "granted" ? "failed" : "incomplete");
          setSetupError(result.reason);
          return result;
        }
        setPushEnabled(true);
        setEnabled(true);
        confirmedUser.current = owner;
        setSetupStatus("ready");
        return { ok: true };
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Device registration failed. Please retry.";
        if (currentUser.current === owner) {
          confirmedUser.current = null;
          setSetupStatus("failed");
          setSetupError(reason);
        }
        return { ok: false, reason };
      } finally {
        if (inFlight.current?.userId === owner) inFlight.current = null;
      }
    })();
    inFlight.current = { userId: owner, promise };
    return promise;
  }, [userId]);

  const disableNotifications = useCallback(async () => {
    if (inFlight.current) await inFlight.current.promise;
    await unregisterCurrentDevicePushToken();
    setPushEnabled(false);
    setEnabled(false);
    confirmedUser.current = null;
    setSetupStatus("incomplete");
    setSetupError(null);
  }, []);

  useEffect(() => {
    confirmedUser.current = null;
    setEnabled(isPushEnabled());
    setSetupStatus("incomplete");
    setSetupError(null);
    if (!userId || loading) return;
    let previousPermission = currentNotificationPermission();
    if (isPushEnabled()) void enableNotifications(false);
    const recheck = () => {
      if (document.hidden) return;
      const permission = currentNotificationPermission();
      const changed = permission !== previousPermission;
      previousPermission = permission;
      setEnabled(isPushEnabled());
      if (permission !== "granted" || !isPushEnabled()) {
        confirmedUser.current = null;
        setSetupStatus("incomplete");
      } else if (changed) {
        void enableNotifications(false);
      }
    };
    let permissionStatus: PermissionStatus | undefined;
    let cancelled = false;
    if (navigator.permissions) {
      void navigator.permissions.query({ name: "notifications" as PermissionName }).then((status) => {
        if (cancelled) return;
        permissionStatus = status;
        status.addEventListener("change", recheck);
      }).catch(() => {});
    }
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);
    const onStorage = (event: StorageEvent) => {
      if (event.key === "push_enabled") recheck();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      cancelled = true;
      permissionStatus?.removeEventListener("change", recheck);
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", recheck);
      window.removeEventListener("storage", onStorage);
    };
  }, [userId, loading, enableNotifications]);

  useEffect(() => {
    // Registration is shared by startup, settings, tests, and Attendance setup.
    if (!userId || loading || setupStatus !== "ready" || !pushEnabled) return;

    let unsub: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
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
          // The messaging worker displays the system notification exactly
          // once in both foreground and background; this handler owns toast.
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
  }, [userId, loading, setupStatus, pushEnabled]);

  return (
    <NotificationContext.Provider value={{ hasFor: () => false, markRead: () => {}, setupStatus, setupError, pushEnabled, enableNotifications, disableNotifications, attendanceReady }}>
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationContext);
