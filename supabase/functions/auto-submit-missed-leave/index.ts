// Auto-submit a Full Leave request for staff who have not checked in by the
// applicable grace window. Idempotent: at most one auto-leave per user per day,
// identified by a [AUTO] reason prefix.
//
// Two grace windows:
//   • Default: +2 hours past the staff's expected check-in time.
//   • Morning Half-Leave approved for today: check-in expectation is shifted
//     to 12:00 PM (Asia/Yangon) and grace is just +30 minutes.
//
// On auto-submit, admins/assistants are notified via FCM push.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_GRACE_MIN = 120; // 2 hours for normal missed check-in
const MORNING_HALF_GRACE_MIN = 30; // 30 min after the 12:00 shift
const MORNING_HALF_CHECKIN = "12:00";
const AUTO_REASON = "[AUTO] Missed check-in — auto-submitted by system";
const AUTO_REASON_HALF = "[AUTO] Morning Half-Leave: missed 12:00 check-in — auto-submitted";
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

function resolveExpected(profile: any, settingsStart: string): { time: string; active: boolean } {
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Accept CRON_SECRET, service-role, or internal pg_cron (anon apikey).
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

    const { data: profiles, error: pErr } = await admin
      .from("profiles")
      .select("id, role, work_day, check_in_time, work_schedule, full_name")
      .in("role", ["staff", "admin", "assistant"]);
    if (pErr) throw pErr;
    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: settingsRows } = await admin
      .from("app_settings").select("key, value").eq("key", "start_time");
    const settingsStart = (settingsRows?.[0]?.value as string) || "09:00";

    const userIds = profiles.map((p: any) => p.id);

    const [attRes, leaveRes, holRes, assignRes] = await Promise.all([
      admin.from("attendance").select("user_id").eq("date", today).in("user_id", userIds),
      admin.from("leave_requests").select("user_id, reason, status, type, half_period")
        .eq("date", today).in("user_id", userIds),
      admin.from("calendar_events").select("id, assigned_to_all")
        .eq("event_type", "holiday").lte("start_date", today).gte("end_date", today),
      admin.from("calendar_event_assignments").select("event_id, user_id").in("user_id", userIds),
    ]);

    const checkedIn = new Set((attRes.data ?? []).map((r: any) => r.user_id));
    const existingLeaves = leaveRes.data ?? [];
    const holidayEvents = holRes.data ?? [];
    const assignments = assignRes.data ?? [];

    // Users with an APPROVED morning half-leave for today shift their check-in
    // to 12:00 with a +30-minute grace window.
    const morningHalfApproved = new Set<string>(
      existingLeaves
        .filter((l: any) =>
          l.type === "half_leave" && l.half_period === "morning" && l.status === "approved",
        )
        .map((l: any) => l.user_id),
    );

    const userHoliday = new Set<string>();
    const allHoliday = holidayEvents.some((e: any) => e.assigned_to_all);
    if (allHoliday) userIds.forEach((id) => userHoliday.add(id));
    for (const a of assignments as any[]) {
      if (holidayEvents.some((e: any) => e.id === a.event_id)) userHoliday.add(a.user_id);
    }

    // Fetch admin / assistant ids once for FCM notifications
    const { data: adminRows } = await admin
      .from("profiles").select("id").in("role", ["admin", "assistant"]);
    const adminIds = (adminRows ?? []).map((r: any) => r.id);

    async function notify(userIds: string[], title: string, body: string) {
      if (!userIds.length) return;
      try {
        await admin.functions.invoke("send-push", {
          body: { user_ids: userIds, title, body, url: "/leave" },
        });
      } catch (e) {
        console.warn("[auto-submit-missed-leave] notify failed", e);
      }
    }

    const results: any[] = [];

    for (const profile of profiles as any[]) {
      if (checkedIn.has(profile.id)) continue;
      if (userHoliday.has(profile.id)) continue;

      const isMorningHalf = morningHalfApproved.has(profile.id);
      let expectedTime: string;
      let graceMin: number;
      let reason: string;

      if (isMorningHalf) {
        expectedTime = MORNING_HALF_CHECKIN;
        graceMin = MORNING_HALF_GRACE_MIN;
        reason = AUTO_REASON_HALF;
      } else {
        const expected = resolveExpected(profile, settingsStart);
        if (!expected.active) continue; // off-day
        expectedTime = expected.time;
        graceMin = DEFAULT_GRACE_MIN;
        reason = AUTO_REASON;
      }

      const [h, m] = expectedTime.split(":").map(Number);
      const exp = new Date(now);
      exp.setHours(h, m, 0, 0);
      const dueAt = new Date(exp.getTime() + graceMin * 60_000);
      if (now < dueAt) continue;

      const userLeaves = existingLeaves.filter((l: any) => l.user_id === profile.id);
      // Already auto-submitted full leave? skip
      if (userLeaves.some((l: any) => l.type === "leave" && (l.reason ?? "").startsWith("[AUTO]"))) continue;
      // Already has any approved/pending full-day leave today? skip
      if (userLeaves.some((l: any) => l.type === "leave" && l.status !== "rejected")) continue;

      const { error: insErr } = await admin.from("leave_requests").insert({
        user_id: profile.id,
        date: today,
        type: "leave",
        status: "pending",
        payment_type: "unpaid",
        reason,
      });
      if (insErr) {
        console.error("[auto-submit-missed-leave] insert error", profile.id, insErr);
        continue;
      }
      results.push({ user_id: profile.id, expected: expectedTime, source: isMorningHalf ? "morning_half" : "default" });

      // Notify admins + the staff member
      const who = profile.full_name || "Staff";
      const title = "Auto Full Leave submitted";
      const body = isMorningHalf
        ? `${who} ၏ Morning Half-Leave check-in (12:00) ကို မလုပ်ခဲ့သဖြင့် Full Leave အလိုအလျောက် တင်ပေးထားပါသည်။`
        : `${who} ၏ check-in မရှိသဖြင့် Full Leave အလိုအလျောက် တင်ပေးထားပါသည်။`;
      await notify([...adminIds, profile.id], title, body);
    }

    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[auto-submit-missed-leave] error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
