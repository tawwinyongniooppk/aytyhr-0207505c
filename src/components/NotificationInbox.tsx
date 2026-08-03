import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/hooks/useAuth";

type Delivery = { id: string; title: string; body: string; action_target: string | null; read_at: string | null; created_at: string };

export function NotificationInbox() {
  const { user } = useAuth();
  const [items, setItems] = useState<Delivery[]>([]);
  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from("notification_deliveries").select("id,title,body,action_target,read_at,created_at").order("created_at", { ascending: false }).limit(30);
    setItems((data as Delivery[] | null) ?? []);
  };
  useEffect(() => {
    if (!user) return;
    void load();
    const channel = supabase.channel(`notification-inbox-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notification_deliveries", filter: `user_id=eq.${user.id}` }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user]);
  const unread = items.filter((item) => !item.read_at).length;
  return (
    <Popover>
      <PopoverTrigger asChild><Button variant="ghost" size="icon" className="relative" aria-label="Notifications"><Bell />{unread > 0 && <span className="absolute right-1 top-1 h-4 min-w-4 rounded-full bg-destructive px-1 text-[10px] leading-4 text-destructive-foreground">{unread}</span>}</Button></PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b p-3 font-semibold">Notifications</div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? <p className="p-5 text-center text-sm text-muted-foreground">No notifications yet</p> : items.map((item) => (
            <button key={item.id} className="block w-full border-b p-3 text-left hover:bg-muted" onClick={async () => { if (!item.read_at) await supabase.from("notification_deliveries").update({ read_at: new Date().toISOString() }).eq("id", item.id); if (item.action_target) window.location.assign(item.action_target); void load(); }}>
              <p className="text-sm font-medium">{item.title}</p><p className="mt-1 text-xs text-muted-foreground line-clamp-2">{item.body}</p>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}