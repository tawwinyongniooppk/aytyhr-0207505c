// Attendance sweep cron — runs every ~5 min (via pg_cron). Three responsibilities:
//
//   A) Auto Half-Leave on late check-in:
//      If a staff has NOT checked in by `expected_check_in + 30min`, the
//      system submits a pending `half_leave` (morning) request on their
//      behalf so Admin can review with Manual Deduction.
//
//   B) Auto Full-Leave on prolonged no-show:
//      If a staff still hasn't checked in by `expected_check_in + 2hr`
//      (or by `12:30` when an approved Morning Half-Leave shifted check-in
//      to 12:00), a `leave` (full) request is auto-submitted.
//
//   C) Auto early-out deduction:
//      If a staff checked in but did NOT check out by
//      `expected_check_out + 30min` (afternoon-half-leave shifts expected
//      check-out to 12:00), the system writes a one-time 1,000 Ks deduction
//      (5 min × early_deduction_per_minute=200) into salary_manual_deductions.
//
// All branches are idempotent for the day (single insert per user/date).
// Admins + Assistant Admins + the affected staff receive FCM push on every action.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_GRACE_MIN = 120;
const HALF_GRACE_MIN = 30;
const MORNING_HALF_CHECKIN = "12:00";
const CHECKOUT_GRACE_MIN = 30;
const AUTO_EARLY_OUT_MIN = 5; // 5 minutes × per-minute early-out rate
const AUTO_REASON_FULL = "[AUTO] Missed check-in — auto-submitted by system";
const AUTO_REASON_FULL_HALF = "[AUTO] Morning Half-Leave: missed 12:00 check-in — auto-submitted";
const AUTO_REASON_HALF = "[AUTO] Late check-in (+30min) — auto Half-Leave";
const YANGON_OFFSET_MS = 6.5 * 60 * 60 * 1000;

function yangonNow() {
  return new Date(Date.now() + YANGON_OFFSET_MS);
}

function yangonTodayISO() {
  return yangonNow().toISOString().slice(0, 10);
}

function weekdayName(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "long" });
}

