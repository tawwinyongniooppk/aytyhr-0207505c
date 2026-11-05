// Sends FCM v1 push notifications to one or more users via their stored tokens.
// Auth: requires a logged-in admin/assistant/it_manager OR service_role.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { parseStaffEvent, verifyStaffEventRecord, isUnregisteredFcmError } from "./eventRules.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SERVICE_ACCOUNT_RAW = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON")!;

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

let cachedToken: { value: string; exp: number } | null = null;

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

function b64url(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp > now + 60) return cachedToken.value;

  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)),
  );
  const jwt = `${unsigned}.${b64url(sig)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`oauth ${res.status} ${await res.text()}`);
  const json = await res.json();
  cachedToken = { value: json.access_token, exp: now + (json.expires_in ?? 3600) };
  return cachedToken.value;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    let userIds: string[] = Array.isArray(body.user_ids) ? Array.from(new Set(body.user_ids)) : [];
    let title: string = String(body.title ?? "Notification");
    let message: string = String(body.body ?? "");
    let url: string = String(body.url ?? "/");
    let data: Record<string, string> = body.data ?? {};
    const event = body.event ? parseStaffEvent(body.event) : null;
    if (body.event && !event) return new Response(JSON.stringify({ error: "invalid_event" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
    // A unique tag keeps each push visible instead of replacing an older one.
    // The notification id remains embedded for diagnostics without being used
    // as the browser's replacement key.
    const notificationTag = `${String(data.tag ?? "ayty-notif")}-${crypto.randomUUID()}`;
    const banner = String(data.banner ?? "");

    if (!event && !userIds.length) {
      return new Response(JSON.stringify({ error: "user_ids required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[send-push] request", { userIds, title, url });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    // Arbitrary staff messages remain self-only. Event notifications are
    // separately verified against the caller's recent HR record.
    const authHeader = req.headers.get("Authorization") ?? "";
    const isServiceRole = authHeader === `Bearer ${SERVICE_ROLE}`;
    if (!isServiceRole) {
      const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: who } = await userClient.auth.getUser();
      if (!who.user) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const callerId = who.user.id;
      const { data: prof } = await userClient
        .from("profiles")
        .select("role")
        .eq("id", callerId)
        .maybeSingle();
      const callerRole = (prof as { role?: string } | null)?.role ?? "";
      const isPrivileged = ["admin", "assistant", "it_manager"].includes(callerRole);

      if (event) {
        const table = event.type.startsWith("attendance_") ? "attendance"
          : event.type === "leave_requested" ? "leave_requests"
          : event.type === "overtime_requested" ? "overtime_requests" : event.source;
        if (!table) throw new Error("invalid_event_source");
        const columns = table === "attendance" ? "id,user_id,date,check_in_time,check_out_time,late_minutes,early_minutes"
          : table === "leave_requests" ? "id,user_id,created_at,status,type,half_period,date"
          : table === "overtime_requests" ? "id,user_id,created_at,status,title"
          : table === "tasks" ? "id,assignee_id,submission_status,submitted_at,title"
          : "id,user_id,submission_status,submitted_at";
        const { data: record, error: recordError } = await admin.from(table).select(columns).eq("id", event.record_id).maybeSingle();
        if (recordError) throw recordError;
        if (!record || !verifyStaffEventRecord(event, record as unknown as Record<string, unknown>, callerId)) {
          return new Response(JSON.stringify({ error: "unverified_event" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const row = record as unknown as Record<string, any>;
        const { data: people, error: peopleError } = await admin.from("profiles")
          .select("id,full_name,role,late_deduction_per_minute,deduction_rate_per_minute")
          .or(`id.eq.${callerId},role.in.(admin,assistant)`);
        if (peopleError) throw peopleError;
        const person = people?.find((p) => p.id === callerId);
        const name = person?.full_name || "Staff";
        userIds = (people ?? []).filter((p) => p.role === "admin" || p.role === "assistant").map((p) => p.id);
        data = {};
        if (event.type === "attendance_check_in") {
          const minutes = Number(row.late_minutes) || 0;
          const rate = Number(person?.late_deduction_per_minute) || Number(person?.deduction_rate_per_minute) || 200;
          title = "Staff checked in";
          message = `${name} checked in${minutes > 0 ? ` (${minutes} charged min · -${(minutes * rate).toLocaleString()} Ks)` : " on time"}`;
          url = "/attendance";
        } else if (event.type === "attendance_check_out") {
          const { data: leaves, error: leaveError } = await admin.from("leave_requests").select("type").eq("user_id", callerId).eq("date", row.date).eq("status", "approved");
          if (leaveError) throw leaveError;
          const excuse = leaves?.some((l) => l.type === "leave") ? " (Leave approved)" : leaves?.some((l) => l.type === "late_excuse") ? " (Late excused)" : "";
          title = "Staff checked out";
          const minutes = Number(row.early_minutes) || 0;
          message = `${name} checked out${minutes > 0 ? ` (${minutes} min early)` : ""}${excuse}`;
          url = "/attendance";
        } else if (event.type === "leave_requested") {
          const typeText = row.type === "half_leave" ? (row.half_period === "morning" ? "Morning Half-Leave" : "Afternoon Half-Leave")
            : row.type === "partial_leave" ? "Partial Leave" : "Full Leave";
          title = "New leave request";
          message = `${name} requested ${typeText} on ${row.date}`;
          url = "/leave";
        } else if (event.type === "overtime_requested") {
          title = "New overtime request";
          message = `${name} requested OT: ${row.title}`;
          url = "/leave";
        } else {
          const resubmit = event.type === "task_resubmitted";
          title = resubmit ? "Task resubmitted" : "Task submitted for review";
          message = event.source === "tasks" ? `${name} ${resubmit ? "resubmitted" : "submitted"}: ${row.title ?? "a task"}` : `${name} ${resubmit ? "resubmitted" : "submitted"} a task`;
          url = "/tasks";
        }
      }

      if (!isPrivileged && !event) {
        // Non-privileged users may only send pushes to themselves (e.g. test pushes).
        const allAllowed = userIds.every((id) => id === callerId);
        if (!allAllowed) {
          return new Response(JSON.stringify({ error: "forbidden_targets" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }


    if (!userIds.length) return new Response(JSON.stringify({ ok: false, error: "no_targets" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { data: tokens, error } = await admin
      .from("fcm_tokens")
      .select("token, user_id")
      .in("user_id", userIds);
    if (error) throw error;
    console.log("[send-push] token lookup", { userIds, tokenCount: tokens?.length ?? 0 });
    if (!tokens?.length) {
      return new Response(JSON.stringify({ ok: false, sent: 0, failed: 0, recipients: 0, error: "no_registered_tokens" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sa: ServiceAccount = JSON.parse(SERVICE_ACCOUNT_RAW);
    const accessToken = await getAccessToken(sa);
    const endpoint = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;

    const stale: string[] = [];
    const reached = new Set<string>();
    let sent = 0;
    let failed = 0;


    await Promise.all(
      tokens.map(async (row) => {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: {
              token: row.token,
              // Top-level notification → ensures Android/iOS treat this as a
              // user-visible push (required for sound/vibration on some OEMs).
              notification: { title, body: message },
              // `data` keeps fields available for our SW handler, foreground
              // toast, and badge counting (absolute count via `badge` key).
              data: {
                url,
                title,
                body: message,
                badge: String(data.badge ?? ""),
                ...data,
              },
              webpush: {
                headers: { Urgency: "high", TTL: "300" },
                notification: {
                  title,
                  body: message,
                  icon: "/pwa-192x192.png",
                  badge: "/pwa-192x192.png",
                  sound: "default",
                  vibrate: [200, 100, 200],
                  requireInteraction: false,
                  tag: notificationTag,
                  renotify: true,
                  ...(banner ? { image: banner } : {}),
                },
                // FCM requires an absolute HTTPS link. Internal routes are
                // already carried in data.url for the existing click handler.
                ...(/^https:\/\//i.test(url) ? { fcm_options: { link: url } } : {}),
              },
            },
          }),


        });
        if (res.ok) {
          sent++;
          reached.add(row.user_id as string);
        } else {
          const txt = await res.text();
          console.error("[send-push] FCM send failed", { status: res.status, token: String(row.token).slice(0, 16), body: txt });
          if (isUnregisteredFcmError(txt)) {
            // Dead device token (app removed / browser data cleared).
            // It is pruned here, so it is not reported as a delivery failure.
            stale.push(row.token as string);
          } else {
            failed++;
          }
        }
      }),
    );

    if (stale.length) {
      await admin.from("fcm_tokens").delete().in("token", stale);
    }

    return new Response(
      JSON.stringify({ ok: sent > 0, sent, failed, pruned: stale.length, recipients: reached.size }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (e) {
    console.error("[send-push]", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
