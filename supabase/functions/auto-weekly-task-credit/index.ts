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

function parseOverrideWindow(raw: string | null, year: number, month: number) {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  const weekMap: Record<string, number> = { week1: 3, week2: 10, week3: 17, week4: 24 };
  if (normalized in weekMap) {
    return weekWindow(weekMap[normalized], year, month);
  }

  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const [, y, m, d] = match;
  return weekWindow(Number(d), Number(y), Number(m));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Cron-only endpoint: require CRON_SECRET, service role, or anon-key (pg_cron internal).
  const cronSecret = Deno.env.get("CRON_SECRET");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const authHeader = req.headers.get("Authorization") ?? "";
  const apikeyHeader = req.headers.get("apikey") ?? "";
  if (!authHeader && !apikeyHeader) {
    console.warn("[auto-weekly-credit] 401 — missing Authorization/apikey header");
    return new Response(JSON.stringify({ error: "Unauthorized: missing CRON_SECRET" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const allowed =
    (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
    (SERVICE_ROLE && authHeader === `Bearer ${SERVICE_ROLE}`) ||
    (!!anonKey && (authHeader === `Bearer ${anonKey}` || apikeyHeader === anonKey));
  if (!allowed) {
    console.warn("[auto-weekly-credit] 401 — invalid CRON_SECRET / unauthorized caller");
    return new Response(JSON.stringify({ error: "Unauthorized: invalid CRON_SECRET" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  try {
    const t = mmtToday();
    const overrideWindow = parseOverrideWindow(req.headers.get("x-force-window"), t.y, t.m);
    const win = overrideWindow ?? weekWindow(t.d, t.y, t.m);
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

    // 3) "Covered" = staff already has an ACTIVE assigned commitment whose own
    //    deadline reaches/passes this checkpoint's end. That includes biweekly
    //    tasks created in a previous week-window whose deadline is still future.
    //    We must NOT auto-credit those staff just because no NEW task fell into
    //    this specific window — their existing deadline still owns the slot.
    const [taskRes, evRes] = await Promise.all([
      admin
        .from("tasks")
        .select("assignee_id, due_date, created_at")
        .or(`due_date.gte.${win.start},and(due_date.is.null,created_at.gte.${win.start}T00:00:00)`),
      admin
        .from("calendar_events")
        .select("id, start_date, end_date, event_type")
        .eq("event_type", "task")
        .lte("start_date", win.end)
        .gte("end_date", win.start),
    ]);

    const coveredSet = new Set<string>();

    // Tasks: any task with due_date >= win.start covers the staff for this checkpoint
    // (it is still active or just finished within this window).
    for (const t of (taskRes.data as { assignee_id: string; due_date: string | null; created_at: string }[]) || []) {
      const due = t.due_date ?? t.created_at.slice(0, 10);
      if (due >= win.start) coveredSet.add(t.assignee_id);
    }

    // Calendar events: include both events ending within this window and events
    // still ongoing past it (deadline > win.end) — both count as already-assigned.
    const evIds = ((evRes.data as { id: string }[]) || []).map((e) => e.id);
    if (evIds.length > 0) {
      const { data: assRows } = await admin
        .from("calendar_event_assignments")
        .select("user_id, event_id")
        .in("event_id", evIds);
      for (const a of (assRows as { user_id: string; event_id: string }[]) || []) {
        coveredSet.add(a.user_id);
      }
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

    const missing = staffList.filter((s) => !coveredSet.has(s.id));
    if (missing.length === 0) {
      return new Response(JSON.stringify({ window: win, missing: 0, covered: coveredSet.size }), {
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

    // 6) Bulk-create assignments + bonus_transactions for all missing staff
    const nowIso = new Date().toISOString();
    const monthStart = t.monthStart;

    // 6a) Prefetch monthly bonus for all missing users in a single query
    const missingIds = missing.map((s) => s.id);
    const { data: salRows } = await admin
      .from("salaries")
      .select("user_id, bonus")
      .eq("month", monthStart)
      .in("user_id", missingIds);
    const bonusByUser = new Map<string, number>();
    for (const r of (salRows as { user_id: string; bonus: number | null }[]) || []) {
      bonusByUser.set(r.user_id, Number(r.bonus ?? 0));
    }

    // 6b) Build assignments payload and bulk insert
    const assignmentsPayload = missing.map((s) => ({
      event_id: ev.id,
      user_id: s.id,
      submission_status: "approved",
      submitted_at: nowIso,
      approved_at: nowIso,
      approved_by: systemCreator,
      auto_approved: true,
    }));

    const { data: insertedAssignments, error: bulkAssErr } = await admin
      .from("calendar_event_assignments")
      .insert(assignmentsPayload)
      .select("id, user_id");
    if (bulkAssErr) throw bulkAssErr;

    const assByUser = new Map<string, string>();
    for (const a of (insertedAssignments as { id: string; user_id: string }[]) || []) {
      assByUser.set(a.user_id, a.id);
    }

    // 6c) Build bonus_transactions payload (only users with perUnit > 0) and bulk insert
    const bonusPayload: Record<string, unknown>[] = [];
    const perUnitByUser = new Map<string, number>();
    for (const s of missing) {
      const totalBonus = bonusByUser.get(s.id) ?? 0;
      // Clean 4-part split: round to nearest integer so 4 × perUnit ≈ totalBonus
      // without arbitrary floor truncation (e.g. 10000/4 = 2500 exactly, 10001/4 → 2500).
      const perUnit = totalBonus > 0 ? Math.round(totalBonus / 4) : 0;
      perUnitByUser.set(s.id, perUnit);
      const assignmentId = assByUser.get(s.id);
      if (perUnit > 0 && assignmentId) {
        bonusPayload.push({
          user_id: s.id,
          assignment_id: assignmentId,
          source: "calendar",
          month: monthStart,
          amount: perUnit,
          unit_count: 1,
          deadline_date: win.end,
          approved_date: t.iso,
          auto_approved: true,
          title: creditTitle,
        });
      }
    }

    if (bonusPayload.length > 0) {
      const { error: bulkBtErr } = await admin.from("bonus_transactions").insert(bonusPayload);
      if (bulkBtErr) {
        console.error("[auto-weekly-credit] bulk bonus tx error, retrying per-row", bulkBtErr);
        // Per-row retry so one bad row doesn't drop everyone's credit silently.
        for (const row of bonusPayload) {
          const { error: rowErr } = await admin.from("bonus_transactions").insert(row);
          if (rowErr) {
            console.error("[auto-weekly-credit] per-row bonus insert FAILED for user", row.user_id, rowErr);
          }
        }
      }
    }

    // Safety net: re-scan all auto-credited assignments for THIS event and
    // backfill any missing bonus_transactions (e.g. from a prior failed run).
    {
      const { data: allAss } = await admin
        .from("calendar_event_assignments")
        .select("id, user_id")
        .eq("event_id", ev.id);
      const assIds = ((allAss as { id: string; user_id: string }[]) || []).map((a) => a.id);
      if (assIds.length > 0) {
        const { data: existingBt } = await admin
          .from("bonus_transactions")
          .select("assignment_id")
          .in("assignment_id", assIds);
        const have = new Set(((existingBt as { assignment_id: string }[]) || []).map((b) => b.assignment_id));
        const missingRows = (allAss as { id: string; user_id: string }[]).filter((a) => !have.has(a.id));
        for (const a of missingRows) {
          const totalBonus = bonusByUser.get(a.user_id) ?? 0;
          const perUnit = totalBonus > 0 ? Math.round(totalBonus / 4) : 0;
          if (perUnit <= 0) continue;
          const { error: fixErr } = await admin.from("bonus_transactions").insert({
            user_id: a.user_id,
            assignment_id: a.id,
            source: "calendar",
            month: monthStart,
            amount: perUnit,
            unit_count: 1,
            deadline_date: win.end,
            approved_date: t.iso,
            auto_approved: true,
            title: creditTitle,
          });
          if (fixErr) console.error("[auto-weekly-credit] backfill bonus insert FAILED", a.user_id, fixErr);
        }
      }
    }

    const credited = insertedAssignments?.length ?? 0;

    // 6d) Push notifications (fire-and-forget, in parallel)
    await Promise.allSettled(
      missing
        .filter((s) => assByUser.has(s.id))
        .map((s) => {
          const perUnit = perUnitByUser.get(s.id) ?? 0;
          return fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
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
        }),
    );

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
