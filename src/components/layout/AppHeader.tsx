import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Upload, Building2, RefreshCw, Phone } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { checkForUpdate } from "@/pwa/registerSW";
import { useCompanyLogo, saveSchoolContact, readCachedSchoolContact } from "@/hooks/useAppSettingsCache";
import { ThemeColorPicker } from "@/components/ThemeColorPicker";

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
  const [schoolOpen, setSchoolOpen] = useState(false);
  const [schoolPhone, setSchoolPhone] = useState("");
  const [schoolAddress, setSchoolAddress] = useState("");
  const [savingSchool, setSavingSchool] = useState(false);

  const openSchool = () => {
    const c = readCachedSchoolContact();
    setSchoolPhone(c.phone ?? "");
    setSchoolAddress(c.address ?? "");
    setSchoolOpen(true);
  };

  const onSaveSchool = async () => {
    setSavingSchool(true);
    try {
      await saveSchoolContact(schoolPhone.trim(), schoolAddress.trim());
      toast({ title: "School info saved" });
      setSchoolOpen(false);
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSavingSchool(false);
    }
  };

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
    <header className="sticky top-0 z-30 border-b border-border/80 bg-background/95 shadow-sm">
      <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/80 bg-muted shadow-sm md:h-11 md:w-11">
            {logoUrl ? (
              <img src={logoUrl} alt="Company logo" className="h-full w-full object-contain" />
            ) : (
              <Building2 className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium leading-tight text-muted-foreground">{getGreeting()}</p>
            <p className="truncate font-display text-sm font-semibold leading-tight md:text-base">
              {profile.full_name || "Welcome"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <ThemeColorPicker />
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
              <Button
                variant="outline"
                size="icon"
                onClick={openSchool}
                className="h-9 w-9"
                aria-label="School phone and address"
                title="School phone and address"
              >
                <Phone className="h-4 w-4" />
              </Button>
              <Dialog open={schoolOpen} onOpenChange={setSchoolOpen}>
                <DialogContent className="max-w-sm">
                  <DialogHeader>
                    <DialogTitle>School Info</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div>
                      <Label>School Phone</Label>
                      <Input value={schoolPhone} maxLength={40} onChange={(e) => setSchoolPhone(e.target.value)} />
                    </div>
                    <div>
                      <Label>School Address</Label>
                      <Textarea value={schoolAddress} maxLength={200} rows={3} onChange={(e) => setSchoolAddress(e.target.value)} />
                    </div>
                    <p className="text-xs text-muted-foreground">Shown on every staff member's Virtual ID.</p>
                    <Button onClick={onSaveSchool} disabled={savingSchool} className="w-full">
                      {savingSchool ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </>
          )}
          <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-primary/20 bg-primary-soft text-xs font-bold text-primary-strong shadow-sm md:h-10 md:w-10">
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
