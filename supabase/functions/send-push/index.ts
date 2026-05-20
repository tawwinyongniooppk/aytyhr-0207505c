// Sends FCM v1 push notifications to one or more users via their stored tokens.
// Auth: requires a logged-in admin/assistant/it_manager OR service_role.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

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
    const userIds: string[] = Array.isArray(body.user_ids) ? body.user_ids : [];
    const title: string = String(body.title ?? "Notification");
    const message: string = String(body.body ?? "");
    const url: string = String(body.url ?? "/");
    const data: Record<string, string> = body.data ?? {};

    if (!userIds.length) {
      return new Response(JSON.stringify({ error: "user_ids required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auth check: privileged role OR service-role key.
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
      const { data: prof } = await userClient
        .from("profiles")
        .select("role")
        .eq("id", who.user.id)
        .maybeSingle();
      if (!prof || !["admin", "assistant", "it_manager"].includes(prof.role)) {
        return new Response(JSON.stringify({ error: "forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: tokens, error } = await admin
      .from("fcm_tokens")
      .select("token")
      .in("user_id", userIds);
    if (error) throw error;
    if (!tokens?.length) {
      return new Response(JSON.stringify({ sent: 0, failed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sa: ServiceAccount = JSON.parse(SERVICE_ACCOUNT_RAW);
    const accessToken = await getAccessToken(sa);
    const endpoint = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;

    const stale: string[] = [];
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
              notification: { title, body: message },
              data: { url, title, body: message, ...data },
              webpush: { fcm_options: { link: url } },
            },
          }),
        });
        if (res.ok) {
          sent++;
        } else {
          failed++;
          const txt = await res.text();
          if (res.status === 404 || res.status === 400 || /UNREGISTERED|INVALID_ARGUMENT/i.test(txt)) {
            stale.push(row.token);
          }
        }
      }),
    );

    if (stale.length) {
      await admin.from("fcm_tokens").delete().in("token", stale);
    }

    return new Response(JSON.stringify({ sent, failed, pruned: stale.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[send-push]", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
