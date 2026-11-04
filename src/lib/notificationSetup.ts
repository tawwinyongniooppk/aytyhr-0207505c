export type NotificationSetupStatus = "checking" | "ready" | "incomplete" | "failed" | "unsupported";

export function attendanceNotificationsReady(
  status: NotificationSetupStatus,
  enabled: boolean,
  permission: NotificationPermission | "unsupported",
) {
  return status === "ready" && enabled && permission === "granted";
}

export function currentNotificationPermission(): NotificationPermission | "unsupported" {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}