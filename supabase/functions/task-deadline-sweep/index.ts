// Runs once daily at end-of-day Yangon time (23:55 MMT = 17:25 UTC).
// 1) Auto-approve tasks/assignments whose deadline = today and status = submitted,
//    crediting a bonus transaction (bonus / 4 per unit).
// 2) Mark tasks/assignments whose deadline < today and status in (new, in_progress) as 'overdue'.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Today/yesterday in Yangon (UTC+6:30)
function yangonDateAt(offsetDays = 0) {
  const now = new Date();
  const ms = now.getTime() + (6.5 * 60 * 60 * 1000) + offsetDays * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

function monthStart(dateStr: string) {
  return dateStr.slice(0, 7) + "-01";
}

function getTaskUnitCount(startDate: string, endDate: string) {
  const days = Math.round(
    (new Date(endDate + "T00:00:00").getTime() - new Date(startDate + "T00:00:00").getTime()) / 86400000,
  );
  return days >= 12 ? 2 : 1;
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
    console.warn("[task-deadline-sweep] 401 — missing Authorization/apikey header");
    return new Response(JSON.stringify({ error: "Unauthorized: missing CRON_SECRET" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const allowed =
    (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
    (serviceRole && authHeader === `Bearer ${serviceRole}`) ||
    (!!anonKey && (authHeader === `Bearer ${anonKey}` || apikeyHeader === anonKey));
  if (!allowed) {
    console.warn("[task-deadline-sweep] 401 — invalid CRON_SECRET / unauthorized caller");
    return new Response(JSON.stringify({ error: "Unauthorized: invalid CRON_SECRET" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const today = yangonDateAt(0);
    const log = { auto_approved_tasks: 0, auto_approved_assignments: 0, overdue_tasks: 0, overdue_assignments: 0, bonus_tx: 0 };

    // ---- (A) AUTO-APPROVE TASKS (deadline = today, status submitted)
    const { data: subTasks } = await supabase
      .from("tasks")
      .select("id, assignee_id, title, due_date")
      .eq("submission_status", "submitted")
      .eq("due_date", today);

    if (subTasks && subTasks.length > 0) {
      const ms = monthStart(today);
      const taskIds = subTasks.map((t: any) => t.id);

      // Bulk update all submitted tasks → approved
      const { error: bulkUpErr } = await supabase
        .from("tasks")
        .update({
          submission_status: "approved",
          approved_at: new Date().toISOString(),
          auto_approved: true,
        })
        .in("id", taskIds);

      if (bulkUpErr) {
        console.error("[deadline-sweep] bulk approve tasks", bulkUpErr);
      } else {
        log.auto_approved_tasks = subTasks.length;

        // Compute per-unit bonuses in parallel
        const perUnitResults = await Promise.all(
          subTasks.map((t: any) =>
            supabase.rpc("compute_bonus_per_unit", { p_user_id: t.assignee_id, p_month: ms })
          )
        );

        const bonusPayload: any[] = [];
        subTasks.forEach((t: any, i: number) => {
          const amount = (perUnitResults[i].data as unknown as number) || 0;
          if (amount > 0) {
            bonusPayload.push({
              user_id: t.assignee_id,
              task_id: t.id,
              source: "task",
              month: ms,
              amount,
              unit_count: 1,
              deadline_date: t.due_date,
              approved_date: today,
              auto_approved: true,
              title: t.title,
            });
          }
        });

        if (bonusPayload.length > 0) {
          const { error: bErr } = await supabase.from("bonus_transactions").insert(bonusPayload);
          if (bErr) console.error("[deadline-sweep] bulk bonus tx (tasks)", bErr);
          else log.bonus_tx += bonusPayload.length;
        }
      }
    }

    // ---- (B) AUTO-APPROVE CALENDAR ASSIGNMENTS (event.end_date = today, status submitted)
    const { data: subAssigns } = await supabase
      .from("calendar_event_assignments")
      .select("id, user_id, event_id, submission_status")
      .eq("submission_status", "submitted");

    if (subAssigns && subAssigns.length > 0) {
      const eventIds = Array.from(new Set(subAssigns.map((a: any) => a.event_id)));
      const { data: evs } = await supabase
        .from("calendar_events")
        .select("id, title, end_date, start_date")
        .in("id", eventIds);
      const evMap = new Map((evs || []).map((e: any) => [e.id, e]));

      // Filter to assignments whose event ends today
      const dueAssigns = subAssigns.filter((a: any) => {
        const ev: any = evMap.get(a.event_id);
        return ev && ev.end_date === today;
      });

      if (dueAssigns.length > 0) {
        const ms = monthStart(today);
        const assIds = dueAssigns.map((a: any) => a.id);

        // Bulk update all due assignments → approved
        const { error: bulkUpErr } = await supabase
          .from("calendar_event_assignments")
          .update({
            submission_status: "approved",
            approved_at: new Date().toISOString(),
            auto_approved: true,
          })
          .in("id", assIds);

        if (bulkUpErr) {
          console.error("[deadline-sweep] bulk approve assignments", bulkUpErr);
        } else {
          log.auto_approved_assignments = dueAssigns.length;

          // Compute per-unit bonuses in parallel
          const perUnitResults = await Promise.all(
            dueAssigns.map((a: any) =>
              supabase.rpc("compute_bonus_per_unit", { p_user_id: a.user_id, p_month: ms })
            )
          );

          const bonusPayload: any[] = [];
          dueAssigns.forEach((a: any, i: number) => {
            const ev: any = evMap.get(a.event_id);
            const unit_count = getTaskUnitCount(ev.start_date, ev.end_date);
            const amount = ((perUnitResults[i].data as unknown as number) || 0) * unit_count;
            if (amount > 0) {
              bonusPayload.push({
                user_id: a.user_id,
                assignment_id: a.id,
                source: "calendar",
                month: ms,
                amount,
                unit_count,
                deadline_date: ev.end_date,
                approved_date: today,
                auto_approved: true,
                title: ev.title,
              });
            }
          });

          if (bonusPayload.length > 0) {
            const { error: bErr } = await supabase.from("bonus_transactions").insert(bonusPayload);
            if (bErr) console.error("[deadline-sweep] bulk bonus tx (assignments)", bErr);
            else log.bonus_tx += bonusPayload.length;
          }
        }
      }
    }


    // ---- (C) OVERDUE: tasks with due_date < today and status not (submitted/approved/rejected/overdue)
    const { count: ot } = await supabase
      .from("tasks")
      .update({ submission_status: "overdue" }, { count: "exact" })
      .lt("due_date", today)
      .in("submission_status", ["not_started", "in_progress", "not_submitted"]);
    log.overdue_tasks = ot || 0;

    // ---- (D) OVERDUE: calendar assignments where the parent event ended before today
    const { data: openAssigns } = await supabase
      .from("calendar_event_assignments")
      .select("id, event_id, submission_status")
      .in("submission_status", ["not_started", "in_progress", "not_submitted"]);
    if (openAssigns && openAssigns.length) {
      const ids = Array.from(new Set(openAssigns.map((a: any) => a.event_id)));
      const { data: evs2 } = await supabase
        .from("calendar_events")
        .select("id, end_date")
        .in("id", ids);
      const overdueEvIds = new Set(
        (evs2 || []).filter((e: any) => e.end_date < today).map((e: any) => e.id),
      );
      const toMark = openAssigns.filter((a: any) => overdueEvIds.has(a.event_id)).map((a: any) => a.id);
      if (toMark.length) {
        const { error } = await supabase
          .from("calendar_event_assignments")
          .update({ submission_status: "overdue" })
          .in("id", toMark);
        if (!error) log.overdue_assignments = toMark.length;
      }
    }

    // ---- (E) END-OF-WINDOW AUTO ALL-DONE
    // If today is the last day of an assignment window (3,10,17,24 MMT),
    // any member (staff/assistant) with NO task assignment whose start_date falls
    // within that window is auto-credited 1 unit (bonus = monthly_bonus / 4).
    const WINDOWS: Array<[number, number]> = [[1, 3], [8, 10], [15, 17], [22, 24]];
    const dom = parseInt(today.slice(8, 10), 10);
    const window = WINDOWS.find(([, e]) => e === dom);
    if (window) {
      const [ws, we] = window;
      const ym = today.slice(0, 7);
      const winStart = `${ym}-${String(ws).padStart(2, "0")}`;
      const winEnd = `${ym}-${String(we).padStart(2, "0")}`;
      const ms = monthStart(today);

      // System user = first admin (calendar_events.created_by must be NOT NULL).
      const { data: adminRow } = await supabase
        .from("profiles").select("id").eq("role", "admin").limit(1).maybeSingle();
      const systemUserId = (adminRow as any)?.id;

      if (systemUserId) {
        const { data: members } = await supabase
          .from("profiles").select("id, full_name").in("role", ["staff", "assistant"]);

        // All task events whose start_date falls within this window.
        const { data: winEvents } = await supabase
          .from("calendar_events")
          .select("id, start_date")
          .eq("event_type", "task")
          .gte("start_date", winStart)
          .lte("start_date", winEnd);
        const winEventIds = (winEvents || []).map((e: any) => e.id);
        const assignedUserIds = new Set<string>();
        if (winEventIds.length > 0) {
          const { data: wAss } = await supabase
            .from("calendar_event_assignments")
            .select("user_id, event_id")
            .in("event_id", winEventIds);
          (wAss || []).forEach((a: any) => assignedUserIds.add(a.user_id));
        }

        let autoCredited = 0;
        for (const m of (members || []) as Array<{ id: string; full_name: string }>) {
          if (assignedUserIds.has(m.id)) continue;

          const title = `Auto Credit (${winStart} → ${winEnd})`;
          const { data: ev } = await supabase.from("calendar_events").insert({
            title,
            description: "Auto-credited because no task was assigned in this window.",
            start_date: winStart,
            end_date: winEnd,
            event_type: "task",
            visibility: "private",
            assigned_to_all: false,
            created_by: systemUserId,
          }).select().single();
          if (!ev) continue;

          await supabase.from("calendar_event_assignments").insert({
            event_id: (ev as any).id,
            user_id: m.id,
            submission_status: "approved",
            approved_at: new Date().toISOString(),
            approved_by: systemUserId,
            auto_approved: true,
          });

          const { data: perUnit } = await supabase.rpc("compute_bonus_per_unit", {
            p_user_id: m.id, p_month: ms,
          });
          const amount = (perUnit as unknown as number) || 0;
          if (amount > 0) {
            await supabase.from("bonus_transactions").insert({
              user_id: m.id,
              source: "calendar",
              month: ms,
              amount,
              unit_count: 1,
              deadline_date: winEnd,
              approved_date: today,
              auto_approved: true,
              title,
            });
          }
          autoCredited++;
        }
        (log as any).auto_window_credits = autoCredited;
      }
    }

    return new Response(JSON.stringify({ ok: true, today, ...log }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[task-deadline-sweep] error", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
