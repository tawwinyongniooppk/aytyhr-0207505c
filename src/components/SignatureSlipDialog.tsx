import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Eraser, FileDown } from "lucide-react";
import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import { formatMMTDateTime, formatMMTMonthLabel } from "@/lib/mmt";
import { useToast } from "@/hooks/use-toast";

interface LedgerRow {
  date: string;
  type: string;
  description: string;
  amount: number;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  staffName: string;
  monthStartISO: string;
  baseSalary: number;
  totalBonus: number;
  totalAdditions: number;
  totalDeductions: number;
  finalSalary: number;
  ledger: LedgerRow[];
}

export default function SignatureSlipDialog(props: Props) {
  const {
    open, onOpenChange, staffName, monthStartISO,
    baseSalary, totalBonus, totalAdditions, totalDeductions, finalSalary, ledger,
  } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const hasInk = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    hasInk.current = false;
    const c = canvasRef.current;
    if (c) {
      const ctx = c.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 2.2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
      }
    }
    // Load logo
    (async () => {
      const { data } = await supabase.from("app_settings").select("value").eq("key", "company_logo_url").maybeSingle();
      const url = (data as any)?.value as string | undefined;
      if (!url) { setLogoDataUrl(null); return; }
      try {
        const res = await fetch(url, { mode: "cors" });
        const blob = await res.blob();
        const reader = new FileReader();
        reader.onload = () => setLogoDataUrl(reader.result as string);
        reader.readAsDataURL(blob);
      } catch {
        setLogoDataUrl(null);
      }
    })();
  }, [open]);

  const pointerPos = (e: React.PointerEvent) => {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (c.width / rect.width),
      y: (e.clientY - rect.top) * (c.height / rect.height),
    };
  };

  const startDraw = (e: React.PointerEvent) => {
    drawing.current = true;
    lastPoint.current = pointerPos(e);
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
  };
  const moveDraw = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pointerPos(e);
    const from = lastPoint.current ?? p;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPoint.current = p;
    hasInk.current = true;
  };
  const endDraw = () => {
    drawing.current = false;
    lastPoint.current = null;
  };

  const clearPad = () => {
    const c = canvasRef.current!;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    hasInk.current = false;
  };

  // Render text (which may contain Burmese/Unicode) to a PNG data URL using
  // the browser's font stack so jsPDF can embed it as an image. jsPDF's
  // built-in Helvetica does not support non-Latin scripts and would otherwise
  // render Burmese glyphs as spaced boxes.
  const renderTextImage = (
    text: string,
    opts: { fontPx?: number; bold?: boolean; color?: string } = {},
  ): { dataUrl: string; widthMm: number; heightMm: number } => {
    const fontPx = opts.fontPx ?? 28;
    const bold = opts.bold ? "bold " : "";
    const color = opts.color ?? "#0f172a";
    const font = `${bold}${fontPx}px "Noto Sans Myanmar", "Padauk", "Myanmar Text", system-ui, -apple-system, "Segoe UI", Arial, sans-serif`;
    const measure = document.createElement("canvas").getContext("2d")!;
    measure.font = font;
    const m = measure.measureText(text);
    const padX = 4;
    const w = Math.max(2, Math.ceil(m.width)) + padX * 2;
    const h = Math.ceil(fontPx * 1.4);
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, w, h);
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textBaseline = "middle";
    ctx.fillText(text, padX, h / 2);
    const pxToMm = 0.2645 / 1.6;
    return { dataUrl: c.toDataURL("image/png"), widthMm: w * pxToMm, heightMm: h * pxToMm };
  };



  const handleSubmit = async () => {
    if (!hasInk.current) {
      toast({ title: "Signature လိုအပ်ပါသည်", description: "ကျေးဇူးပြု၍ အရင်ဆုံး Sign ထိုးပါ", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      // Make sure the Burmese webfont is loaded before measuring/drawing.
      try { await (document as any).fonts?.load('700 26px "Noto Sans Myanmar"'); } catch {}
      try { await (document as any).fonts?.ready; } catch {}
      const sigDataUrl = canvasRef.current!.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = 210, pageH = 297;
      const marginX = 15;
      let y = 15;

      // Logo
      if (logoDataUrl) {
        try { pdf.addImage(logoDataUrl, "PNG", marginX, y, 22, 22); } catch {}
      }
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(18);
      pdf.text("Salary and Bonus Report", pageW / 2, y + 10, { align: "center" });
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(11);
      pdf.text(formatMMTMonthLabel(`${monthStartISO}T00:00:00+06:30`), pageW / 2, y + 17, { align: "center" });
      y += 28;

      pdf.setDrawColor(180);
      pdf.line(marginX, y, pageW - marginX, y);
      y += 6;

      // Staff label + name (name as image so Burmese renders correctly)
      pdf.setFontSize(11);
      pdf.setFont("helvetica", "bold");
      pdf.text("Staff:", marginX, y);
      const labelW = pdf.getTextWidth("Staff:");
      const nameImg = renderTextImage(staffName, { fontPx: 26, bold: true });
      const nameH = 5;
      const nameW = Math.min(pageW - marginX * 2 - labelW - 4 - 60, nameImg.widthMm * (nameH / nameImg.heightMm));
      try {
        pdf.addImage(nameImg.dataUrl, "PNG", marginX + labelW + 2, y - nameH + 1.2, nameW, nameH);
      } catch {}
      pdf.setFont("helvetica", "normal");
      pdf.text(`Generated: ${formatMMTDateTime(new Date())}`, pageW - marginX, y, { align: "right" });
      y += 8;

      // Summary box
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.text("Summary", marginX, y);
      y += 5;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      const rows: [string, string][] = [
        ["Base Salary", `${baseSalary.toLocaleString()} MMK`],
        ["+ Bonus", `${totalBonus.toLocaleString()} MMK`],
        ["+ Additions", `${totalAdditions.toLocaleString()} MMK`],
        ["- Deductions", `${totalDeductions.toLocaleString()} MMK`],
      ];
      for (const [k, v] of rows) {
        pdf.text(k, marginX + 2, y);
        pdf.text(v, pageW - marginX - 2, y, { align: "right" });
        y += 5;
      }
      pdf.setFont("helvetica", "bold");
      pdf.text("Final Salary", marginX + 2, y);
      pdf.text(`${finalSalary.toLocaleString()} MMK`, pageW - marginX - 2, y, { align: "right" });
      y += 8;
      pdf.line(marginX, y, pageW - marginX, y);
      y += 6;

      // Transactions
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.text("Transaction History", marginX, y);
      y += 6;

      pdf.setFontSize(9);
      pdf.setFillColor(240, 240, 240);
      pdf.rect(marginX, y - 4, pageW - marginX * 2, 6, "F");
      pdf.text("Date", marginX + 2, y);
      pdf.text("Type", marginX + 28, y);
      pdf.text("Description", marginX + 60, y);
      pdf.text("Amount", pageW - marginX - 2, y, { align: "right" });
      y += 5;
      pdf.setFont("helvetica", "normal");

      // Reserve space for signature block (kept fully inside page)
      const sigW = 60, sigH = 22;
      const sigX = pageW - marginX - sigW;
      const sigBlockTop = pageH - 38; // signature image top
      const sigAreaTop = sigBlockTop - 6;

      for (const e of ledger) {
        if (y > sigAreaTop - 8) {
          pdf.addPage();
          y = 20;
        }
        const day = e.date ? e.date.slice(8, 10) : "—";
        const sign = e.amount >= 0 ? "+" : "-";
        const amt = `${sign}${Math.abs(e.amount).toLocaleString()}`;
        const descLines = pdf.splitTextToSize(e.description, 80);
        pdf.text(String(`Day ${day}`), marginX + 2, y);
        pdf.text((e.type || "").replace(/_/g, " "), marginX + 28, y);
        pdf.text(descLines, marginX + 60, y);
        pdf.text(amt, pageW - marginX - 2, y, { align: "right" });
        y += Math.max(5, descLines.length * 4);
      }

      // Signature block — kept fully within A4 bounds
      pdf.setDrawColor(200);
      try { pdf.addImage(sigDataUrl, "PNG", sigX + 2, sigBlockTop, sigW - 4, sigH); } catch {}
      const lineY = sigBlockTop + sigH + 1;
      pdf.line(sigX, lineY, sigX + sigW, lineY);
      pdf.setFontSize(9);
      pdf.setFont("helvetica", "normal");
      pdf.text("Signature", sigX + sigW / 2, lineY + 4, { align: "center" });
      // Render the actual staff name as image (supports Burmese)
      const sigNameImg = renderTextImage(staffName, { fontPx: 22, bold: false });
      const sigNameH = 4.2;
      const sigNameW = Math.min(sigW - 4, sigNameImg.widthMm * (sigNameH / sigNameImg.heightMm));
      try {
        pdf.addImage(
          sigNameImg.dataUrl,
          "PNG",
          sigX + (sigW - sigNameW) / 2,
          lineY + 5.5,
          sigNameW,
          sigNameH,
        );
      } catch {}


      const filename = `Salary-Bonus-Report_${staffName.replace(/\s+/g, "_")}_${monthStartISO}.pdf`;
      pdf.save(filename);
      onOpenChange(false);
      toast({ title: "Downloaded", description: filename });
    } catch (err: any) {
      toast({ title: "PDF failed", description: err?.message || "Unknown error", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Sign Salary & Bonus Slip</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Sign အောက်က Box ထဲမှာ ထိုးပါ။ မှားရင် Clear နှိပ်ပါ။ Submit လိုက်တာနဲ့ PDF Download သွားပါမည်။</p>
          <div className="rounded-lg border border-border bg-white overflow-hidden">
            <canvas
              ref={canvasRef}
              width={600}
              height={220}
              className="w-full h-[180px] touch-none cursor-crosshair"
              onPointerDown={startDraw}
              onPointerMove={moveDraw}
              onPointerUp={endDraw}
              onPointerLeave={endDraw}
            />
          </div>
          <div className="flex justify-between gap-2">
            <Button type="button" variant="outline" size="sm" onClick={clearPad} className="gap-1">
              <Eraser className="h-3 w-3" /> Clear
            </Button>
            <Button type="button" size="sm" onClick={handleSubmit} disabled={submitting} className="gap-1">
              <FileDown className="h-3 w-3" /> {submitting ? "Generating..." : "Submit & Download"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
