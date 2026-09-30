import { useState } from "react";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Download, Loader2, Hash, Briefcase, CalendarDays, Phone, Mail, PhoneCall, Building2, MapPin, UserRound,
} from "lucide-react";

// Frontend-only Virtual ID. Renders from the existing cached useProfile() data
// and the logo URL already cached in localStorage by useCompanyLogo().
// No queries, RPCs, subscriptions or uploads are made by this page.
const LOGO_CACHE_KEY = "ayty:company_logo_url";

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  assistant: "Assistant Admin",
  staff: "Staff",
  it_manager: "IT Manager",
};

function readCachedLogo(): string | null {
  try {
    return localStorage.getItem(LOGO_CACHE_KEY);
  } catch {
    return null;
  }
}

type Field = { icon: typeof Mail; label: string; value: string };

export default function MyIdPage() {
  const { profile, loading } = useProfile();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const logoUrl = readCachedLogo();

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!profile) return <p className="text-muted-foreground">No profile found.</p>;

  const p = profile as typeof profile & { emergency_phone?: string | null };
  const initials = (p.full_name || "U").split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
  const position = [ROLE_LABEL[p.role] ?? p.role, p.class && p.class !== "Neutral" ? p.class : null]
    .filter(Boolean)
    .join(" · ");

  const fields: Field[] = [
    { icon: UserRound, label: "Internal Name", value: "—" },
    { icon: Briefcase, label: "Position", value: position || "—" },
    { icon: CalendarDays, label: "Join Date", value: p.join_date || "—" },
    { icon: Phone, label: "Phone", value: p.phone || "—" },
    { icon: Mail, label: "Email", value: user?.email ?? "—" },
    { icon: PhoneCall, label: "Emergency", value: p.emergency_phone || "—" },
    { icon: Building2, label: "School Phone", value: "—" },
    { icon: MapPin, label: "School Address", value: "—" },
  ];

  const handleSave = async () => {
    setSaving(true);
    try {
      const blob = await renderIdImage({
        name: p.full_name,
        position,
        idNo: typeof p.sequence === "number" ? `ID: #${p.sequence}` : "",
        initials,
        avatarUrl: photoFailed ? null : p.avatar_url ?? null,
        logoUrl,
        fields,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Virtual-ID-${(p.full_name || "staff").replace(/\s+/g, "-")}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast.success("Virtual ID saved");
    } catch {
      toast.error("Could not save the Virtual ID. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-start sm:items-center justify-center min-h-[calc(100dvh-12rem)] md:min-h-[calc(100dvh-8rem)]">
      <article className="virtual-id relative w-full max-w-[400px] rounded-[28px] overflow-hidden motion-safe:animate-id-in">
        <span aria-hidden className="virtual-id-sheen" />
        {/* Header band */}
        <header className="virtual-id-band relative px-5 pt-4 pb-10 flex items-center gap-3">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-11 w-11 rounded-full bg-card object-contain p-0.5 shadow" />
          ) : (
            <div className="h-11 w-11 rounded-full bg-card/90" />
          )}
          <div className="leading-tight">
            <p className="font-display font-bold tracking-wide text-primary-foreground text-[15px]">AYE YAIT THARYAR</p>
            <p className="text-[11px] tracking-[0.18em] text-primary-foreground/80">SMART HR SYSTEM</p>
          </div>
        </header>

        <div className="relative -mt-8 px-5 pb-5 flex flex-col items-center text-center">
          {p.avatar_url && !photoFailed ? (
            <img
              src={p.avatar_url}
              alt={p.full_name}
              onError={() => setPhotoFailed(true)}
              className="h-24 w-24 rounded-full object-cover ring-4 ring-card shadow-lg"
            />
          ) : (
            <div className="h-24 w-24 rounded-full ring-4 ring-card shadow-lg bg-primary/10 flex items-center justify-center text-3xl font-bold text-primary">
              {initials}
            </div>
          )}
          <h2 className="mt-2 text-xl font-bold leading-[1.7] text-foreground">{p.full_name}</h2>
          <p className="text-sm text-muted-foreground leading-snug">{position}</p>
          {typeof p.sequence === "number" && (
            <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-0.5 text-xs font-semibold text-primary">
              <Hash className="h-3 w-3" /> ID: {p.sequence}
            </span>
          )}

          <dl className="mt-3 w-full divide-y divide-border/60 text-left text-[13px]">
            {fields.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-start gap-2 py-1.5">
                <Icon className="h-3.5 w-3.5 mt-[3px] shrink-0 text-primary" />
                <dt className="w-28 shrink-0 text-muted-foreground">{label}</dt>
                <dd className="flex-1 min-w-0 font-medium text-foreground break-words">{value}</dd>
              </div>
            ))}
          </dl>

          <Button onClick={handleSave} disabled={saving} className="mt-4 w-full rounded-full h-11">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Save Virtual ID
          </Button>
        </div>
      </article>
    </div>
  );
}