function resolveExpectedCheckIn(profile: any, settingsStart: string): { time: string; active: boolean } {
  const ws = profile?.work_schedule ?? null;
  const today = weekdayName(yangonNow());
  const day = ws?.[today];
  if (day) {
    return { time: (day.check_in as string) || settingsStart || "09:00", active: !!day.active };
  }
  if (profile?.work_day === today && profile?.check_in_time) {
    return { time: profile.check_in_time as string, active: true };
  }
  return { time: settingsStart || "09:00", active: true };
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

  const cronSecret = Deno.env.get("CRON_SECRET");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const authHeader = req.headers.get("Authorization") ?? "";
  const apikeyHeader = req.headers.get("apikey") ?? "";
  const allowed =
    (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
    (serviceRole && authHeader === `Bearer ${serviceRole}`) ||
    (!!anonKey && (authHeader === `Bearer ${anonKey}` || apikeyHeader === anonKey));
  if (!allowed) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const now = yangonNow();
    const today = yangonTodayISO();
    const monthStart = `${today.slice(0, 7)}-01`;

    const { data: profiles, error: pErr } = await admin
      .from("profiles")
      .select("id, role, work_day, check_in_time, check_out_time, work_schedule, full_name, early_deduction_per_minute, deduction_rate_per_minute")
      .in("role", ["staff", "admin", "assistant"]);
    if (pErr) throw pErr;
    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: settingsRows } = await admin
      .from("app_settings").select("key, value").in("key", ["start_time", "end_time"]);
    const settingsMap: Record<string, string> = {};
    (settingsRows ?? []).forEach((r: any) => (settingsMap[r.key] = r.value));
    const settingsStart = settingsMap.start_time || "09:00";
    const settingsEnd = settingsMap.end_time || "16:00";

    const userIds = profiles.map((p: any) => p.id);

    const [attRes, leaveRes, holRes, assignRes, smdRes] = await Promise.all([
      admin.from("attendance").select("user_id, check_in_time, check_out_time").eq("date", today).in("user_id", userIds),
      admin.from("leave_requests").select("user_id, reason, status, type, half_period")
        .eq("date", today).in("user_id", userIds),
      admin.from("calendar_events").select("id, assigned_to_all")
        .eq("event_type", "holiday").lte("start_date", today).gte("end_date", today),
      admin.from("calendar_event_assignments").select("event_id, user_id").in("user_id", userIds),
      admin.from("salary_manual_deductions").select("user_id, source, title").eq("month", monthStart),
    ]);

    const attMap = new Map<string, { check_in: string | null; check_out: string | null }>();
    (attRes.data ?? []).forEach((r: any) =>
      attMap.set(r.user_id, { check_in: r.check_in_time, check_out: r.check_out_time }),
    );
    const existingLeaves = leaveRes.data ?? [];
    const holidayEvents = holRes.data ?? [];
    const assignments = assignRes.data ?? [];
    const earlyOutAlready = new Set<string>(
      (smdRes.data ?? [])
        .filter((r: any) => r.source === "auto_early_out" && (r.title ?? "").includes(today))
        .map((r: any) => r.user_id),
    );

    const morningHalfApproved = new Set<string>(
      existingLeaves
        .filter((l: any) =>
          l.type === "half_leave" && l.half_period === "morning" && l.status === "approved",
        )
        .map((l: any) => l.user_id),
    );
    const afternoonHalfApproved = new Set<string>(
      existingLeaves
        .filter((l: any) =>
          l.type === "half_leave" && l.half_period === "afternoon" && l.status === "approved",
        )
        .map((l: any) => l.user_id),
    );

    const userHoliday = new Set<string>();
    const allHoliday = holidayEvents.some((e: any) => e.assigned_to_all);
    if (allHoliday) userIds.forEach((id) => userHoliday.add(id));
    for (const a of assignments as any[]) {
      if (holidayEvents.some((e: any) => e.id === a.event_id)) userHoliday.add(a.user_id);
    }

    const { data: adminRows } = await admin
      .from("profiles").select("id").in("role", ["admin", "assistant"]);
    const adminIds = (adminRows ?? []).map((r: any) => r.id);

    async function notify(userIds: string[], title: string, body: string, url = "/leave") {
      if (!userIds.length) return;
      try {
        await admin.functions.invoke("send-push", { body: { user_ids: userIds, title, body, url } });
      } catch (e) {
        console.warn("[attendance-sweep] notify failed", e);
      }
    }

    const results: any[] = [];

    for (const profile of profiles as any[]) {
      if (userHoliday.has(profile.id)) continue;

      const att = attMap.get(profile.id);
      const userLeaves = existingLeaves.filter((l: any) => l.user_id === profile.id);
      const hasAutoHalf = userLeaves.some(
        (l: any) => l.type === "half_leave" && (l.reason ?? "").startsWith("[AUTO]"),
      );
      const hasAutoFull = userLeaves.some(
        (l: any) => l.type === "leave" && (l.reason ?? "").startsWith("[AUTO]"),
      );
      const hasAnyFullLeave = userLeaves.some((l: any) => l.type === "leave" && l.status !== "rejected");
      const hasAnyMorningHalf = userLeaves.some(
        (l: any) => l.type === "half_leave" && l.half_period === "morning" && l.status !== "rejected",
      );

      // ====== CHECK-OUT auto deduction (+30 min past expected check-out) ======
      if (att?.check_in && !att?.check_out && !earlyOutAlready.has(profile.id)) {
        let expectedOutStr = resolveExpectedCheckOut(profile, settingsEnd);
        if (afternoonHalfApproved.has(profile.id)) expectedOutStr = "12:00";
        const [oh, om] = expectedOutStr.split(":").map(Number);
        const expOut = new Date(now);
        expOut.setHours(oh, om, 0, 0);
        const dueOut = new Date(expOut.getTime() + CHECKOUT_GRACE_MIN * 60_000);
        if (now >= dueOut) {
          const rate =
            Number(profile.early_deduction_per_minute) ||
            Number(profile.deduction_rate_per_minute) ||
            200;
          const amount = AUTO_EARLY_OUT_MIN * rate;
          const { error: smdErr } = await admin.from("salary_manual_deductions").insert({
            user_id: profile.id,
            month: monthStart,
            title: `Auto early-out deduction (${today})`,
            amount,
            source: "auto_early_out",
            created_by: profile.id,
          });
          if (!smdErr) {
            results.push({ user_id: profile.id, kind: "auto_early_out", amount });
            await notify(
              [profile.id, ...adminIds],
              "Auto early-out deduction",
              `Check-out time (+30min) ကျော်လွန်ပြီး Check-out မလုပ်ခဲ့သဖြင့် ${amount.toLocaleString()} Ks Auto Deduction ဖြတ်ထားပါသည်။`,
              "/salary",
            );
          } else {
            console.error("[attendance-sweep] smd insert failed", profile.id, smdErr);
          }
        }
      }

      // No further work if already checked in for the day
      if (att?.check_in) continue;

      const expected = resolveExpectedCheckIn(profile, settingsStart);
      const isMorningHalf = morningHalfApproved.has(profile.id);

      if (!expected.active && !isMorningHalf) continue; // off-day

      const expectedInStr = isMorningHalf ? MORNING_HALF_CHECKIN : expected.time;
      const [h, m] = expectedInStr.split(":").map(Number);
      const exp = new Date(now);
      exp.setHours(h, m, 0, 0);

      const halfDueAt = new Date(exp.getTime() + HALF_GRACE_MIN * 60_000);
      const fullDueAt = new Date(exp.getTime() + (isMorningHalf ? HALF_GRACE_MIN : DEFAULT_GRACE_MIN) * 60_000);

      // ====== FULL-LEAVE auto-escalation ======
      // For morning-half users this also runs at +30min, escalating directly to full leave.
      if (now >= fullDueAt && !hasAutoFull && !hasAnyFullLeave) {
        const reason = isMorningHalf ? AUTO_REASON_FULL_HALF : AUTO_REASON_FULL;
        const { error: insErr } = await admin.from("leave_requests").insert({
          user_id: profile.id,
          date: today,
          type: "leave",
          status: "pending",
          payment_type: "unpaid",
          reason,
        });
        if (!insErr) {
          results.push({ user_id: profile.id, kind: "auto_full_leave", expected: expectedInStr });
          const who = profile.full_name || "Staff";
          await notify(
            [profile.id, ...adminIds],
            "Auto Full Leave submitted",
            isMorningHalf
              ? `${who} ၏ Morning Half-Leave check-in (12:00) ကို မလုပ်ခဲ့သဖြင့် Full Leave အလိုအလျောက် တင်ပေးထားပါသည်။`
              : `${who} ၏ check-in မရှိသဖြင့် Full Leave အလိုအလျောက် တင်ပေးထားပါသည်။`,
            "/leave",
          );
        } else {
          console.error("[attendance-sweep] full-leave insert failed", profile.id, insErr);
        }
        continue;
      }

      // ====== HALF-LEAVE auto-submission (+30 min late check-in) ======
      // Only for default-schedule users (morning-half users already shifted to 12:00).
      if (
        !isMorningHalf &&
        now >= halfDueAt &&
        now < fullDueAt &&
        !hasAutoHalf &&
        !hasAnyMorningHalf
      ) {
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
          results.push({ user_id: profile.id, kind: "auto_half_leave", expected: expectedInStr });
          const who = profile.full_name || "Staff";
          await notify(
            [profile.id, ...adminIds],
            "Auto Half Leave submitted",
            `${who} ၏ Check-in (+30min) ကျော်နေသဖြင့် Half Leave Request အလိုအလျောက် တင်ပေးထားပါသည်။ Admin အနေဖြင့် Manual Deduction ထည့်ပြီး Approve လုပ်ပါ။`,
            "/leave",
          );
        } else {
          console.error("[attendance-sweep] half-leave insert failed", profile.id, insErr);
        }
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
