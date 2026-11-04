import { useNotifications } from "@/hooks/useNotifications";
import { PushNotificationSettings } from "@/components/PushNotificationSettings";

export function AttendanceNotificationGate({ children }: { children: React.ReactNode }) {
  const { attendanceReady } = useNotifications();
  if (!attendanceReady()) {
    return <div className="max-w-lg space-y-4"><PushNotificationSettings requiredForAttendance /></div>;
  }
  return <>{children}</>;
}