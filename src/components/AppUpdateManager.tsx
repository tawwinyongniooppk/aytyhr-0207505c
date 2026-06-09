import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { onUpdateAvailable, applyUpdate, isUpdateAvailable } from "@/pwa/registerSW";

export function AppUpdateManager() {
  const [show, show_] = useState(isUpdateAvailable());
  const [dismissed, setDismissed] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => onUpdateAvailable(() => show_(true)), []);

  if (!show || dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed z-[100] bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 px-4 w-full max-w-md pointer-events-none"
    >
      <div className="pointer-events-auto flex items-center gap-3 rounded-lg border bg-card text-card-foreground shadow-lg px-4 py-3">
        <RefreshCw className="h-4 w-4 text-primary shrink-0" />
        <div className="flex-1 text-sm font-medium">New update available</div>
        <Button
          size="sm"
          disabled={applying}
          onClick={async () => {
            setApplying(true);
            await applyUpdate();
          }}
        >
          {applying ? "Refreshing…" : "Refresh"}
        </Button>
        <button
          aria-label="Dismiss"
          onClick={() => setDismissed(true)}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
