// Auto checkout + penalty for staff who forgot to check out.
// Runs on a cron schedule. For each attendance row of today where:
//   - check_in_time is set
//   - check_out_time is null
//   - (now - expected_check_out_time) >= 30 minutes
// it sets check_out_time to (expected + 30 min), applies a 10-minute
// "Auto Deduction" penalty using the staff member's per-minute rate,
// and marks deduction_applied = true.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Flat 1000 MMK penalty for staff who forgot to check out by (expected + 30 min).
const FLAT_PENALTY_MMK = 1000;
const GRACE_AFTER_CHECKOUT_MIN = 30;
const YANGON_OFFSET_MS = 6.5 * 60 * 60 * 1000;
const YANGON_OFFSET_MIN = 6 * 60 + 30;

function yangonNow() {
  return new Date(Date.now() + YANGON_OFFSET_MS);
}

function yangonTodayISO() {
  return yangonNow().toISOString().slice(0, 10);
}

function getMonthStart(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function weekdayName(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "long" });
}

function hhmmToMinutes(value: string) {
  const [h, m] = value.split(":").map(Number);
  return ((Number(h) || 0) * 60) + (Number(m) || 0);
}

function yangonMinuteOfDay(date = new Date()) {
  return (date.getUTCHours() * 60 + date.getUTCMinutes() + YANGON_OFFSET_MIN + 1440) % 1440;
}

function resolveExpectedCheckOut(profile: any, settingsEnd: string): string {
  const ws = profile?.work_schedule ?? null;
  const today = weekdayName(yangonNow());
  const day = ws?.[today];
  if (day?.active && day?.check_out) return day.check_out as string;
  if (profile?.work_day === today && profile?.check_out_time) return profile.check_out_time as string;
  return settingsEnd || "16:00";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Accept CRON_SECRET, service-role, or internal pg_cron (anon apikey).
  const cronSecret = Deno.env.get("CRON_SECRET");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const authHeader = req.headers.get("Authorization") ?? "";
  const apikeyHeader = req.headers.get("apikey") ?? "";
  if (!authHeader && !apikeyHeader) {
    console.warn("[auto-checkout] 401 — missing Authorization/apikey header");
    return new Response(JSON.stringify({ error: "Unauthorized: missing CRON_SECRET" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const allowed =
    (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
    (serviceRole && authHeader === `Bearer ${serviceRole}`) ||
    (!!anonKey && (authHeader === `Bearer ${anonKey}` || apikeyHeader === anonKey));
  if (!allowed) {
    console.warn("[auto-checkout] 401 — invalid CRON_SECRET / unauthorized caller");
    return new Response(JSON.stringify({ error: "Unauthorized: invalid CRON_SECRET" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }



  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const now = new Date();
    const today = yangonTodayISO();
    const monthStart = getMonthStart(yangonNow());
    const nowMinOfDay = yangonMinuteOfDay(now);

    // 1. Load today's open attendance rows (checked-in, not checked-out)
    const { data: open, error: openErr } = await admin
      .from("attendance")
      .select("id, user_id, check_in_time, check_out_time, late_minutes, early_minutes, deduction_applied, date")
      .eq("date", today)
      .not("check_in_time", "is", null)
      .is("check_out_time", null);
    if (openErr) throw openErr;
    if (!open || open.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Load global end_time fallback
    const { data: settingsRows } = await admin.from("app_settings").select("key, value").eq("key", "end_time");
    const settingsEnd = (settingsRows?.[0]?.value as string) || "16:00";

    // 3. Load relevant profiles
    const userIds = Array.from(new Set(open.map((r: any) => r.user_id)));
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, base_salary, work_day, check_out_time, work_schedule, deduction_rate_per_minute, early_deduction_per_minute")
      .in("id", userIds);
    const profileMap = new Map<string, any>((profiles ?? []).map((p: any) => [p.id, p]));

    const results: any[] = [];

    for (const att of open as any[]) {
      const profile = profileMap.get(att.user_id);
      if (!profile) continue;

      const expectedStr = resolveExpectedCheckOut(profile, settingsEnd);
      const dueMinOfDay = hhmmToMinutes(expectedStr) + GRACE_AFTER_CHECKOUT_MIN;
      if (nowMinOfDay < dueMinOfDay) continue; // not yet eligible

      const penalty = FLAT_PENALTY_MMK;

      // Auto check-out at dueAt
      await admin.from("attendance").update({
        check_out_time: new Date().toISOString(),
        early_minutes: 0,
        deduction_applied: true,
      }).eq("id", att.id);

      // Ensure salary row
      let { data: salary } = await admin.from("salaries")
        .select("*").eq("user_id", att.user_id).eq("month", monthStart).maybeSingle();
      if (!salary) {
        const baseSalary = Number(profile.base_salary) || 300000;
        const { data: created } = await admin.from("salaries").insert({
          user_id: att.user_id, month: monthStart,
          base_salary: baseSalary, current_salary: baseSalary, total_deductions: 0,
        }).select().single();
        salary = created;
      }

      const newCurrent = Math.max(0, (salary!.current_salary ?? 0) - penalty);
      const newDeductions = (salary!.total_deductions ?? 0) + penalty;
      const prevReason = (salary!.deduction_reason ?? "").trim();
      const note = `Auto Deduction: forgot check-out on ${today} (flat ${penalty} MMK)`;
      const newReason = prevReason ? `${prevReason}\n${note}` : note;

      await admin.from("salaries").update({
        current_salary: newCurrent,
        total_deductions: newDeductions,
        deduction_reason: newReason,
        last_updated: new Date().toISOString(),
      }).eq("user_id", att.user_id).eq("month", monthStart);

      results.push({ user_id: att.user_id, penalty, check_out_time: new Date().toISOString() });
    }

    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[auto-checkout] error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
