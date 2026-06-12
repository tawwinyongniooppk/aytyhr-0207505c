// Registers an FCM token for the authenticated user using the SERVICE ROLE
// client so RLS can never block the write. The token is the unique key — if
// it already exists (possibly bound to another user on a shared device), we
// rebind it to the currently authenticated user.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// Admin client — bypasses RLS. Used for ALL writes to fcm_tokens.
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller identity using the user's JWT.
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: who, error: whoErr } = await userClient.auth.getUser();
    if (whoErr || !who?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = who.user.id;

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const token = typeof body.token === "string" ? body.token.trim() : "";
    const userAgent = typeof body.user_agent === "string" ? body.user_agent : "";
    console.log("[register-fcm-token] request", { userId, hasToken: !!token, tokenLength: token.length });
    if (!token || token.length < 20) {
      return new Response(JSON.stringify({ error: "invalid_token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const nowIso = new Date().toISOString();

    // Service-role upsert keyed on `token` (the table's UNIQUE column).
    // If the same token already exists for another user, this rebinds it.
    const { error: upsertErr } = await supabaseAdmin
      .from("fcm_tokens")
      .upsert(
        {
          user_id: userId,
          token,
          user_agent: userAgent,
          updated_at: nowIso,
        },
        { onConflict: "token" },
      );

    if (upsertErr) {
      console.error("[register-fcm-token] upsert failed", upsertErr);
      return new Response(
        JSON.stringify({ error: upsertErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("[register-fcm-token] stored", { userId, tokenPrefix: token.slice(0, 12) });

    return new Response(JSON.stringify({ ok: true, user_id: userId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[register-fcm-token]", e);
    return new Response(
      JSON.stringify({ error: String((e as Error)?.message ?? e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
