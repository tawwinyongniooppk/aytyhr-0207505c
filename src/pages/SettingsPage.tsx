import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
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
              <Label>Grace Period (minutes)</Label>
              <Input type="number" defaultValue="15" placeholder="15" />
              <p className="text-xs text-muted-foreground mt-1">Time allowed after official start before marking late</p>
            </div>
            <div>
              <Label>Official Start Time</Label>
              <Input type="time" defaultValue="08:00" />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border shadow-none">
          <CardHeader><CardTitle className="text-base font-display">Salary Settings</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Late Deduction Rate (₦)</Label>
              <Input type="number" defaultValue="500" placeholder="500" />
              <p className="text-xs text-muted-foreground mt-1">Amount deducted per late arrival</p>
            </div>
            <div>
              <Label>Absence Deduction Rate (₦)</Label>
              <Input type="number" defaultValue="2000" placeholder="2000" />
              <p className="text-xs text-muted-foreground mt-1">Amount deducted per unexcused absence</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Button className="bg-secondary text-secondary-foreground hover:bg-secondary/90">Save Settings</Button>
    </div>
  );
}
