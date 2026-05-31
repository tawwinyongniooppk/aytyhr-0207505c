import { supabase } from "@/integrations/supabase/client";

export const PUSH_ENABLED_KEY = "push_enabled";

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
