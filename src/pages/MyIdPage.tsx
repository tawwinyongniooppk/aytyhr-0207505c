import { useState } from "react";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { readCachedSchoolContact } from "@/hooks/useAppSettingsCache";
import { toast } from "sonner";
import {
  Download, Loader2, CalendarDays, Phone, Mail, PhoneCall, Building2, MapPin, UserRound,
} from "lucide-react";

// Frontend-only Virtual ID. Renders from the existing cached useProfile() data
// and the logo URL already cached in localStorage by useCompanyLogo().
// No queries, RPCs, subscriptions or uploads are made by this page.
const LOGO_CACHE_KEY = "ayty:company_logo_url";

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
  const school = readCachedSchoolContact();

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!profile) return <p className="text-muted-foreground">No profile found.</p>;

  const p = profile as typeof profile & { emergency_phone?: string | null; internal_name?: string | null };
  const initials = (p.full_name || "U").split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
  const fields: Field[] = [
    { icon: UserRound, label: "Internal Name", value: p.internal_name || "—" },
    { icon: CalendarDays, label: "Join Date", value: p.join_date || "—" },
    { icon: Phone, label: "Phone", value: p.phone || "—" },
    { icon: Mail, label: "Email", value: user?.email ?? "—" },
    { icon: PhoneCall, label: "Emergency Contact", value: p.emergency_phone || "—" },
    { icon: Building2, label: "School Phone", value: school.phone || "—" },
    { icon: MapPin, label: "School Address", value: school.address || "—" },
  ];

  const handleSave = async () => {
    setSaving(true);
    try {
      const blob = await renderIdImage({
        name: p.full_name,
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
      <article className="virtual-id relative w-full max-w-[400px] rounded-[24px] overflow-hidden" aria-label="Staff ID Card">
        <span aria-hidden className="virtual-id-sheen" />
        <header className="virtual-id-header relative flex items-start justify-between gap-3 px-5 pt-5 pb-4 sm:px-6">
          <div className="min-w-0">
            <p className="font-display font-semibold text-lg leading-relaxed text-foreground">Aye Yait Tharyar</p>
            <p className="text-xs text-muted-foreground">Staff ID Card</p>
          </div>
          {logoUrl && <img src={logoUrl} alt="School logo" className="h-12 w-12 shrink-0 object-contain" />}
        </header>
        <div className="relative px-5 pb-5 sm:px-6">
          <div className="flex flex-col items-center text-center">
            {p.avatar_url && !photoFailed ? (
              <img src={p.avatar_url} alt={p.full_name} onError={() => setPhotoFailed(true)} className="virtual-id-portrait h-44 w-36 rounded-md object-cover" />
            ) : (
              <div className="virtual-id-portrait h-44 w-36 rounded-md bg-muted flex items-center justify-center text-4xl font-semibold text-muted-foreground" aria-label="Profile photo unavailable">{initials}</div>
            )}
            <h2 className="mt-3 w-full text-2xl font-bold leading-[1.7] text-foreground break-words [overflow-wrap:anywhere]">{p.full_name}</h2>
          </div>
          <dl className="mt-4 w-full divide-y divide-border/40">
            {fields.map(({ icon: Icon, label, value }) => (
              <div key={label} className="grid grid-cols-[minmax(0,0.95fr)_minmax(0,1.55fr)] items-start gap-3 py-2">
                <dt className="flex items-start gap-1.5 text-[11px] leading-[1.8] text-muted-foreground">
                  <Icon aria-hidden className="mt-1 h-3 w-3 shrink-0 opacity-70" />{label}
                </dt>
                <dd className="min-w-0 text-[13px] font-medium leading-[1.8] text-foreground [overflow-wrap:anywhere]">{value}</dd>
              </div>
            ))}
          </dl>
          <Button onClick={handleSave} disabled={saving} className="mt-4 w-full rounded-md h-11">
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

// Print palette is opaque and independent from light/dark app surfaces.
function printColor(varName: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  if (!value) throw new Error("Missing print design token");
  return `hsl(${value})`;
}

async function renderIdImage(o: {
  name: string; initials: string;
  avatarUrl: string | null; logoUrl: string | null; fields: Field[];
}): Promise<Blob> {
  await document.fonts.ready;
  const W = 400, S = 3;
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  const font = getComputedStyle(document.body).fontFamily;
  const setFont = (size: number, weight = 500) => { ctx.font = `${weight} ${size}px ${font}`; };
  // Segment by grapheme so unspaced emails and Myanmar combining marks wrap safely.
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const wrap = (text: string, width: number) => {
    const lines: string[] = []; let line = "";
    for (const { segment } of segmenter.segment(text || "—")) {
      if (segment === "\n") { lines.push(line); line = ""; continue; }
      if (line && ctx.measureText(line + segment).width > width) { lines.push(line.trimEnd()); line = ""; }
      line += segment;
    }
    if (line) lines.push(line.trimEnd());
    return lines.length ? lines : ["—"];
  };
  setFont(23, 700);
  const nameLines = wrap(o.name, W - 48);
  setFont(14);
  const rows = o.fields.map(f => ({ ...f, lines: wrap(f.value, 216) }));
  const bodyTop = 296 + nameLines.length * 38 + 20;
  const H = Math.max(760, bodyTop + rows.reduce((h, f) => h + Math.max(42, f.lines.length * 25 + 16), 0) + 40);
  c.width = W * S; c.height = H * S;
  ctx.scale(S, S);
  const paper = printColor("--id-print-paper");
  const ink = printColor("--id-print-ink");
  const muted = printColor("--id-print-muted");
  const accent = printColor("--id-print-accent");
  const rule = printColor("--id-print-rule");
  const photoSurface = printColor("--id-print-photo");
  const round = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  };
  ctx.fillStyle = paper; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = accent; ctx.fillRect(0, 0, W, 5);
  ctx.textBaseline = "middle";
  ctx.fillStyle = ink; setFont(20, 700); ctx.fillText("Aye Yait Tharyar", 24, 40);
  ctx.fillStyle = muted; setFont(12, 400); ctx.fillText("Staff ID Card", 24, 65);
  const [logo, avatar] = await Promise.all([
    o.logoUrl ? loadImg(o.logoUrl) : null,
    o.avatarUrl ? loadImg(o.avatarUrl) : null,
  ]);
  if (logo) {
    const scale = Math.min(48 / logo.naturalWidth, 48 / logo.naturalHeight);
    const w = logo.naturalWidth * scale, h = logo.naturalHeight * scale;
    ctx.drawImage(logo, 352 - w / 2, 48 - h / 2, w, h);
  }
  ctx.strokeStyle = rule; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(24, 88); ctx.lineTo(376, 88); ctx.stroke();
  const px = 128, py = 108, pw = 144, ph = 180;
  ctx.save(); round(px, py, pw, ph, 6); ctx.clip();
  ctx.fillStyle = photoSurface; ctx.fillRect(px, py, pw, ph);
  if (avatar) {
    const scale = Math.max(pw / avatar.naturalWidth, ph / avatar.naturalHeight);
    const w = avatar.naturalWidth * scale, h = avatar.naturalHeight * scale;
    ctx.drawImage(avatar, px + (pw - w) / 2, py + (ph - h) / 2, w, h);
  } else {
    ctx.fillStyle = muted; setFont(36, 600); ctx.textAlign = "center"; ctx.fillText(o.initials, W / 2, py + ph / 2);
  }
  ctx.restore(); ctx.strokeStyle = rule; round(px, py, pw, ph, 6); ctx.stroke();
  ctx.textAlign = "center"; ctx.fillStyle = ink; setFont(23, 700);
  nameLines.forEach((line, i) => ctx.fillText(line, W / 2, 318 + i * 38));
  ctx.textAlign = "left";
  let y = bodyTop;
  for (const f of rows) {
    ctx.fillStyle = muted; setFont(10, 400); ctx.fillText(f.label, 24, y + 18);
    ctx.fillStyle = ink; setFont(14);
    f.lines.forEach((line, i) => ctx.fillText(line, 160, y + 18 + i * 25));
    y += Math.max(42, f.lines.length * 25 + 16);
    ctx.strokeStyle = rule; ctx.beginPath(); ctx.moveTo(24, y); ctx.lineTo(376, y); ctx.stroke();
  }
  ctx.strokeStyle = rule; ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
  ctx.fillStyle = accent; ctx.fillRect(24, H - 19, W - 48, 2);
  return new Promise((resolve, reject) =>
    c.toBlob(b => b ? resolve(b) : reject(new Error("toBlob failed")), "image/png"),
  );
}
