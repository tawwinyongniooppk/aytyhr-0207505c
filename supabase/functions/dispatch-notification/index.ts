// Dispatches a notification from public.notifications through send-push.
// Caller must be either the IT Manager who owns the row or the scheduler
// (bearing CRON_SECRET / service-role).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

interface DispatchBody {
  notification_id: string;
}

async function resolveTargets(admin: ReturnType<typeof createClient>, audience: string, ids: string[]) {
  if (audience === "specific") return ids;
  let q = admin.from("profiles").select("id");
  if (audience === "admins") q = q.in("role", ["admin", "assistant"]);
  else if (audience === "staff") q = q.eq("role", "staff");
  else if (audience === "it_managers") q = q.eq("role", "it_manager");
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r: { id: string }) => r.id);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const isCron = CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`;
    const isService = authHeader === `Bearer ${SERVICE_ROLE}`;
    const privileged = isCron || isService;

    let callerId: string | null = null;
    if (!privileged) {
      if (!authHeader.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userClient = createClient(SUPABASE_URL, ANON, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data, error } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
      if (error || !data?.claims) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      callerId = data.claims.sub as string;
      // Must be IT Manager
      const { data: prof } = await userClient.from("profiles").select("role").eq("id", callerId).maybeSingle();
      if (!prof || (prof as { role?: string }).role !== "it_manager") {
        return new Response(JSON.stringify({ error: "forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body = (await req.json().catch(() => ({}))) as DispatchBody;
    const notificationId = String(body.notification_id ?? "");
    if (!notificationId) {
      return new Response(JSON.stringify({ error: "notification_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: notif, error: nerr } = await admin
      .from("notifications").select("*").eq("id", notificationId).maybeSingle();
    if (nerr) throw nerr;
    if (!notif) {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (notif.status === "sent") {
      return new Response(JSON.stringify({ ok: true, already_sent: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve target user ids
    const targetIds = await resolveTargets(
      admin,
      notif.audience,
      (notif.audience_user_ids ?? []) as string[],
    );
    if (!targetIds.length) {
      await admin.from("notifications").update({
        status: "failed", last_error: "no_targets", sent_at: new Date().toISOString(),
      }).eq("id", notificationId);
      return new Response(JSON.stringify({ ok: false, error: "no_targets" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build click-through URL
    let url = "/";
    if (notif.action_type === "internal" && notif.action_target) {
      url = notif.action_target.startsWith("/") ? notif.action_target : `/${notif.action_target}`;
    } else if (notif.action_type === "external" && notif.action_target) {
      url = notif.action_target;
    }

    // Invoke send-push (service-role) so it bypasses caller-target restrictions
    const pushRes = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE}`,
        apikey: SERVICE_ROLE,
      },
      body: JSON.stringify({
        user_ids: targetIds,
        title: notif.title,
        body: notif.body,
        url,
        data: {
          notification_id: notif.id,
          layout: notif.layout,
          icon_key: notif.icon_key,
          banner: notif.banner_url ?? "",
          action_type: notif.action_type,
          action_target: notif.action_target ?? "",
          tag: `notif-${notif.id}`,
        },
      }),
    });
    const pushJson = await pushRes.json().catch(() => ({}));
    const sentCount = Number(pushJson.sent ?? 0);
    const failedCount = Number(pushJson.failed ?? 0);
    const lastError = pushJson.error ? String(pushJson.error) : null;

    const finalStatus = sentCount > 0 ? "sent" : "failed";
    await admin.from("notifications").update({
      status: finalStatus,
      sent_at: new Date().toISOString(),
      sent_count: sentCount,
      failed_count: failedCount,
      last_error: lastError,
    }).eq("id", notificationId);

    return new Response(JSON.stringify({
      ok: sentCount > 0, sent: sentCount, failed: failedCount, targets: targetIds.length, error: lastError,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[dispatch-notification]", e);
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
