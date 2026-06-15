// Attendance sweep cron — runs exactly 2× in the morning (MMT 8:30, 9:00)
// and conditionally at MMT 12:00.
//
//   A) Morning runs (8:30, 9:00 MMT):
//      For each staff whose expected check-in + 30 min == now, and who has
//      not checked in, auto-submit a pending Morning Half-Leave request.
//      The expected check-in then shifts to 12:00 PM MMT for the rest of
//      the day. Per-minute late deductions during the 30-min grace are
//      handled by the normal check-in flow (apply-attendance-deduction).
//
//   B) Noon run (12:00 MMT):
//      ONLY processes staff who already have a Morning Half-Leave today
//      (auto-submitted OR self-submitted + approved). If they still have
//      not checked in by 12:00, an Afternoon Half-Leave is auto-submitted.
//      If no morning-half exists for any user today, the function exits
//      immediately to keep invocations cheap.
//
// Off-day staff and holiday-assigned staff are always skipped.
// Check-out / forgot-to-check-out is handled by `auto-checkout` at 15:45.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const HALF_GRACE_MIN = 30;
const NOON_MIN = 12 * 60;            // MMT 12:00
const NOON_WINDOW_END = 12 * 60 + 29; // treat 12:00–12:29 as "noon run"
const AUTO_REASON_HALF = "[AUTO] Late check-in (+30min) — auto Half-Leave";
const AUTO_REASON_AFTERNOON = "[AUTO] Morning Half-Leave: missed 12:00 check-in — auto Afternoon Half-Leave";
const YANGON_OFFSET_MS = 6.5 * 60 * 60 * 1000;
const YANGON_OFFSET_MIN = 6 * 60 + 30;

function yangonNow() { return new Date(Date.now() + YANGON_OFFSET_MS); }
function yangonTodayISO() { return yangonNow().toISOString().slice(0, 10); }
function hhmmToMinutes(value: string) {
  const [h, m] = value.split(":").map(Number);
  return ((Number(h) || 0) * 60) + (Number(m) || 0);
}
function yangonMinuteOfDay(date = new Date()) {
  return (date.getUTCHours() * 60 + date.getUTCMinutes() + YANGON_OFFSET_MIN + 1440) % 1440;
}
function weekdayName(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "long" });
}

