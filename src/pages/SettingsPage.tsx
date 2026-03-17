import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export default function SettingsPage() {
  const { toast } = useToast();
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("16:00");
  const [gracePeriod, setGracePeriod] = useState("10");
  const [deductionRate, setDeductionRate] = useState("200");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const { data } = await supabase.from("app_settings").select("*");
    if (data) {
      const map: Record<string, string> = {};
      (data as unknown as { key: string; value: string }[]).forEach((r) => (map[r.key] = r.value));
      if (map.start_time) setStartTime(map.start_time);
      if (map.end_time) setEndTime(map.end_time);
      if (map.grace_period_minutes) setGracePeriod(map.grace_period_minutes);
      if (map.deduction_rate_per_minute) setDeductionRate(map.deduction_rate_per_minute);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const entries = [
      { key: "start_time", value: startTime },
      { key: "end_time", value: endTime },
      { key: "grace_period_minutes", value: gracePeriod },
      { key: "deduction_rate_per_minute", value: deductionRate },
    ];

    for (const entry of entries) {
      await supabase
        .from("app_settings")
        .update({ value: entry.value, updated_at: new Date().toISOString() } as any)
        .eq("key", entry.key);
    }

    toast({ title: "Settings saved ✓" });
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">System configuration</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border border-border shadow-none">
          <CardHeader><CardTitle className="text-base font-display">Attendance Settings</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Official Start Time</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div>
              <Label>Official End Time</Label>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
            <div>
              <Label>Grace Period (minutes)</Label>
              <Input type="number" value={gracePeriod} onChange={(e) => setGracePeriod(e.target.value)} />
              <p className="text-xs text-muted-foreground mt-1">Time allowed after start before marking late</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border shadow-none">
          <CardHeader><CardTitle className="text-base font-display">Salary Deduction</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Deduction Rate (kyats per minute)</Label>
              <Input type="number" value={deductionRate} onChange={(e) => setDeductionRate(e.target.value)} />
              <p className="text-xs text-muted-foreground mt-1">Applied to both late and early leave minutes</p>
            </div>
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
