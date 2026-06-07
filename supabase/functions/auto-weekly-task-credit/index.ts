// Runs at MMT midnight on day 3, 10, 17, 24 of every month.
// For each staff who was NOT manually assigned a task within the current
// "week window" (prev checkpoint+1 .. today), the system credits them
// 1 unit (auto-approved task) plus 1/4 of their monthly bonus.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// MMT today (UTC+6:30)
function mmtToday(): { y: number; m: number; d: number; iso: string; monthStart: string } {
  const nowMs = Date.now() + (6 * 60 + 30) * 60 * 1000;
  const d = new Date(nowMs);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const dom = d.getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    y,
    m,
    d: dom,
    iso: `${y}-${pad(m)}-${pad(dom)}`,
    monthStart: `${y}-${pad(m)}-01`,
  };
}

// Given today's day-of-month, derive [windowStart, windowEnd] (inclusive ISO dates).
function weekWindow(day: number, year: number, month: number) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const mk = (d: number) => `${year}-${pad(month)}-${pad(d)}`;
  // Checkpoint covers (prevCheckpoint+1 .. day). Day 3 → [1..3]; 10 → [4..10]; 17 → [11..17]; 24 → [18..24].
  if (day >= 24) return { start: mk(18), end: mk(24), label: "Week 4" };
  if (day >= 17) return { start: mk(11), end: mk(17), label: "Week 3" };
  if (day >= 10) return { start: mk(4), end: mk(10), label: "Week 2" };
  if (day >= 3) return { start: mk(1), end: mk(3), label: "Week 1" };
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Cron-only endpoint: require CRON_SECRET, service role, or anon-key (pg_cron internal).
  const cronSecret = Deno.env.get("CRON_SECRET");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const authHeader = req.headers.get("Authorization") ?? "";
  const apikeyHeader = req.headers.get("apikey") ?? "";
  const allowed =
    (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
    (SERVICE_ROLE && authHeader === `Bearer ${SERVICE_ROLE}`) ||
    (!!anonKey && (authHeader === `Bearer ${anonKey}` || apikeyHeader === anonKey));
  if (!allowed) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  try {
    const t = mmtToday();
    const win = weekWindow(t.d, t.y, t.m);
    if (!win) {
      return new Response(JSON.stringify({ skipped: true, reason: "not a checkpoint day", day: t.d }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // 1) All active staff
    const { data: staff } = await admin
      .from("profiles")
      .select("id, full_name")
      .eq("role", "staff");
    const staffList = (staff as { id: string; full_name: string }[]) || [];

    // 2) Find admins (to attribute the system event)
    const { data: admins } = await admin
      .from("profiles")
      .select("id")
      .in("role", ["admin", "it_manager"])
      .limit(1);
    const systemCreator = (admins as { id: string }[])?.[0]?.id ?? staffList[0]?.id;
    if (!systemCreator) {
      return new Response(JSON.stringify({ skipped: true, reason: "no creator id" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3) For each staff, check if any task was assigned to them within the window
    //    by admin OR assistant. Both `tasks` and `calendar_event_assignments` count.
    const [taskRes, evAssRes, evRes] = await Promise.all([
      admin
        .from("tasks")
        .select("assignee_id, created_at, assigned_by")
        .gte("created_at", `${win.start}T00:00:00`)
        .lt("created_at", `${win.end}T23:59:59`),
      admin
        .from("calendar_event_assignments")
        .select("user_id, event_id"),
      admin
        .from("calendar_events")
        .select("id, start_date, end_date, event_type, created_by")
        .gte("start_date", win.start)
        .lte("start_date", win.end)
        .eq("event_type", "task"),
    ]);

    const assignedSet = new Set<string>();
    for (const t of (taskRes.data as { assignee_id: string }[]) || []) assignedSet.add(t.assignee_id);
    const evIds = new Set(((evRes.data as { id: string }[]) || []).map((e) => e.id));
    for (const a of (evAssRes.data as { user_id: string; event_id: string }[]) || []) {
      if (evIds.has(a.event_id)) assignedSet.add(a.user_id);
    }

    // 4) Idempotency: skip if we already credited this window
    const creditTitle = `Auto Weekly Credit — ${win.label} (${win.start} → ${win.end})`;
    const { data: existing } = await admin
      .from("calendar_events")
      .select("id, title")
      .eq("title", creditTitle)
      .maybeSingle();
    if (existing) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "already credited this window", title: creditTitle }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const missing = staffList.filter((s) => !assignedSet.has(s.id));
    if (missing.length === 0) {
      return new Response(JSON.stringify({ window: win, missing: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5) Create one shared system calendar event for this window
    const { data: ev, error: evErr } = await admin
      .from("calendar_events")
      .insert({
        title: creditTitle,
        description: "System-generated auto-credit because no manual task was assigned in this week window.",
        start_date: win.start,
        end_date: win.end,
        event_type: "task",
        visibility: "private",
        created_by: systemCreator,
      })
      .select("id")
      .single();
    if (evErr || !ev) throw evErr ?? new Error("event insert failed");

    // 6) For each missing staff: create approved assignment + bonus_transaction (¼ of monthly bonus)
    const nowIso = new Date().toISOString();
    const monthStart = t.monthStart;
    let credited = 0;

    for (const s of missing) {
      // 6a) Approved assignment counts as a +1 unit in "All Done"
      const { data: ass, error: assErr } = await admin
        .from("calendar_event_assignments")
        .insert({
          event_id: ev.id,
          user_id: s.id,
          submission_status: "approved",
          submitted_at: nowIso,
          approved_at: nowIso,
          approved_by: systemCreator,
          auto_approved: true,
        })
        .select("id")
        .single();
      if (assErr) {
        console.error("[auto-weekly-credit] assignment error", s.id, assErr);
        continue;
      }

      // 6b) Bonus = 1/4 of monthly bonus for this user
      const { data: sal } = await admin
        .from("salaries")
        .select("bonus")
        .eq("user_id", s.id)
        .eq("month", monthStart)
        .maybeSingle();
      const totalBonus = Number((sal as { bonus?: number } | null)?.bonus ?? 0);
      const perUnit = Math.floor(totalBonus / 4);

      if (perUnit > 0 && ass) {
        const { error: btErr } = await admin.from("bonus_transactions").insert({
          user_id: s.id,
          assignment_id: ass.id,
          source: "calendar",
          month: monthStart,
          amount: perUnit,
          unit_count: 1,
          deadline_date: win.end,
          approved_date: t.iso,
          auto_approved: true,
          title: creditTitle,
        });
        if (btErr) console.error("[auto-weekly-credit] bonus tx error", s.id, btErr);
      }

      credited++;

      // 6c) Push notification to staff
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_ROLE}`,
          },
          body: JSON.stringify({
            user_ids: [s.id],
            title: "Auto Weekly Credit",
            body: `${win.label} အတွက် 1 Unit + Bonus (${perUnit.toLocaleString()} MMK) auto-credited.`,
            url: "/salary",
          }),
        });
      } catch (e) {
        console.error("[auto-weekly-credit] push error", e);
      }
    }

    return new Response(
      JSON.stringify({ window: win, total_staff: staffList.length, missing: missing.length, credited }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[auto-weekly-task-credit]", e);
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