function resolveExpectedCheckIn(
  profile: any, settingsStart: string,
): { time: string; active: boolean } {
  const ws = profile?.work_schedule ?? null;
  const today = weekdayName(yangonNow());
  const day = ws?.[today];
  if (day) return { time: (day.check_in as string) || settingsStart || "09:00", active: !!day.active };
  if (profile?.work_day === today && profile?.check_in_time) {
    return { time: profile.check_in_time as string, active: true };
  }
  return { time: settingsStart || "09:00", active: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const cronSecret = Deno.env.get("CRON_SECRET");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("Authorization") ?? "";
  const allowed =
    (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
    (serviceRole && authHeader === `Bearer ${serviceRole}`);
  if (!allowed) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const today = yangonTodayISO();
    const nowMinOfDay = yangonMinuteOfDay(new Date());
    const isNoonRun = nowMinOfDay >= NOON_MIN && nowMinOfDay <= NOON_WINDOW_END;

    // ----- Noon run fast-exit when no morning-half exists today -----
    if (isNoonRun) {
      const { count } = await admin.from("leave_requests")
        .select("id", { count: "exact", head: true })
        .eq("date", today)
        .eq("type", "half_leave")
        .eq("half_period", "morning")
        .neq("status", "rejected");
      if (!count) {
        return new Response(JSON.stringify({ ok: true, skipped: "no_morning_half_today" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { data: profiles, error: pErr } = await admin
      .from("profiles")
      .select("id, role, work_day, check_in_time, work_schedule, full_name")
      .eq("role", "staff");
    if (pErr) throw pErr;
    if (!profiles?.length) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: settingsRows } = await admin
      .from("app_settings").select("key, value").eq("key", "start_time");
    const settingsStart = (settingsRows?.[0]?.value as string) || "09:00";

    const userIds = profiles.map((p: any) => p.id);

    const [attRes, leaveRes, holRes, assignRes] = await Promise.all([
      admin.from("attendance").select("user_id, check_in_time")
        .eq("date", today).in("user_id", userIds),
      admin.from("leave_requests").select("user_id, status, type, half_period")
        .eq("date", today).in("user_id", userIds),
      admin.from("calendar_events").select("id, assigned_to_all")
        .eq("event_type", "holiday").lte("start_date", today).gte("end_date", today),
      admin.from("calendar_event_assignments").select("event_id, user_id").in("user_id", userIds),
    ]);

    const checkedIn = new Set<string>(
      (attRes.data ?? []).filter((r: any) => r.check_in_time).map((r: any) => r.user_id),
    );
    const existingLeaves = leaveRes.data ?? [];
    const holidayEvents = holRes.data ?? [];
    const assignments = assignRes.data ?? [];

    const morningHalfActive = new Set<string>(
      existingLeaves
        .filter((l: any) => l.type === "half_leave" && l.half_period === "morning" && l.status !== "rejected")
        .map((l: any) => l.user_id),
    );
    const afternoonHalfActive = new Set<string>(
      existingLeaves
        .filter((l: any) => l.type === "half_leave" && l.half_period === "afternoon" && l.status !== "rejected")
        .map((l: any) => l.user_id),
    );
    const hasAnyFullLeave = new Set<string>(
      existingLeaves
        .filter((l: any) => l.type === "leave" && l.status !== "rejected")
        .map((l: any) => l.user_id),
    );

    const userHoliday = new Set<string>();
    if (holidayEvents.some((e: any) => e.assigned_to_all)) {
      userIds.forEach((id) => userHoliday.add(id));
    }
    for (const a of assignments as any[]) {
      if (holidayEvents.some((e: any) => e.id === a.event_id)) userHoliday.add(a.user_id);
    }

    const { data: adminRows } = await admin
      .from("profiles").select("id").in("role", ["admin", "assistant"]);
    const adminIds = (adminRows ?? []).map((r: any) => r.id);

    async function notify(ids: string[], title: string, body: string, url = "/leave") {
      if (!ids.length) return;
      try {
        await fetch(`${supabaseUrl}/functions/v1/send-push`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRoleKey}` },
          body: JSON.stringify({ user_ids: ids, title, body, url }),
        });
      } catch (e) {
        console.warn("[attendance-sweep] notify failed", e);
      }
    }

    const results: any[] = [];

    for (const profile of profiles as any[]) {
      if (userHoliday.has(profile.id)) continue;
      if (checkedIn.has(profile.id)) continue;
      if (hasAnyFullLeave.has(profile.id)) continue;

      const expected = resolveExpectedCheckIn(profile, settingsStart);
      const isMorningHalf = morningHalfActive.has(profile.id);

      // Off-day & not on a noon morning-half exception → skip
      if (!expected.active && !isMorningHalf) continue;

      // -------------- NOON RUN: Afternoon Half-Leave only --------------
      if (isNoonRun) {
        if (!isMorningHalf) continue;
        if (afternoonHalfActive.has(profile.id)) continue;
        // At MMT 12:00, missed the noon check-in → auto Afternoon Half-Leave
        const { error: insErr } = await admin.from("leave_requests").insert({
          user_id: profile.id,
          date: today,
          type: "half_leave",
          half_period: "afternoon",
          status: "pending",
          payment_type: "unpaid",
          reason: AUTO_REASON_AFTERNOON,
        });
        if (!insErr) {
          results.push({ user_id: profile.id, kind: "auto_afternoon_half" });
          await notify(
            [profile.id, ...adminIds],
            "Auto Afternoon Half-Leave submitted",
            `${profile.full_name || "Staff"} ၏ Morning Half-Leave ပြီးနောက် 12:00 PM Check-in မလုပ်ခဲ့သဖြင့် Afternoon Half-Leave အလိုအလျောက် တင်ပေးထားပါသည်။`,
          );
        } else {
          console.error("[attendance-sweep] afternoon insert failed", profile.id, insErr);
        }
        continue;
      }

      // -------------- MORNING RUN: Morning Half-Leave only --------------
      if (isMorningHalf) continue; // already has morning half — nothing to do

      const expectedMin = hhmmToMinutes(expected.time);
      const dueMin = expectedMin + HALF_GRACE_MIN;

      // Only this user's exact +30 boundary should fire — gate to the current
      // cron slot (±5 min) so the 8:30 run only handles 8:00 staff and the
      // 9:00 run only handles 8:30 staff.
      if (Math.abs(nowMinOfDay - dueMin) > 5) continue;

      const { error: insErr } = await admin.from("leave_requests").insert({
        user_id: profile.id,
        date: today,
        type: "half_leave",
        half_period: "morning",
        status: "pending",
        payment_type: "unpaid",
        reason: AUTO_REASON_HALF,
      });
      if (!insErr) {
        results.push({ user_id: profile.id, kind: "auto_morning_half", expected: expected.time });
        await notify(
          [profile.id, ...adminIds],
          "Auto Morning Half-Leave submitted",
          `${profile.full_name || "Staff"} ၏ Check-in (+30min) ကျော်နေသဖြင့် Morning Half-Leave အလိုအလျောက် တင်ပေးထားပါသည်။ Check-in expected time ကို 12:00 PM သို့ ပြောင်းပေးထားပါသည်။`,
        );
      } else {
        console.error("[attendance-sweep] morning insert failed", profile.id, insErr);
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[attendance-sweep] error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
