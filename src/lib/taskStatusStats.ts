// Shared logic for the per-staff monthly task status grid.
// Used by:
//   - CalendarPage "Create Task" assign dialog (admin/assistant)
//   - StatusMonitor section in Staff My Tasks (read-only)
//
// Status buckets are mutually exclusive — each task's units land in exactly
// ONE column. The seven columns are:
//   newTask, inProgress, submitted, approved, overdue, reject, allDone
//
// "approved" = admin approved but the deadline has not yet passed
//              (bonus credit is deferred to the deadline night).
// "allDone"  = approved AND deadline has been reached → bonus credited.

export interface MemberStats {
  newTask: number;
  inProgress: number;
  submitted: number;
  approved: number;
  overdue: number;
  reject: number;
  allDone: number;
}

export function emptyMemberStats(): MemberStats {
  return { newTask: 0, inProgress: 0, submitted: 0, approved: 0, overdue: 0, reject: 0, allDone: 0 };
}

export function getTaskUnitCount(startDate: string, endDate: string): number {
  const days = Math.round(
    (new Date(endDate + "T00:00:00").getTime() - new Date(startDate + "T00:00:00").getTime()) / 86400000,
  );
  return days >= 12 ? 2 : 1;
}

interface EventLite { id: string; start_date: string; end_date: string }
interface AssignmentLite {
  user_id: string;
  event_id: string;
  submission_status: string | null;
  approved_at?: string | null;
}

export function computeMemberStats(
  events: EventLite[],
  assignments: AssignmentLite[],
  todayStr: string,
): Record<string, MemberStats> {
  const evMap = new Map(events.map((e) => [e.id, e]));
  const stats: Record<string, MemberStats> = {};

  for (const a of assignments) {
    const ev = evMap.get(a.event_id);
    if (!ev) continue;
    const unit = getTaskUnitCount(ev.start_date, ev.end_date);
    const status = a.submission_status || "not_started";
    const s = stats[a.user_id] || emptyMemberStats();
    const deadlinePassed = ev.end_date <= todayStr;

    if (status === "approved" && !!a.approved_at && deadlinePassed) {
      s.allDone += unit;
    } else if (status === "approved") {
      // approved early — deadline not yet reached, bonus credit deferred
      s.approved += unit;
    } else if (status === "rejected") {
      s.reject += unit;
    } else if (status === "submitted") {
      s.submitted += unit;
    } else if (status === "in_progress") {
      if (ev.end_date < todayStr) s.overdue += unit;
      else s.inProgress += unit;
    } else {
      // not_started / new
      if (ev.end_date < todayStr) s.overdue += unit;
      else s.newTask += unit;
    }
    stats[a.user_id] = s;
  }

  return stats;
}

export const STATUS_COLUMNS: Array<{ key: keyof MemberStats; label: string; cls: string }> = [
  { key: "newTask",    label: "New Task",    cls: "bg-muted text-muted-foreground" },
  { key: "inProgress", label: "In Progress", cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  { key: "submitted",  label: "Submitted",   cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  { key: "approved",   label: "Approved",    cls: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400" },
  { key: "overdue",    label: "Overdue",     cls: "bg-destructive/10 text-destructive" },
  { key: "reject",     label: "Reject",      cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  { key: "allDone",    label: "All Done",    cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
];
