import { useState } from "react";
import { NotificationComposer, type NotificationRow } from "@/components/notifications/NotificationComposer";
import { NotificationsTable } from "@/components/notifications/NotificationsTable";
import { Bell } from "lucide-react";

export default function NotificationCentre() {
  const [editingRow, setEditingRow] = useState<NotificationRow | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto pb-24 md:pb-6">
      <header className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Bell className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Notification Centre</h1>
          <p className="text-sm text-muted-foreground">Compose and send push notifications to your users instantly.</p>
        </div>
      </header>

      <NotificationComposer
        editingRow={editingRow}
        onDone={() => setRefreshToken((n) => n + 1)}
        onClearEdit={() => setEditingRow(null)}
      />

      <NotificationsTable
        refreshToken={refreshToken}
        onEdit={(row) => {
          setEditingRow(row);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />
    </div>
  );
}
