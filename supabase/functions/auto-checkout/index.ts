// Auto checkout + penalty for staff who forgot to check out.
// Runs on a cron schedule. For each attendance row of today where:
//   - check_in_time is set
//   - check_out_time is null
//   - (now - expected_check_out_time) >= 30 minutes
// it sets check_out_time to (expected + 30 min), applies a flat
// 1000 MMK auto deduction, and marks deduction_applied = true.
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

// Off-day check: when work_schedule has the day explicitly marked inactive,
// the staff is off and must NOT be auto-penalised.
function isOffDay(profile: any): boolean {
  const ws = profile?.work_schedule ?? null;
  const today = weekdayName(yangonNow());
  const day = ws?.[today];
  if (day && day.active === false) return true;
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Cron-only: require CRON_SECRET or service-role. The public anon key is NOT accepted.
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const verifier = createClient(Deno.env.get("SUPABASE_URL")!, serviceRole!);
  const { data: secretMatches } = bearer && bearer !== serviceRole
    ? await verifier.rpc("verify_cron_secret", { p_candidate: bearer })
    : { data: false };
  const allowed = authHeader === `Bearer ${serviceRole}` || secretMatches === true;
  if (!allowed) {
    console.warn("[auto-checkout] 401 — invalid/missing CRON_SECRET");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
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
      .select("id, full_name, base_salary, work_day, check_out_time, work_schedule, deduction_rate_per_minute, early_deduction_per_minute")
      .in("id", userIds);
    const profileMap = new Map<string, any>((profiles ?? []).map((p: any) => [p.id, p]));
    const { data: adminRows } = await admin.from("profiles").select("id").in("role", ["admin", "assistant"]);
    const adminIds = (adminRows ?? []).map((r: any) => r.id);

    async function notify(ids: string[], title: string, body: string, url = "/salary") {
      const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
      if (!uniqueIds.length) return;
      try {
        await fetch(`${supabaseUrl}/functions/v1/send-push`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRoleKey}` },
          body: JSON.stringify({ user_ids: uniqueIds, title, body, url }),
        });
      } catch (e) {
        console.warn("[auto-checkout] notify failed", e);
      }
    }

    const results: any[] = [];

    for (const att of open as any[]) {
      const profile = profileMap.get(att.user_id);
      if (!profile) continue;
      if (isOffDay(profile)) continue; // off-day staff are excluded

      let expectedStr = resolveExpectedCheckOut(profile, settingsEnd);
      // Afternoon Half-Leave (pending or approved) → expected check-out is 12:00 MMT.
      const { data: afHalf } = await admin
        .from("leave_requests")
        .select("id")
        .eq("user_id", att.user_id)
        .eq("date", today)
        .eq("type", "half_leave")
        .eq("half_period", "afternoon")
        .neq("status", "rejected")
        .limit(1);
      if (afHalf && afHalf.length > 0) expectedStr = "12:00";
      const dueMinOfDay = hhmmToMinutes(expectedStr) + GRACE_AFTER_CHECKOUT_MIN;
      if (nowMinOfDay < dueMinOfDay) continue; // not yet eligible


      // ---- Partial-leave suppression ----
      // If the staff has an APPROVED partial_leave on this date whose end_time
      // matches (or covers) the expected check-out time, then we treat the staff
      // as already checked out at expected_check_out. No 1000 MMK penalty is
      // applied; we silently close the attendance row.
      const expectedMin = hhmmToMinutes(expectedStr);
      const { data: partial } = await admin
        .from("leave_requests")
        .select("start_time, end_time, status, type")
        .eq("user_id", att.user_id)
        .eq("date", today)
        .eq("type", "partial_leave")
        .eq("status", "approved");
      const partialCovers = (partial || []).some((p: any) => {
        if (!p.end_time) return false;
        const endMin = hhmmToMinutes(String(p.end_time).slice(0, 5));
        // covers if partial-leave end is at or after expected check-out
        return endMin >= expectedMin;
      });

      const penalty = partialCovers ? 0 : FLAT_PENALTY_MMK;

      // Auto check-out at (expected check-out + 30 min) in MMT, stored as UTC ISO.
      const [expH, expM] = expectedStr.split(":").map(Number);
      const dueMMTms =
        Date.UTC(
          Number(yangonNow().getUTCFullYear()),
          Number(yangonNow().getUTCMonth()),
          Number(yangonNow().getUTCDate()),
          Number(expH) || 0,
          (Number(expM) || 0) + GRACE_AFTER_CHECKOUT_MIN,
        ) - YANGON_OFFSET_MS;
      const autoCheckOutISO = new Date(dueMMTms).toISOString();

      const { data: claimedAttendance, error: claimErr } = await admin.from("attendance").update({
        check_out_time: autoCheckOutISO,
        early_minutes: 0,
        deduction_applied: true,
      }).eq("id", att.id)
        .is("check_out_time", null)
        .eq("deduction_applied", false)
        .select("id")
        .maybeSingle();
      if (claimErr) throw claimErr;
      if (!claimedAttendance) continue;

      // If a partial leave already covered the check-out time, just close the
      // attendance row silently — no salary deduction, no notification.
      if (penalty === 0) {
        results.push({ user_id: att.user_id, penalty: 0, check_out_time: autoCheckOutISO, partial_leave_covered: true });
        continue;
      }

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
      const note = `Auto Deduction: Forget to Check out on ${today} (flat ${penalty} MMK)`;
      const newReason = prevReason ? `${prevReason}\n${note}` : note;

      await admin.from("salaries").update({
        current_salary: newCurrent,
        total_deductions: newDeductions,
        deduction_reason: newReason,
        last_updated: new Date().toISOString(),
      }).eq("user_id", att.user_id).eq("month", monthStart);

      const txTitle = `Forget to Check out (${today})`;
      const { error: txErr } = await admin.from("salary_manual_deductions").insert({
        user_id: att.user_id,
        month: monthStart,
        title: txTitle,
        amount: penalty,
        source: "auto_early_out",
        created_by: att.user_id,
      });
      if (txErr && txErr.code !== "23505") {
        console.warn("[auto-checkout] deduction transaction insert failed", txErr);
      }

      await notify(
        [att.user_id, ...adminIds],
        "Forget to Check out — Auto Deduction",
        `${profile.full_name || "Staff"} အတွက် ${penalty.toLocaleString()} MMK flat deduction ဝင်ထားပါသည်။`,
      );

      results.push({ user_id: att.user_id, penalty, check_out_time: autoCheckOutISO });
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
