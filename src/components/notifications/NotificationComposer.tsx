import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Loader2, Upload, Send, Save, X, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { NotificationPreview, ICON_MAP, type NotifIconKey, type NotifLayout } from "./NotificationPreview";
import { useStaffDirectory } from "@/hooks/useStaffDirectory";

const INTERNAL_ROUTES = [
  { value: "/dashboard", label: "Dashboard" },
  { value: "/attendance", label: "Attendance" },
  { value: "/tasks", label: "Tasks" },
  { value: "/leave", label: "Leave & Overtime" },
  { value: "/salary", label: "My Salary & Bonus" },
  { value: "/calendar", label: "Task Scheduler" },
  { value: "/my-id", label: "My ID" },
  { value: "/my-timetable", label: "My Timetable" },
];

const composerSchema = z.object({
  title: z.string().trim().min(1, "Title required").max(120),
  body: z.string().trim().min(1, "Body required").max(500),
  audience: z.enum(["all", "admins", "staff", "it_managers", "specific"]),
  action_type: z.enum(["none", "internal", "external"]),
  action_target: z.string().max(500).optional().nullable(),
});

export type NotificationRow = {
  id: string;
  title: string;
  body: string;
  banner_url: string | null;
  icon_key: NotifIconKey;
  layout: NotifLayout;
  action_type: "none" | "internal" | "external";
  action_target: string | null;
  audience: "all" | "admins" | "staff" | "it_managers" | "specific";
  audience_user_ids: string[];
  status: "draft" | "sent" | "failed";
};

export interface ComposerHandle {
  loadRow: (row: NotificationRow) => void;
}

interface Props {
  editingRow: NotificationRow | null;
  onDone: () => void;
  onClearEdit: () => void;
}

