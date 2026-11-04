import { describe, expect, it } from "vitest";
import { attendanceNotificationsReady } from "@/lib/notificationSetup";
import { parseStaffEvent, verifyStaffEventRecord, isUnregisteredFcmError } from "../../supabase/functions/send-push/eventRules";

describe("mandatory Attendance notification setup", () => {
  it("requires confirmed registration with granted permission", () => {
    expect(attendanceNotificationsReady("ready", true, "granted")).toBe(true);
    expect(attendanceNotificationsReady("failed", true, "granted")).toBe(false);
    expect(attendanceNotificationsReady("checking", true, "granted")).toBe(false);
  });
  it("blocks default, denied, revoked and unsupported permission", () => {
    for (const permission of ["default", "denied", "unsupported"] as const) {
      expect(attendanceNotificationsReady("ready", true, permission)).toBe(false);
    }
  });
  it("disabling existing push preference blocks Attendance", () => {
    expect(attendanceNotificationsReady("ready", false, "granted")).toBe(false);
  });
});

describe("verified staff event authorization", () => {
  const event = { type: "leave_requested" as const, record_id: "12345678-1234-4234-8234-123456789abc" };
  const now = Date.parse("2026-11-04T01:00:00Z");
  const row = { user_id: "staff-a", status: "pending", created_at: new Date(now - 1000).toISOString() };
  it("accepts only known events and valid record identifiers", () => {
    expect(parseStaffEvent(event)).toEqual({ ...event, source: undefined });
    expect(parseStaffEvent({ ...event, type: "arbitrary_message" })).toBeNull();
    expect(parseStaffEvent({ ...event, record_id: "bad" })).toBeNull();
    expect(parseStaffEvent({ ...event, type: "task_submitted" })).toBeNull();
  });
  it("allows only the caller's recent pending request", () => {
    expect(verifyStaffEventRecord(event, row, "staff-a", now)).toBe(true);
    expect(verifyStaffEventRecord(event, row, "staff-b", now)).toBe(false);
    expect(verifyStaffEventRecord(event, { ...row, status: "rejected" }, "staff-a", now)).toBe(false);
    expect(verifyStaffEventRecord(event, { ...row, created_at: new Date(now - 301000).toISOString() }, "staff-a", now)).toBe(false);
  });
  it("requires submitted state and matching task owner", () => {
    const taskEvent = { ...event, type: "task_submitted" as const, source: "tasks" as const };
    const task = { assignee_id: "staff-a", submission_status: "submitted", submitted_at: new Date(now).toISOString() };
    expect(verifyStaffEventRecord(taskEvent, task, "staff-a", now)).toBe(true);
    expect(verifyStaffEventRecord(taskEvent, { ...task, submission_status: "approved" }, "staff-a", now)).toBe(false);
  });
  it("does not prune tokens for generic malformed-message errors", () => {
    expect(isUnregisteredFcmError(JSON.stringify({ error: { status: "INVALID_ARGUMENT" } }))).toBe(false);
    expect(isUnregisteredFcmError(JSON.stringify({ error: { details: [{ "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode: "UNREGISTERED" }] } }))).toBe(true);
  });
});