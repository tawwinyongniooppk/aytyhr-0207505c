export const STAFF_EVENT_TYPES = ["attendance_check_in", "attendance_check_out", "leave_requested", "overtime_requested", "task_submitted", "task_resubmitted"] as const;
export type StaffEventType = typeof STAFF_EVENT_TYPES[number];
export type StaffEvent = { type: StaffEventType; record_id: string; source?: "tasks" | "calendar_event_assignments" };

export function parseStaffEvent(value: unknown): StaffEvent | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (!STAFF_EVENT_TYPES.includes(row.type as StaffEventType) ||
      typeof row.record_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.record_id)) return null;
  if ((row.type === "task_submitted" || row.type === "task_resubmitted") &&
      row.source !== "tasks" && row.source !== "calendar_event_assignments") return null;
  return { type: row.type as StaffEventType, record_id: row.record_id, source: row.source as StaffEvent["source"] };
}

export function verifyStaffEventRecord(event: StaffEvent, row: Record<string, unknown>, callerId: string, now = Date.now()) {
  const owner = event.source === "tasks" ? row.assignee_id : row.user_id;
  if (owner !== callerId) return false;
  const timestamp = event.type === "attendance_check_in" ? row.check_in_time
    : event.type === "attendance_check_out" ? row.check_out_time
    : event.type.startsWith("task_") ? row.submitted_at : row.created_at;
  const time = typeof timestamp === "string" ? Date.parse(timestamp) : NaN;
  if (!Number.isFinite(time) || time > now + 30_000 || now - time > 5 * 60_000) return false;
  if (event.type.endsWith("requested") && row.status !== "pending") return false;
  if (event.type.startsWith("task_") && row.submission_status !== "submitted") return false;
  return true;
}

export function isUnregisteredFcmError(body: string) {
  try {
    const parsed = JSON.parse(body);
    return Array.isArray(parsed?.error?.details) && parsed.error.details.some((detail: { "@type"?: string; errorCode?: string }) =>
      detail["@type"] === "type.googleapis.com/google.firebase.fcm.v1.FcmError" && detail.errorCode === "UNREGISTERED");
  } catch { return false; }
}