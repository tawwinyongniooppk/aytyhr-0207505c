// Runs once daily at end-of-day Yangon time (23:55 MMT = 17:25 UTC).
// (A) Auto-approve tasks whose deadline = today and status = submitted → credit 1 unit bonus.
// (B) Auto-approve calendar assignments whose event ends today and status = submitted → credit unit_count bonus.
// (C) Mark overdue tasks (deadline < today, status not submitted/approved/overdue OR rejected) → insert 0-amount bonus row.
// (D) Mark overdue calendar assignments (event ended before today, status not submitted/approved/overdue OR rejected) → insert 0-amount bonus row.
// (E) End-of-window auto all-done credits — bulk inserts.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

  const cronSecret = Deno.env.get("CRON_SECRET");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const authHeader = req.headers.get("Authorization") ?? "";
  const apikeyHeader = req.headers.get("apikey") ?? "";
  if (!authHeader && !apikeyHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized: missing CRON_SECRET" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const allowed =
    (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
    (serviceRole && authHeader === `Bearer ${serviceRole}`) ||
    (!!anonKey && (authHeader === `Bearer ${anonKey}` || apikeyHeader === anonKey));
  if (!allowed) {
    return new Response(JSON.stringify({ error: "Unauthorized: invalid CRON_SECRET" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const today = yangonDateAt(0);
    const nowIso = new Date().toISOString();
    const log: Record<string, number> = {
      auto_approved_tasks: 0,
      auto_approved_assignments: 0,
      overdue_tasks: 0,
      overdue_assignments: 0,
      bonus_tx: 0,
      zero_bonus_tx: 0,
      auto_window_credits: 0,
    };

    // ---------- (A) DEADLINE TASKS (due_date = today, status submitted OR already approved) ----------
    // Early-approved tasks (admin approved before deadline) are deferred: bonus is
    // only credited tonight, on the staff's own deadline day. Submitted-but-not-yet-
    // approved tasks are auto-approved here AND credited tonight.
    // Also backfill missed past deadlines (due_date <= today) so any prior
    // sweep that failed to credit early-approved tasks gets corrected tonight.
    const { data: dueDayTasks } = await supabase
      .from("tasks")
      .select("id, assignee_id, title, due_date, submission_status")
      .in("submission_status", ["submitted", "approved"])
      .lte("due_date", today);

    if (dueDayTasks && dueDayTasks.length > 0) {
      const ms = monthStart(today);
      const toApprove = dueDayTasks.filter((t: any) => t.submission_status === "submitted");
      if (toApprove.length > 0) {
        const { error: bulkUpErr } = await supabase
          .from("tasks")
          .update({ submission_status: "approved", approved_at: nowIso, auto_approved: true })
          .in("id", toApprove.map((t: any) => t.id));
        if (bulkUpErr) console.error("[deadline-sweep] bulk approve tasks", bulkUpErr);
        else log.auto_approved_tasks = toApprove.length;
      }

      // Skip tasks that already have a bonus_transactions row (idempotency).
      const taskIds = dueDayTasks.map((t: any) => t.id);
      const { data: existingBt } = await supabase
        .from("bonus_transactions")
        .select("task_id")
        .in("task_id", taskIds);
      const alreadyCredited = new Set(
        (existingBt || []).map((b: any) => b.task_id).filter(Boolean),
      );
      const toCredit = dueDayTasks.filter((t: any) => !alreadyCredited.has(t.id));

      if (toCredit.length > 0) {
        const perUnitResults = await Promise.all(
          toCredit.map((t: any) =>
            supabase.rpc("compute_bonus_per_unit", { p_user_id: t.assignee_id, p_month: ms })
          ),
        );

        const bonusPayload: any[] = [];
        toCredit.forEach((t: any, i: number) => {
          const perUnit = (perUnitResults[i].data as unknown as number) || 0;
          const amount = perUnit * 1; // tasks = 1 Unit
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

    // ---------- (B) DEADLINE CALENDAR ASSIGNMENTS (event.end_date = today, status submitted OR approved) ----------
    const { data: subAssigns } = await supabase
      .from("calendar_event_assignments")
      .select("id, user_id, event_id, submission_status")
      .in("submission_status", ["submitted", "approved"]);

    if (subAssigns && subAssigns.length > 0) {
      const eventIds = Array.from(new Set(subAssigns.map((a: any) => a.event_id)));
      const { data: evs } = await supabase
        .from("calendar_events")
        .select("id, title, end_date, start_date")
        .in("id", eventIds);
      const evMap = new Map((evs || []).map((e: any) => [e.id, e]));

      const dueAssigns = subAssigns.filter((a: any) => {
        const ev: any = evMap.get(a.event_id);
        return ev && ev.end_date <= today;
      });

      if (dueAssigns.length > 0) {
        const ms = monthStart(today);
        const toApprove = dueAssigns.filter((a: any) => a.submission_status === "submitted");
        if (toApprove.length > 0) {
          const { error: bulkUpErr } = await supabase
            .from("calendar_event_assignments")
            .update({ submission_status: "approved", approved_at: nowIso, auto_approved: true })
            .in("id", toApprove.map((a: any) => a.id));
          if (bulkUpErr) console.error("[deadline-sweep] bulk approve assignments", bulkUpErr);
          else log.auto_approved_assignments = toApprove.length;
        }

        // Skip assignments that already have a bonus_transactions row.
        const assIds = dueAssigns.map((a: any) => a.id);
        const { data: existingBt } = await supabase
          .from("bonus_transactions")
          .select("assignment_id")
          .in("assignment_id", assIds);
        const alreadyCredited = new Set(
          (existingBt || []).map((b: any) => b.assignment_id).filter(Boolean),
        );
        const toCredit = dueAssigns.filter((a: any) => !alreadyCredited.has(a.id));

        if (toCredit.length > 0) {
          const perUnitResults = await Promise.all(
            toCredit.map((a: any) =>
              supabase.rpc("compute_bonus_per_unit", { p_user_id: a.user_id, p_month: ms })
            ),
          );

          const bonusPayload: any[] = [];
          toCredit.forEach((a: any, i: number) => {
            const ev: any = evMap.get(a.event_id);
            const unit_count = getTaskUnitCount(ev.start_date, ev.end_date);
            const perUnit = (perUnitResults[i].data as unknown as number) || 0;
            const amount = perUnit * unit_count; // perUnit = monthly_bonus / 4
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


    // ---------- (C) OVERDUE TASKS — bulk update + 0-amount bonus rows ----------
    const ms = monthStart(today);
    const { data: overdueTasks } = await supabase
      .from("tasks")
      .select("id, assignee_id, title, due_date")
      .lt("due_date", today)
      .in("submission_status", ["not_started", "in_progress", "not_submitted", "rejected"]);

    if (overdueTasks && overdueTasks.length > 0) {
      const ids = overdueTasks.map((t: any) => t.id);
      const { error: upErr } = await supabase
        .from("tasks")
        .update({ submission_status: "overdue" })
        .in("id", ids);

      if (upErr) {
        console.error("[deadline-sweep] bulk overdue tasks", upErr);
      } else {
        log.overdue_tasks = overdueTasks.length;

        const zeroPayload = overdueTasks.map((t: any) => ({
          user_id: t.assignee_id,
          task_id: t.id,
          source: "task",
          month: ms,
          amount: 0,
          unit_count: 0,
          deadline_date: t.due_date,
          approved_date: today,
          auto_approved: true,
          title: `${t.title} - No Bonus (Overdue/Rejected)`,
        }));

        if (zeroPayload.length > 0) {
          const { error: bErr } = await supabase.from("bonus_transactions").insert(zeroPayload);
          if (bErr) console.error("[deadline-sweep] zero bonus tx (tasks)", bErr);
          else log.zero_bonus_tx += zeroPayload.length;
        }
      }
    }

    // ---------- (D) OVERDUE CALENDAR ASSIGNMENTS — bulk update + 0-amount bonus rows ----------
    const { data: openAssigns } = await supabase
      .from("calendar_event_assignments")
      .select("id, user_id, event_id, submission_status")
      .in("submission_status", ["not_started", "in_progress", "not_submitted", "rejected"]);

    if (openAssigns && openAssigns.length) {
      const evIds = Array.from(new Set(openAssigns.map((a: any) => a.event_id)));
      const { data: evs2 } = await supabase
        .from("calendar_events")
        .select("id, title, end_date")
        .in("id", evIds);
      const evMap2 = new Map((evs2 || []).map((e: any) => [e.id, e]));

      const toOverdue = openAssigns.filter((a: any) => {
        const ev: any = evMap2.get(a.event_id);
        return ev && ev.end_date < today;
      });

      if (toOverdue.length) {
        const ids = toOverdue.map((a: any) => a.id);
        const { error: upErr } = await supabase
          .from("calendar_event_assignments")
          .update({ submission_status: "overdue" })
          .in("id", ids);

        if (upErr) {
          console.error("[deadline-sweep] bulk overdue assignments", upErr);
        } else {
          log.overdue_assignments = toOverdue.length;

          const zeroPayload = toOverdue.map((a: any) => {
            const ev: any = evMap2.get(a.event_id);
            return {
              user_id: a.user_id,
              assignment_id: a.id,
              source: "calendar",
              month: ms,
              amount: 0,
              unit_count: 0,
              deadline_date: ev?.end_date ?? today,
              approved_date: today,
              auto_approved: true,
              title: `${ev?.title ?? "Calendar Task"} - No Bonus (Overdue/Rejected)`,
            };
          });

          if (zeroPayload.length > 0) {
            const { error: bErr } = await supabase.from("bonus_transactions").insert(zeroPayload);
            if (bErr) console.error("[deadline-sweep] zero bonus tx (assignments)", bErr);
            else log.zero_bonus_tx += zeroPayload.length;
          }
        }
      }
    }

    // Window auto-credit is handled by auto-weekly-task-credit only.

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
