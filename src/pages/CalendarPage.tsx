import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

interface CalEvent {
  id: string;
  date: string;
  title: string;
  type: "holiday" | "event";
}

const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalEvent[]>([
    { id: "1", date: "2026-03-25", title: "School Holiday", type: "holiday" },
    { id: "2", date: "2026-03-28", title: "Parent-Teacher Meeting", type: "event" },
  ]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", date: "", type: "event" as "holiday" | "event" });

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  const prev = () => setCurrentDate(new Date(year, month - 1, 1));
  const next = () => setCurrentDate(new Date(year, month + 1, 1));

  const handleAdd = () => {
    if (!form.title || !form.date) return;
    setEvents([...events, { ...form, id: Date.now().toString() }]);
    setForm({ title: "", date: "", type: "event" });
    setOpen(false);
  };

  const getEventsForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return events.filter((e) => e.date === dateStr);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display">Calendar</h1>
          <p className="text-muted-foreground text-sm mt-1">School events & holidays</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-secondary text-secondary-foreground hover:bg-secondary/90">
              <Plus className="h-4 w-4 mr-2" /> Add Event
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle className="font-display">Add Event</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-2">
              <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Event name" /></div>
              <div><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
              <div className="flex gap-2">
                {(["event", "holiday"] as const).map((t) => (
                  <Button key={t} variant={form.type === t ? "default" : "outline"} size="sm" onClick={() => setForm({ ...form, type: t })}
                    className={form.type === t ? "bg-secondary text-secondary-foreground" : ""}>
                    {t === "holiday" ? "🏖 Holiday" : "📅 Event"}
                  </Button>
                ))}
              </div>
              <Button onClick={handleAdd} className="w-full bg-secondary text-secondary-foreground hover:bg-secondary/90">Add</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border border-border shadow-none">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <Button variant="ghost" size="icon" onClick={prev}><ChevronLeft className="h-4 w-4" /></Button>
          <CardTitle className="text-base font-display">
            {currentDate.toLocaleString("default", { month: "long", year: "numeric" })}
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={next}><ChevronRight className="h-4 w-4" /></Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-px">
            {daysOfWeek.map((d) => (
              <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
            ))}
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} className="h-10 md:h-14" />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dayEvents = getEventsForDay(day);
              const isToday = today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
              return (
                <div key={day} className={`h-10 md:h-14 flex flex-col items-center justify-start pt-1 rounded-md text-sm ${isToday ? "bg-secondary/10 font-bold" : ""}`}>
                  <span className={isToday ? "text-secondary" : ""}>{day}</span>
                  <div className="flex gap-0.5 mt-0.5">
                    {dayEvents.map((e) => (
                      <div key={e.id} className={`h-1.5 w-1.5 rounded-full ${e.type === "holiday" ? "bg-destructive" : "bg-secondary"}`} title={e.title} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