export function NotificationComposer({ editingRow, onDone, onClearEdit }: Props) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [bannerUrl, setBannerUrl] = useState<string>("");
  const [iconKey, setIconKey] = useState<NotifIconKey>("default");
  const [layout, setLayout] = useState<NotifLayout>("minimal");
  const [actionType, setActionType] = useState<"none" | "internal" | "external">("none");
  const [actionTarget, setActionTarget] = useState<string>("");
  const [audience, setAudience] = useState<"all" | "admins" | "staff" | "it_managers" | "specific">("all");
  const [specificIds, setSpecificIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const { data: staffDirectory } = useStaffDirectory();

  const staffOptions = useMemo(
    () => ((staffDirectory ?? []) as Array<{ id: string; full_name: string }>).map((r) => ({ id: r.id, full_name: r.full_name })),
    [staffDirectory],
  );

  useEffect(() => {
    if (!editingRow) return;
    setTitle(editingRow.title);
    setBody(editingRow.body);
    setBannerUrl(editingRow.banner_url ?? "");
    setIconKey(editingRow.icon_key);
    setLayout(editingRow.layout);
    setActionType(editingRow.action_type);
    setActionTarget(editingRow.action_target ?? "");
    setAudience(editingRow.audience);
    setSpecificIds(editingRow.audience_user_ids ?? []);
  }, [editingRow]);

  const reset = () => {
    setTitle(""); setBody(""); setBannerUrl(""); setIconKey("default"); setLayout("minimal");
    setActionType("none"); setActionTarget(""); setAudience("all"); setSpecificIds([]);
    onClearEdit();
  };


  const uploadBanner = async (file: File) => {
    if (!user) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Unsupported image type", { description: "Use a JPG, PNG, or WebP image." });
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      toast.error("Image is too large", { description: "Use a JPG, PNG, or WebP image up to 3 MB." });
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("notification-banners").upload(path, file, {
        cacheControl: "3600", upsert: false,
      });
      if (error) throw error;
      // Generate a long-lived signed URL (10 years). Private bucket, signed URL keeps
      // the asset accessible to FCM notification renderers and the app preview.
      const { data: signed, error: sErr } = await supabase.storage
        .from("notification-banners")
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
      if (sErr) throw sErr;
      setBannerUrl(signed.signedUrl);
      toast.success("Banner uploaded");
    } catch (e) {
      toast.error("Upload failed", { description: (e as Error).message });
    } finally {
      setUploading(false);
    }
  };

  type NotifPayload = {
    title: string;
    body: string;
    banner_url: string | null;
    icon_key: NotifIconKey;
    layout: NotifLayout;
    action_type: "none" | "internal" | "external";
    action_target: string | null;
    audience: "all" | "admins" | "staff" | "it_managers" | "specific";
    audience_user_ids: string[];
    status: "draft" | "sent" | "failed";
    created_by: string;
  };

  const buildPayload = (): NotifPayload | null => {
    const parsed = composerSchema.safeParse({
      title, body, audience, action_type: actionType,
      action_target: actionTarget || null,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return null;
    }
    if (actionType !== "none" && !actionTarget.trim()) {
      toast.error("Please provide a target route or URL");
      return null;
    }
    if (audience === "specific" && specificIds.length === 0) {
      toast.error("Select at least one user for the specific audience");
      return null;
    }
    if (layout === "image_focused" && !bannerUrl) {
      toast.error("Image-focused layout requires a banner image");
      return null;
    }
    return {
      title: title.trim(),
      body: body.trim(),
      banner_url: bannerUrl || null,
      icon_key: iconKey,
      layout,
      action_type: actionType,
      action_target: actionType === "none" ? null : actionTarget.trim(),
      audience,
      audience_user_ids: audience === "specific" ? specificIds : [],
      status: "draft",
      created_by: user!.id,
    };
  };

  const persist = async (payload: NotifPayload): Promise<string | null> => {
    if (editingRow) {
      const { error } = await supabase.from("notifications").update(payload).eq("id", editingRow.id);
      if (error) { toast.error(error.message); return null; }
      return editingRow.id;
    }
    const { data, error } = await supabase.from("notifications").insert(payload).select("id").single();
    if (error) { toast.error(error.message); return null; }
    return (data as { id: string }).id;
  };

  const handleSaveDraft = async () => {
    const payload = buildPayload();
    if (!payload) return;
    setSaving(true);
    const id = await persist(payload);
    setSaving(false);
    if (id) { toast.success("Saved as draft"); reset(); onDone(); }
  };

  const handleSendNow = async () => {
    const payload = buildPayload();
    if (!payload) return;
    setSaving(true);
    try {
      const id = await persist(payload);
      if (!id) return;
      const { data, error } = await supabase.functions.invoke("dispatch-notification", {
        body: { notification_id: id },
      });
      if (error) throw error;
      const j = data as { ok?: boolean; sent?: number; failed?: number; error?: string };
      if (j.ok) toast.success(`Sent to ${j.sent} device${j.sent === 1 ? "" : "s"}`);
      else toast.error("Dispatch failed", { description: j.error ?? "no devices reached" });
      reset(); onDone();
    } catch (e) {
      toast.error("Failed", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };


  const layoutOptions: Array<{ value: NotifLayout; label: string }> = [
    { value: "minimal", label: "Minimal" },
    { value: "compact", label: "Compact" },
    { value: "image_focused", label: "Image-focused" },
  ];

  const iconKeys = useMemo(() => Object.keys(ICON_MAP) as NotifIconKey[], []);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
      <div className="space-y-6">
        {/* 1. Content & design */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. Content & Design</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="notif-title">Notification Title</Label>
              <Input id="notif-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Salary released for October" />
            </div>
            <div>
              <Label htmlFor="notif-body">Body Text</Label>
              <Textarea id="notif-body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={500} rows={3} placeholder="Message shown under the title" />
              <p className="text-xs text-muted-foreground mt-1">{body.length}/500</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Banner Image</Label>
                <div className="flex gap-2 mt-1.5">
                  <Input placeholder="Paste image URL…" value={bannerUrl} onChange={(e) => setBannerUrl(e.target.value)} />
                   <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => {
                    const f = e.target.files?.[0]; if (f) void uploadBanner(f); e.target.value = "";
                  }} />
                  <Button type="button" variant="outline" size="icon" disabled={uploading} onClick={() => fileRef.current?.click()} title="Upload image">
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  </Button>
                  {bannerUrl && (
                    <Button type="button" variant="outline" size="icon" onClick={() => setBannerUrl("")} title="Clear">
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {bannerUrl && (
                  <div className="mt-2 rounded-md border overflow-hidden">
                    <img src={bannerUrl} alt="banner preview" className="w-full h-24 object-cover" />
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><ImageIcon className="h-3 w-3" /> Recommended 1200 × 630 px (1.91:1), max 3 MB</p>
              </div>

              <div>
                <Label>App Icon</Label>
                <div className="grid grid-cols-6 gap-2 mt-1.5">
                  {iconKeys.map((k) => {
                    const { Icon, label } = ICON_MAP[k];
                    const active = iconKey === k;
                    return (
                      <button
                        type="button" key={k} onClick={() => setIconKey(k)} title={label}
                        className={cn(
                          "h-10 rounded-md border flex items-center justify-center transition-colors",
                          active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div>
              <Label>Layout Template</Label>
              <div className="grid grid-cols-3 gap-2 mt-1.5">
                {layoutOptions.map((opt) => (
                  <button
                    key={opt.value} type="button" onClick={() => setLayout(opt.value)}
                    className={cn(
                      "h-10 rounded-md border text-sm font-medium transition-colors",
                      layout === opt.value ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 2. On-click routing */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. On Click Action</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <RadioGroup value={actionType} onValueChange={(v) => setActionType(v as typeof actionType)} className="grid grid-cols-3 gap-2">
              {[
                { v: "none", l: "None" },
                { v: "internal", l: "Internal Route" },
                { v: "external", l: "External URL" },
              ].map((o) => (
                <label key={o.v} className={cn(
                  "flex items-center gap-2 rounded-md border p-2.5 text-sm cursor-pointer",
                  actionType === o.v ? "border-primary bg-primary/5" : "hover:bg-muted",
                )}>
                  <RadioGroupItem value={o.v} /> {o.l}
                </label>
              ))}
            </RadioGroup>
            {actionType === "internal" && (
              <div>
                <Label>Target Page</Label>
                <Select value={actionTarget} onValueChange={setActionTarget}>
                  <SelectTrigger><SelectValue placeholder="Choose a page" /></SelectTrigger>
                  <SelectContent>
                    {INTERNAL_ROUTES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {actionType === "external" && (
              <div>
                <Label>External URL</Label>
                <Input value={actionTarget} onChange={(e) => setActionTarget(e.target.value)} placeholder="https://example.com/page" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* 3. Delivery */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. Delivery & Audience</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Audience</Label>
              <Select value={audience} onValueChange={(v) => setAudience(v as typeof audience)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  <SelectItem value="admins">Admins & Assistants</SelectItem>
                  <SelectItem value="staff">Staff only</SelectItem>
                  <SelectItem value="it_managers">IT Managers</SelectItem>
                  <SelectItem value="specific">Specific Users…</SelectItem>
                </SelectContent>
              </Select>
              {audience === "specific" && (
                <div className="mt-2 max-h-40 overflow-y-auto rounded-md border p-2 space-y-1">
                  {staffOptions.map((s) => {
                    const checked = specificIds.includes(s.id);
                    return (
                      <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted rounded px-2 py-1">
                        <input type="checkbox" checked={checked} onChange={(e) => {
                          setSpecificIds((prev) => e.target.checked ? [...prev, s.id] : prev.filter((x) => x !== s.id));
                        }} />
                        <span className="truncate">{s.full_name}</span>
                      </label>
                    );
                  })}
                  {staffOptions.length === 0 && <p className="text-xs text-muted-foreground p-2">No users found.</p>}
                </div>
              )}
            </div>

          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleSaveDraft} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            {editingRow ? "Update draft" : "Save as draft"}
          </Button>
          <Button onClick={handleSendNow} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Send now
          </Button>
          {editingRow && (
            <Button variant="ghost" onClick={reset} disabled={saving}>
              Cancel edit
            </Button>
          )}
        </div>
      </div>

      <div className="xl:sticky xl:top-4 xl:self-start space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Live Preview</h3>
        <NotificationPreview title={title} body={body} bannerUrl={bannerUrl} iconKey={iconKey} layout={layout} />
      </div>
    </div>
  );
}
