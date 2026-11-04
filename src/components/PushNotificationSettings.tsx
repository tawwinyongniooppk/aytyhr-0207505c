import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Bell, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { sendPush } from "@/lib/push";
import { useNotifications } from "@/hooks/useNotifications";
import { currentNotificationPermission } from "@/lib/notificationSetup";

interface Props {
  showTest?: boolean;
  requiredForAttendance?: boolean;
}

export function PushNotificationSettings({ showTest = true, requiredForAttendance = false }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { pushEnabled: pushOn, setupStatus, setupError, enableNotifications, disableNotifications } = useNotifications();
  const [pushBusy, setPushBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  const handleTogglePush = async (next: boolean) => {
    if (!user) return;
    setPushBusy(true);
    try {
      if (next) {
        const result = await enableNotifications(true);
        if (!result.ok) {
          toast({
            title: "Could not enable notifications",
            description: result.reason,
            variant: "destructive",
          });
          return;
        }
        toast({ title: "Push notifications enabled ✓" });
      } else {
        await disableNotifications();
        toast({ title: "Push notifications disabled", description: "Attendance is unavailable until notifications are enabled again." });
      }
    } catch (e: any) {
      toast({
        title: "Update failed",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    } finally {
      setPushBusy(false);
    }
  };

  const handleTestPush = async () => {
    if (!user || !pushOn) return;
    setTesting(true);
    try {
      const ensureRegistered = await enableNotifications(false);
      if (!ensureRegistered.ok) {
        throw new Error(ensureRegistered.reason);
      }

      const result = await sendPush({
        user_ids: [user.id],
        title: "Test notification",
        body: "If you can see this, push notifications are working.",
        url: "/attendance",
      });
      if (!result?.ok) {
        throw result?.error ?? new Error("Test push failed");
      }
      toast({ title: "Test sent", description: "Check your device for the push notification." });
    } catch (e: any) {
      toast({ title: "Test failed", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card className="border border-border shadow-none">
      <CardHeader>
        <CardTitle className="text-base font-display flex items-center gap-2">
          <Bell className="h-4 w-4" /> {requiredForAttendance ? "Enable Notifications to Continue" : "Push Notifications"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {requiredForAttendance && <p className="text-sm text-muted-foreground">Please enable notifications to receive important HR updates and use Attendance.</p>}
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label className="text-sm">Enable push notifications</Label>
            <p className="text-xs text-muted-foreground">
              Receive task, leave, and calendar alerts on this device — even when the app is closed.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {pushBusy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            <Switch aria-label="Enable push notifications" checked={pushOn} disabled={pushBusy || setupStatus === "checking"} onCheckedChange={handleTogglePush} />
          </div>
        </div>
        {currentNotificationPermission() === "denied" && <p className="text-sm text-destructive" role="alert">Notifications are blocked. In your browser’s site settings, allow Notifications for this app. On your phone, also check Settings → Notifications for your browser or installed app, then return here.</p>}
        {setupError && <p className="text-sm text-destructive" role="alert">{setupError}</p>}
        {(requiredForAttendance || setupStatus === "failed") && (
          <Button onClick={() => handleTogglePush(true)} disabled={pushBusy || setupStatus === "checking"}>
            {pushBusy || setupStatus === "checking" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Bell className="h-4 w-4 mr-2" />}
            {setupStatus === "failed" ? "Retry Notification Setup" : "Enable Notifications"}
          </Button>
        )}
        {showTest && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleTestPush}
            disabled={testing || !pushOn}
          >
            {testing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Bell className="h-4 w-4 mr-2" />
            )}
            Test Push Notification
          </Button>
        )}
        {!pushOn && (
          <p className="text-xs text-muted-foreground">Enable notifications above to send a test.</p>
        )}
      </CardContent>
    </Card>
  );
}
