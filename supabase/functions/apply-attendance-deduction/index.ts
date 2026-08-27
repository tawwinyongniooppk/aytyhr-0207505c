// Server-side attendance deduction handler.
// Called from the client after check-out. Re-reads the attendance row,
// settings, leave requests, and salary, and applies the correct deduction
// using the service role so staff cannot tamper with payroll.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getMonthStart(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await callerClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const today = new Date().toISOString().split("T")[0];
    const monthStart = getMonthStart();

    // Re-read the attendance row server-side; trust nothing from the client
    const { data: att } = await admin.from("attendance")
      .select("*").eq("user_id", user.id).eq("date", today).maybeSingle();
    if (!att) {
      return new Response(JSON.stringify({ error: "No attendance row for today" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (att.deduction_applied) {
      return new Response(JSON.stringify({ ok: true, applied: false, reason: "already_applied" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get per-staff rates + schedule (separate late vs early; falls back to legacy rate then 200)
    const { data: profileRate } = await admin.from("profiles")
      .select("late_deduction_per_minute, early_deduction_per_minute, deduction_rate_per_minute, work_schedule, work_day, check_out_time")
      .eq("id", user.id).maybeSingle();
    const legacy = Number((profileRate as any)?.deduction_rate_per_minute) || 200;
    const lateRate = Number((profileRate as any)?.late_deduction_per_minute) || legacy;
    const earlyRate = Number((profileRate as any)?.early_deduction_per_minute) || legacy;

    // Resolve expected check-out time for today (work_schedule -> legacy -> app_settings)
    const todayName = new Date().toLocaleDateString("en-US", { weekday: "long" });
    const ws = (profileRate as any)?.work_schedule ?? null;
    const wsDay = ws?.[todayName];
    let expectedOut: string | null = null;
    if (wsDay?.active && wsDay?.check_out) expectedOut = wsDay.check_out as string;
    else if ((profileRate as any)?.work_day === todayName && (profileRate as any)?.check_out_time)
      expectedOut = (profileRate as any).check_out_time as string;
    if (!expectedOut) {
      const { data: s } = await admin.from("app_settings").select("value").eq("key", "end_time").maybeSingle();
      expectedOut = (s?.value as string) || "16:00";
    }

    // Afternoon Half-Leave (pending or approved) for today → expected check-out shifts to 12:00 MMT.
    {
      const { data: afHalf } = await admin.from("leave_requests")
        .select("id").eq("user_id", user.id).eq("date", today)
        .eq("type", "half_leave").eq("half_period", "afternoon")
        .neq("status", "rejected").limit(1);
      if (afHalf && afHalf.length > 0) expectedOut = "12:00";
    }


    // Compute early_minutes from actual check_out_time vs expected, in Yangon time.
    // Using setHours on a UTC Date uses the SERVER's local tz (UTC) — that produced
    // 300+ minute "early" values for a 3:15 PM Yangon check-out. Compare minute-of-day
    // in Asia/Yangon (UTC+6:30) instead so device/server timezone never affects payroll.
    const YANGON_OFFSET_MIN = 6 * 60 + 30;
    let computedEarly = 0;
    if (att.check_out_time && expectedOut) {
      const [eh, em] = expectedOut.split(":").map(Number);
      const out = new Date(att.check_out_time);
      const outMinOfDay = (out.getUTCHours() * 60 + out.getUTCMinutes() + YANGON_OFFSET_MIN + 1440) % 1440;
      const expectedMinOfDay = (Number(eh) || 0) * 60 + (Number(em) || 0);
      computedEarly = Math.max(0, expectedMinOfDay - outMinOfDay);
    }

    // Approved leave / late excuse for today — only "paid" approvals excuse the deduction
    const { data: approved } = await admin.from("leave_requests")
      .select("type, payment_type").eq("user_id", user.id).eq("date", today).eq("status", "approved");
    const paid = (approved ?? []).filter((r: any) => (r.payment_type ?? "paid") === "paid");
    const types = paid.map((r: any) => r.type);
    const hasLeave = types.includes("leave");
    const hasPartialLeave = types.includes("partial_leave");

    // Check-in lateness is independent from Full, Half, Partial, and late-excuse
    // leave records. The insert trigger has already applied the fixed +3 grace
    // and capped automatic per-minute charging at the +30 boundary.
    const lateMin = att.late_minutes ?? 0;
    const earlyMin = hasLeave || hasPartialLeave ? 0 : computedEarly;
    const deduction = (lateMin * lateRate) + (earlyMin * earlyRate);

    // Persist computed early_minutes so the UI reflects the actual amount
    if (computedEarly !== (att.early_minutes ?? 0)) {
      await admin.from("attendance").update({ early_minutes: computedEarly }).eq("id", att.id);
    }

    // Ensure salary row
    let { data: salary } = await admin.from("salaries")
      .select("*").eq("user_id", user.id).eq("month", monthStart).maybeSingle();
    if (!salary) {
      const { data: profile } = await admin.from("profiles")
        .select("base_salary").eq("id", user.id).maybeSingle();
      const baseSalary = profile?.base_salary ?? 300000;
      const { data: created } = await admin.from("salaries")
        .insert({ user_id: user.id, month: monthStart, base_salary: baseSalary,
          current_salary: baseSalary, total_deductions: 0 })
        .select().single();
      salary = created;
    }

    if (deduction > 0) {
      const newCurrent = Math.max(0, (salary!.current_salary ?? 0) - deduction);
      const newDeductions = (salary!.total_deductions ?? 0) + deduction;
      await admin.from("salaries").update({
        current_salary: newCurrent,
        total_deductions: newDeductions,
        last_updated: new Date().toISOString(),
      }).eq("user_id", user.id).eq("month", monthStart);
      salary = { ...salary!, current_salary: newCurrent, total_deductions: newDeductions };
    }
    await admin.from("attendance").update({ deduction_applied: true }).eq("id", att.id);

    return new Response(JSON.stringify({
      ok: true, applied: true, deduction,
      current_salary: salary!.current_salary,
      total_deductions: salary!.total_deductions,
      base_salary: salary!.base_salary,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[apply-attendance-deduction] error:", err);
    return new Response(JSON.stringify({ error: "An internal error occurred. Please try again." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
