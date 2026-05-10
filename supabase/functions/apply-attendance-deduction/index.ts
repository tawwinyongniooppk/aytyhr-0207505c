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

    // Get per-staff rate (falls back to global app_settings, then 200)
    const { data: profileRate } = await admin.from("profiles")
      .select("deduction_rate_per_minute").eq("id", user.id).maybeSingle();
    let rate = Number((profileRate as any)?.deduction_rate_per_minute);
    if (!rate || Number.isNaN(rate)) {
      const { data: rateRow } = await admin.from("app_settings")
        .select("value").eq("key", "deduction_rate_per_minute").maybeSingle();
      rate = Number(rateRow?.value ?? 200) || 0;
    }

    // Approved leave / late excuse for today — only "paid" approvals excuse the deduction
    const { data: approved } = await admin.from("leave_requests")
      .select("type, payment_type").eq("user_id", user.id).eq("date", today).eq("status", "approved");
    const paid = (approved ?? []).filter((r: any) => (r.payment_type ?? "paid") === "paid");
    const types = paid.map((r: any) => r.type);
    const hasLeave = types.includes("leave");
    const hasLateExcuse = types.includes("late_excuse");
    const hasPartialLeave = types.includes("partial_leave");

    // Paid approvals (full leave, late excuse, partial leave) excuse minute-based salary deduction
    const excused = hasLeave || hasLateExcuse || hasPartialLeave;
    const lateMin = excused ? 0 : (att.late_minutes ?? 0);
    const earlyMin = hasLeave || hasPartialLeave ? 0 : (att.early_minutes ?? 0);
    const deduction = (lateMin + earlyMin) * rate;

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
