import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { MapPin } from "lucide-react";
import { PushNotificationSettings } from "@/components/PushNotificationSettings";

export default function SettingsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [schoolLat, setSchoolLat] = useState("0");
  const [schoolLng, setSchoolLng] = useState("0");
  const [allowedRadius, setAllowedRadius] = useState("50");
  const [saving, setSaving] = useState(false);


  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const { data } = await supabase.from("app_settings").select("*");
    if (data) {
      const map: Record<string, string> = {};
      (data as unknown as { key: string; value: string }[]).forEach((r) => (map[r.key] = r.value));
      if (map.school_latitude) setSchoolLat(map.school_latitude);
      if (map.school_longitude) setSchoolLng(map.school_longitude);
      if (map.allowed_radius_meters) setAllowedRadius(map.allowed_radius_meters);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const entries = [
      { key: "school_latitude", value: schoolLat },
      { key: "school_longitude", value: schoolLng },
      { key: "allowed_radius_meters", value: allowedRadius },
    ];

    for (const entry of entries) {
      await supabase
        .from("app_settings")
        .upsert({ key: entry.key, value: entry.value, updated_at: new Date().toISOString() } as any, { onConflict: "key" });
    }

    toast({ title: "Settings saved ✓" });
    setSaving(false);
  };

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast({ title: "Geolocation not supported", variant: "destructive" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setSchoolLat(String(pos.coords.latitude));
        setSchoolLng(String(pos.coords.longitude));
        toast({ title: "Location captured ✓" });
      },
      () => toast({ title: "Could not get location", variant: "destructive" }),
      { enableHighAccuracy: true }
    );
  };


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">System configuration</p>
      </div>

      <p className="text-xs text-muted-foreground">
        Per-staff check-in / check-out times, grace period, and salary deduction rate are managed
        on each staff card in <span className="font-medium">Staff Management</span>.
      </p>

      <PushNotificationSettings />

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border border-border shadow-none md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base font-display flex items-center gap-2">
              <MapPin className="h-4 w-4" /> School Location (Geo-Fence)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Latitude</Label>
                <Input type="number" step="any" value={schoolLat} onChange={(e) => setSchoolLat(e.target.value)} />
              </div>
              <div>
                <Label>Longitude</Label>
                <Input type="number" step="any" value={schoolLng} onChange={(e) => setSchoolLng(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Allowed Radius (meters)</Label>
              <Input type="number" value={allowedRadius} onChange={(e) => setAllowedRadius(e.target.value)} />
              <p className="text-xs text-muted-foreground mt-1">Staff must be within this distance to check in</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={handleGetCurrentLocation}>
              <MapPin className="h-4 w-4 mr-2" /> Use Current Location
            </Button>
            <p className="text-xs text-muted-foreground">
              Set lat/lng to 0 to disable geo-fencing
            </p>
          </CardContent>
        </Card>
      </div>

      <Button
        onClick={handleSave}
        disabled={saving}
        className="bg-secondary text-secondary-foreground hover:bg-secondary/90"
      >
        {saving ? "Saving..." : "Save Settings"}
      </Button>
    </div>
  );
}
