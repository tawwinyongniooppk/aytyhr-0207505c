// Runs near end-of-month (Yangon time). When tomorrow's Yangon date is the 1st,
// resets the current month's bonus_transactions, salaries, and leave_manual_deductions.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function yangonDateAt(offsetDays = 0) {
  const now = new Date();
  const ms = now.getTime() + (6.5 * 60 * 60 * 1000) + offsetDays * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const today = yangonDateAt(0);
    const tomorrow = yangonDateAt(1);

    // Only run when tomorrow is the 1st of a month (i.e. today is the last day).
    const force = new URL(req.url).searchParams.get("force") === "1";
    if (!force && !tomorrow.endsWith("-01")) {
      return new Response(JSON.stringify({ ok: true, skipped: true, today, tomorrow }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const monthStart = today.slice(0, 7) + "-01";
    const { error } = await supabase.rpc("monthly_reset_for", { p_month: monthStart });
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, reset_month: monthStart }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[monthly-reset] error", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