// ---------- Client-side PNG export (Canvas 2D, no libraries) ----------

function loadImg(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function cssHsl(varName: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return v ? `hsl(${v})` : fallback;
}

async function renderIdImage(o: {
  name: string; position: string; idNo: string; initials: string;
  avatarUrl: string | null; logoUrl: string | null; fields: Field[];
}): Promise<Blob> {
  const W = 400, H = 720, S = 3;
  const c = document.createElement("canvas");
  c.width = W * S; c.height = H * S;
  const ctx = c.getContext("2d")!;
  ctx.scale(S, S);
  const primary = cssHsl("--primary", "#2563eb");
  const fg = cssHsl("--foreground", "#0f172a");
  const muted = cssHsl("--muted-foreground", "#64748b");
  const font = `"Noto Sans Myanmar", "Padauk", "Myanmar Text", system-ui, sans-serif`;

  const round = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  };

  ctx.fillStyle = "#ffffff"; round(0, 0, W, H, 28); ctx.fill(); ctx.save(); ctx.clip();
  const g = ctx.createLinearGradient(0, 0, W, 110);
  g.addColorStop(0, primary); g.addColorStop(1, primary.replace(")", " / 0.7)"));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 110);

  const [logo, avatar] = await Promise.all([
    o.logoUrl ? loadImg(o.logoUrl) : null,
    o.avatarUrl ? loadImg(o.avatarUrl) : null,
  ]);
  ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(42, 40, 22, 0, Math.PI * 2); ctx.fill();
  if (logo) ctx.drawImage(logo, 22, 20, 40, 40);
  ctx.fillStyle = "#ffffff"; ctx.textBaseline = "alphabetic";
  ctx.font = `700 15px ${font}`; ctx.fillText("AYE YAIT THARYAR", 76, 38);
  ctx.font = `400 11px ${font}`; ctx.fillText("SMART HR SYSTEM", 76, 55);

  // Avatar
  const cx = W / 2, cy = 128, r = 48;
  ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(cx, cy, r + 4, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  if (avatar) {
    const s = Math.max((2 * r) / avatar.naturalWidth, (2 * r) / avatar.naturalHeight);
    const w = avatar.naturalWidth * s, h = avatar.naturalHeight * s;
    ctx.drawImage(avatar, cx - w / 2, cy - h / 2, w, h);
  } else {
    ctx.fillStyle = primary.replace(")", " / 0.12)"); ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    ctx.fillStyle = primary; ctx.font = `700 30px ${font}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(o.initials, cx, cy);
  }
  ctx.restore();

  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  ctx.fillStyle = fg; ctx.font = `700 20px ${font}`; ctx.fillText(o.name, cx, 212, W - 40);
  ctx.fillStyle = muted; ctx.font = `400 13px ${font}`; ctx.fillText(o.position, cx, 236, W - 40);
  let y = 256;
  if (o.idNo) {
    ctx.fillStyle = primary.replace(")", " / 0.12)"); round(cx - 45, 246, 90, 22, 11); ctx.fill();
    ctx.fillStyle = primary; ctx.font = `600 12px ${font}`; ctx.fillText(o.idNo, cx, 261);
    y = 280;
  }

  ctx.textAlign = "left";
  const wrap = (text: string, maxW: number) => {
    const words = text.split(/(\s+)/); const lines: string[] = []; let line = "";
    for (const w of words) {
      const t = line + w;
      if (ctx.measureText(t).width > maxW && line) { lines.push(line.trim()); line = w.trimStart(); } else line = t;
    }
    if (line.trim()) lines.push(line.trim());
    return lines.length ? lines : ["—"];
  };
  for (const f of o.fields) {
    ctx.font = `500 13px ${font}`;
    const lines = wrap(f.value, W - 170);
    ctx.fillStyle = primary; ctx.beginPath(); ctx.arc(30, y + 14, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = muted; ctx.font = `400 13px ${font}`; ctx.fillText(f.label, 42, y + 19);
    ctx.fillStyle = fg; ctx.font = `500 13px ${font}`;
    lines.forEach((l, i) => ctx.fillText(l, 150, y + 19 + i * 20));
    y += 12 + lines.length * 20;
    ctx.strokeStyle = "rgba(0,0,0,0.06)"; ctx.beginPath(); ctx.moveTo(24, y + 2); ctx.lineTo(W - 24, y + 2); ctx.stroke();
    y += 4;
  }
  ctx.restore();
  ctx.strokeStyle = primary.replace(")", " / 0.35)"); ctx.lineWidth = 1.5; round(0.75, 0.75, W - 1.5, H - 1.5, 28); ctx.stroke();

  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"),
  );
}
