import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Bell, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  isPushEnabled,
  registerCurrentDevicePushToken,
  setPushEnabled,
  unregisterCurrentDevicePushToken,
  sendPush,
} from "@/lib/push";
import { getPushAvailability } from "@/lib/firebase";

interface Props {
  showTest?: boolean;
}

export function PushNotificationSettings({ showTest = true }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [pushOn, setPushOn] = useState<boolean>(isPushEnabled());
  const [pushBusy, setPushBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  const handleTogglePush = async (next: boolean) => {
    if (!user) return;
    setPushBusy(true);
    try {
      if (next) {
        const availability = await getPushAvailability();
        if (!availability.supported) {
          toast({
            title: "Push not available here",
            description: availability.reason,
            variant: "destructive",
          });
          return;
        }

        const result = await registerCurrentDevicePushToken({ prompt: true });
        if (!result.ok) {
          toast({
            title: "Could not enable notifications",
            description: result.reason,
            variant: "destructive",
          });
          return;
        }
        setPushEnabled(true);
        setPushOn(true);
        toast({ title: "Push notifications enabled ✓" });
      } else {
        await unregisterCurrentDevicePushToken();
        setPushEnabled(false);
        setPushOn(false);
        toast({ title: "Push notifications disabled" });
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
    if (!user) return;
    setTesting(true);
    try {
      const ensureRegistered = await registerCurrentDevicePushToken({ prompt: false });
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
          <Bell className="h-4 w-4" /> Push Notifications
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label className="text-sm">Enable push notifications</Label>
            <p className="text-xs text-muted-foreground">
              Receive task, leave, and calendar alerts on this device — even when the app is closed.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {pushBusy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            <Switch checked={pushOn} disabled={pushBusy} onCheckedChange={handleTogglePush} />
          </div>
        </div>
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
