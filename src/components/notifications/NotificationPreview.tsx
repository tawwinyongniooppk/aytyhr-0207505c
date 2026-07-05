import { Card } from "@/components/ui/card";
import { Bell, AlertCircle, CalendarDays, Wallet, ClipboardList, FileText, Smartphone, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";

export type NotifLayout = "minimal" | "compact" | "image_focused";
export type NotifIconKey = "default" | "alert" | "calendar" | "salary" | "task" | "leave";

export const ICON_MAP: Record<NotifIconKey, { Icon: typeof Bell; label: string }> = {
  default: { Icon: Bell, label: "Bell" },
  alert: { Icon: AlertCircle, label: "Alert" },
  calendar: { Icon: CalendarDays, label: "Calendar" },
  salary: { Icon: Wallet, label: "Salary" },
  task: { Icon: ClipboardList, label: "Task" },
  leave: { Icon: FileText, label: "Leave" },
};

interface Props {
  title: string;
  body: string;
  bannerUrl?: string | null;
  iconKey: NotifIconKey;
  layout: NotifLayout;
}

function IconBadge({ iconKey }: { iconKey: NotifIconKey }) {
  const { Icon } = ICON_MAP[iconKey] ?? ICON_MAP.default;
  return (
    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
      <Icon className="h-5 w-5 text-primary" />
    </div>
  );
}

function MobilePreview({ title, body, bannerUrl, iconKey, layout }: Props) {
  const showBanner = layout === "image_focused" && !!bannerUrl;
  const showSmallIcon = layout !== "minimal";
  return (
    <div className="rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 p-4 shadow-xl">
      <div className="flex items-center gap-2 text-xs text-slate-300 mb-2">
        <Smartphone className="h-3.5 w-3.5" /> Mobile Push
      </div>
      <div className="rounded-xl bg-card text-card-foreground shadow-lg overflow-hidden">
        {showBanner && (
          <img src={bannerUrl!} alt="banner" className="w-full h-32 object-cover" />
        )}
        <div className="p-3 flex gap-3">
          {showSmallIcon && <IconBadge iconKey={iconKey} />}
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-medium text-muted-foreground truncate">AYTY Smart HR</p>
              <span className="text-[10px] text-muted-foreground">now</span>
            </div>
            <p className="text-sm font-semibold leading-snug truncate mt-0.5">{title || "Notification title"}</p>
            <p className="text-xs text-muted-foreground leading-snug line-clamp-2 mt-0.5">
              {body || "Notification body preview will appear here."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function DesktopPreview({ title, body, bannerUrl, iconKey, layout }: Props) {
  const showBanner = layout === "image_focused" && !!bannerUrl;
  const showSmallIcon = layout !== "minimal";
  return (
    <div className="rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 p-4 shadow-xl">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
        <Monitor className="h-3.5 w-3.5" /> Desktop Toast
      </div>
      <Card className={cn("overflow-hidden border shadow-md")}>
        {showBanner && (
          <img src={bannerUrl!} alt="banner" className="w-full h-28 object-cover" />
        )}
        <div className="p-3 flex gap-3">
          {showSmallIcon && <IconBadge iconKey={iconKey} />}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-snug truncate">{title || "Notification title"}</p>
            <p className="text-xs text-muted-foreground leading-snug line-clamp-3 mt-1">
              {body || "Notification body preview will appear here."}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

export function NotificationPreview(props: Props) {
  return (
    <div className="space-y-4">
      <MobilePreview {...props} />
      <DesktopPreview {...props} />
    </div>
  );
}
