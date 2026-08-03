// Periodic sweep: sends any notification whose scheduled_at has passed.
// Authorized via CRON_SECRET or service-role.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const verifier = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: secretMatches } = bearer && bearer !== SERVICE_ROLE
    ? await verifier.rpc("verify_cron_secret", { p_candidate: bearer })
    : { data: false };
  const ok = authHeader === `Bearer ${SERVICE_ROLE}` || secretMatches === true;
  if (!ok) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const nowIso = new Date().toISOString();
    const { data: due, error } = await admin
      .from("notifications")
      .select("id")
      .eq("status", "scheduled")
      .lte("scheduled_at", nowIso)
      .limit(50);
    if (error) throw error;

    const results: Array<{ id: string; ok: boolean }> = [];
    for (const row of due ?? []) {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/dispatch-notification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_ROLE}`,
          apikey: SERVICE_ROLE,
        },
        body: JSON.stringify({ notification_id: row.id }),
      });
      const j = await res.json().catch(() => ({}));
      results.push({ id: row.id, ok: !!j.ok });
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[notification-scheduler]", e);
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
