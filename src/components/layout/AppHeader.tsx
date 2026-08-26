import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Upload, Building2, RefreshCw } from "lucide-react";
import { checkForUpdate } from "@/pwa/registerSW";
import { useCompanyLogo } from "@/hooks/useAppSettingsCache";

const MAX_LOGO_SIZE = 2 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/jpg", "image/png", "image/svg+xml", "image/webp"];

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  if (h < 21) return "Good Evening";
  return "Good Night";
}

export function AppHeader() {
  const { profile, isItManager } = useProfile();
  const { toast } = useToast();
  const { logoUrl, setLogoUrl } = useCompanyLogo();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  const onCheckUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const found = await checkForUpdate();
      if (!found) toast({ title: "You are on the latest version" });
    } finally {
      setCheckingUpdate(false);
    }
  };

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED.includes(file.type)) {
      toast({ title: "Invalid type", description: "Use JPG, PNG, SVG, or WEBP.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_LOGO_SIZE) {
      toast({ title: "Too large", description: "Max 2MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("branding").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("branding").getPublicUrl(path);
      const url = data.publicUrl;

      const { error: setErr } = await supabase
        .from("app_settings")
        .upsert({ key: "company_logo_url", value: url, updated_at: new Date().toISOString() });
      if (setErr) throw setErr;

      setLogoUrl(url);
      toast({ title: "Logo updated" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (!profile) return null;

  const initials = (profile.full_name || "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);

  return (
    <header className="sticky top-0 z-30 bg-background/90 backdrop-blur border-b border-border">
      <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 md:h-11 md:w-11 rounded-lg bg-muted flex items-center justify-center overflow-hidden shrink-0 border border-border">
            {logoUrl ? (
              <img src={logoUrl} alt="Company logo" className="h-full w-full object-contain" />
            ) : (
              <Building2 className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground leading-tight">{getGreeting()}</p>
            <p className="text-sm md:text-base font-semibold font-display truncate leading-tight">
              {profile.full_name || "Welcome"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={onCheckUpdate}
            disabled={checkingUpdate}
            className="h-9 w-9"
            aria-label="Check for update"
            title="Check for update"
          >
            <RefreshCw className={`h-4 w-4 ${checkingUpdate ? "animate-spin" : ""}`} />
          </Button>
          {isItManager && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/svg+xml,image/webp"
                className="hidden"
                onChange={onPick}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="hidden sm:inline-flex"
              >
                <Upload className="h-3.5 w-3.5 mr-1.5" />
                {uploading ? "Uploading..." : logoUrl ? "Replace logo" : "Upload logo"}
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="sm:hidden h-9 w-9"
                aria-label="Upload logo"
              >
                <Upload className="h-4 w-4" />
              </Button>
            </>
          )}
          <div className="h-9 w-9 md:h-10 md:w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold overflow-hidden border border-border">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.full_name} className="h-full w-full object-cover" />
            ) : (
              initials
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
