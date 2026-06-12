import { supabase } from "@/integrations/supabase/client";
import { getPushAvailability, requestFcmToken } from "@/lib/firebase";

export const PUSH_ENABLED_KEY = "push_enabled";
export const PUSH_TOKEN_KEY = "push_device_token";

export function isPushEnabled(): boolean {
  if (typeof localStorage === "undefined") return true;
  const v = localStorage.getItem(PUSH_ENABLED_KEY);
  return v === null ? true : v === "true";
}

export function setPushEnabled(enabled: boolean) {
  try {
    localStorage.setItem(PUSH_ENABLED_KEY, enabled ? "true" : "false");
  } catch {
    /* ignore */
  }
}

export function getStoredPushToken(): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(PUSH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredPushToken(token: string | null) {
  if (typeof localStorage === "undefined") return;
  try {
    if (token) localStorage.setItem(PUSH_TOKEN_KEY, token);
    else localStorage.removeItem(PUSH_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export async function registerCurrentDevicePushToken(options: { prompt?: boolean } = {}) {
  const availability = await getPushAvailability();
  if (!availability.supported) {
    return { ok: false as const, reason: availability.reason ?? "Push notifications are unavailable." };
  }

  const token = await requestFcmToken({ prompt: options.prompt ?? false });
  if (!token) {
    const permissionReason =
      typeof Notification !== "undefined" && Notification.permission !== "granted"
        ? "Please allow notification permission for this device."
        : "Could not get a notification token for this device.";
    return { ok: false as const, reason: permissionReason };
  }

  const { data, error } = await supabase.functions.invoke("register-fcm-token", {
    body: { token, user_agent: navigator.userAgent },
  });

  if (error) {
    throw error;
  }

  if (!(data as { ok?: boolean } | null)?.ok) {
    throw new Error("Token registration failed");
  }

  setStoredPushToken(token);
  return { ok: true as const, token };
}

export async function unregisterCurrentDevicePushToken() {
  const storedToken = getStoredPushToken();

  if (storedToken) {
    const { error } = await supabase.from("fcm_tokens").delete().eq("token", storedToken);
    if (error) throw error;
  }

  setStoredPushToken(null);
  return { ok: true as const };
}

/**
 * Fire-and-forget push notification. Per-recipient opt-out is enforced by
 * removing the FCM token from the database on the recipient's device, so the
 * sender does not need to check preferences.
 */
export async function sendPush(args: {
  user_ids: string[];
  title: string;
  body: string;
  url?: string;
  data?: Record<string, string>;
}) {
  const ids = (args.user_ids || []).filter(Boolean);
  if (!ids.length) return { ok: false, error: "No recipients" };
  try {
    const { data, error } = await supabase.functions.invoke("send-push", {
      body: {
        user_ids: ids,
        title: args.title,
        body: args.body,
        url: args.url ?? "/",
        data: args.data ?? {},
      },
    });
    if (error) throw error;
    const payload = data as { ok?: boolean; error?: string } | null;
    if (payload?.ok === false) {
      return { ok: false, error: payload.error ?? "Push delivery failed", data };
    }
    return { ok: true, data };
  } catch (e) {
    console.error("[push] send failed", e);
    return { ok: false, error: e };
  }
}

let cachedAdminIds: { ids: string[]; ts: number } | null = null;
const ADMIN_CACHE_MS = 60_000;

export async function getAdminUserIds(): Promise<string[]> {
  const now = Date.now();
  if (cachedAdminIds && now - cachedAdminIds.ts < ADMIN_CACHE_MS) {
    return cachedAdminIds.ids;
  }
  // Use the SECURITY DEFINER RPC so non-admin staff can still resolve
  // admin IDs without direct SELECT access to other users' profile rows.
  const { data } = await supabase.rpc("list_public_profiles");
  const ids = ((data as { id: string; role: string }[]) || [])
    .filter((r) => r.role === "admin" || r.role === "assistant")
    .map((r) => r.id);
  cachedAdminIds = { ids, ts: now };
  return ids;
}

export async function notifyAdmins(title: string, body: string, url = "/") {
  const ids = await getAdminUserIds();
  if (ids.length) await sendPush({ user_ids: ids, title, body, url });
}
