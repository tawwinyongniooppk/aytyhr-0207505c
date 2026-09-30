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
  yearly?: {
    assigned: number; done: number; percent: number; rate: number;
    baseSalary: number; basePortion: number; bonusAmount: number; total: number;
    cycleLabel: string; loading: boolean;
  } | null;
  leaveBalance?: number | null;
}

interface TextImage {
  dataUrl: string;
  widthMm: number;
  heightMm: number;
}

const INK = "#172033";
const MUTED = "#64748b";
const NAVY = "#173b63";
const TEAL = "#168578";
const LINE = "#d9e1ea";
const SOFT = "#f4f7fa";

export default function SignatureSlipDialog(props: Props) {
  const {
    open, onOpenChange, staffName, monthStartISO,
    baseSalary, totalBonus, totalAdditions, totalDeductions, finalSalary, ledger,
    yearly, leaveBalance,
  } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const hasInk = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const { toast } = useToast();

  const prepareSignaturePad = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = INK;
    context.lineWidth = 2.2;
    context.lineCap = "round";
    context.lineJoin = "round";
  };

  useEffect(() => {
    if (!open) return;
    hasInk.current = false;
    prepareSignaturePad();
    void (async () => {
      const { data } = await supabase.from("app_settings").select("value").eq("key", "company_logo_url").maybeSingle();
      const value = (data as { value?: string } | null)?.value;
      if (!value) {
        setLogoDataUrl(null);
        return;
      }
      try {
        const response = await fetch(value, { mode: "cors" });
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onload = () => setLogoDataUrl(typeof reader.result === "string" ? reader.result : null);
        reader.readAsDataURL(blob);
      } catch {
        setLogoDataUrl(null);
      }
    })();
  }, [open]);

  const pointerPos = (event: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const startDraw = (event: React.PointerEvent) => {
    const point = pointerPos(event);
    if (!point) return;
    drawing.current = true;
    lastPoint.current = point;
    (event.target as HTMLCanvasElement).setPointerCapture(event.pointerId);
  };

  const moveDraw = (event: React.PointerEvent) => {
    if (!drawing.current) return;
    const context = canvasRef.current?.getContext("2d");
    const point = pointerPos(event);
    if (!context || !point) return;
    const from = lastPoint.current ?? point;
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    lastPoint.current = point;
    hasInk.current = true;
  };

  const endDraw = () => {
    drawing.current = false;
    lastPoint.current = null;
  };

  const clearPad = () => {
    prepareSignaturePad();
    hasInk.current = false;
  };

  const renderTextImage = (
    text: string,
    options: { fontPx?: number; bold?: boolean; color?: string; maxWidthPx?: number; lineHeight?: number } = {},
  ): TextImage | null => {
    const fontPx = options.fontPx ?? 28;
    const lineHeight = options.lineHeight ?? 1.45;
    const font = `${options.bold ? "700" : "400"} ${fontPx}px "Noto Sans Myanmar", "Padauk", "Myanmar Text", system-ui, sans-serif`;
    const measureCanvas = document.createElement("canvas");
    const measure = measureCanvas.getContext("2d");
    if (!measure) return null;
    measure.font = font;
    const maxWidth = options.maxWidthPx ?? Math.max(2, Math.ceil(measure.measureText(text).width));
    const words = text.trim().split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = "";
    for (const word of words.length ? words : [""]) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && measure.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line || lines.length === 0) lines.push(line);
    const padX = 4;
    const padY = Math.ceil(fontPx * 0.45);
    const widest = Math.max(...lines.map((entry) => measure.measureText(entry).width), 2);
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(Math.max(options.maxWidthPx ? widest : maxWidth, 2)) + padX * 2;
    canvas.height = Math.ceil(lines.length * fontPx * lineHeight) + padY * 2;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.font = font;
    context.fillStyle = options.color ?? INK;
    context.textBaseline = "top";
    lines.forEach((entry, index) => context.fillText(entry, padX, padY + index * fontPx * lineHeight));
    const pxToMm = 0.264583 / 1.6;
    return {
      dataUrl: canvas.toDataURL("image/png"),
      widthMm: canvas.width * pxToMm,
      heightMm: canvas.height * pxToMm,
    };
  };

  const handleSubmit = async () => {
    const signatureCanvas = canvasRef.current;
    if (!hasInk.current || !signatureCanvas) {
      toast({ title: "Signature လိုအပ်ပါသည်", description: "ကျေးဇူးပြု၍ အရင်ဆုံး Sign ထိုးပါ", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await document.fonts?.ready;
      const signatureDataUrl = signatureCanvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 14;
      const contentWidth = pageWidth - margin * 2;
      const money = (value: number) => `${value.toLocaleString()} MMK`;
      const amount = (value: number) => `${value >= 0 ? "+" : "-"}${Math.abs(value).toLocaleString()}`;
      let y = 14;
      let pageNumber = 1;

      const setRgb = (hex: string, target: "text" | "draw" | "fill") => {
        const value = hex.replace("#", "");
        const rgb = [0, 2, 4].map((index) => Number.parseInt(value.slice(index, index + 2), 16)) as [number, number, number];
        if (target === "text") pdf.setTextColor(...rgb);
        if (target === "draw") pdf.setDrawColor(...rgb);
        if (target === "fill") pdf.setFillColor(...rgb);
      };

      const addFooter = () => {
        setRgb(LINE, "draw");
        pdf.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(7.5);
        setRgb(MUTED, "text");
        pdf.text("Aye Yait Tharyar  •  Confidential salary document", margin, pageHeight - 7);
        pdf.text(`Page ${pageNumber}`, pageWidth - margin, pageHeight - 7, { align: "right" });
      };

      const addDocumentHeader = (compact = false) => {
        if (compact) {
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(10);
          setRgb(NAVY, "text");
          pdf.text("SALARY STATEMENT", margin, 14);
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(8);
          setRgb(MUTED, "text");
          pdf.text(formatMMTMonthLabel(`${monthStartISO}T00:00:00+06:30`), pageWidth - margin, 14, { align: "right" });
          setRgb(LINE, "draw");
          pdf.line(margin, 18, pageWidth - margin, 18);
          y = 25;
          return;
        }
        if (logoDataUrl) {
          try { pdf.addImage(logoDataUrl, "PNG", margin, y, 20, 20); } catch { /* optional branding */ }
        }
        const titleX = logoDataUrl ? margin + 25 : margin;
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(9);
        setRgb(TEAL, "text");
        pdf.text("AYE YAIT THARYAR", titleX, y + 4);
        pdf.setFontSize(20);
        setRgb(NAVY, "text");
        pdf.text("SALARY STATEMENT", titleX, y + 12);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8.5);
        setRgb(MUTED, "text");
        pdf.text("Private & Confidential", titleX, y + 18);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(10);
        setRgb(INK, "text");
        pdf.text(formatMMTMonthLabel(`${monthStartISO}T00:00:00+06:30`), pageWidth - margin, y + 8, { align: "right" });
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(7.5);
        setRgb(MUTED, "text");
        pdf.text(`Issued ${formatMMTDateTime(new Date())}`, pageWidth - margin, y + 14, { align: "right" });
        y += 28;
        setRgb(NAVY, "fill");
        pdf.rect(margin, y, contentWidth, 1.4, "F");
        y += 8;
      };

      const addStaffDetails = () => {
        setRgb(SOFT, "fill");
        pdf.roundedRect(margin, y, contentWidth, 22, 1.5, 1.5, "F");
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(7.5);
        setRgb(MUTED, "text");
        pdf.text("EMPLOYEE", margin + 5, y + 6);
        pdf.text("PAY PERIOD", margin + 112, y + 6);
        const nameImage = renderTextImage(staffName, { fontPx: 27, bold: true, maxWidthPx: 520 });
        if (nameImage) {
          const imageHeight = 5.4;
          const imageWidth = Math.min(100, nameImage.widthMm * imageHeight / nameImage.heightMm);
          pdf.addImage(nameImage.dataUrl, "PNG", margin + 4.5, y + 9, imageWidth, imageHeight);
        }
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(11);
        setRgb(INK, "text");
        pdf.text(formatMMTMonthLabel(`${monthStartISO}T00:00:00+06:30`), margin + 112, y + 15);
        y += 28;
      };

      const summaryRow = (label: string, value: number, rowY: number, emphasized = false) => {
        pdf.setFont("helvetica", emphasized ? "bold" : "normal");
        pdf.setFontSize(emphasized ? 11 : 9.5);
        setRgb(emphasized ? NAVY : INK, "text");
        pdf.text(label, margin + 5, rowY);
        pdf.text(money(value), pageWidth - margin - 5, rowY, { align: "right" });
      };

      const addSummary = () => {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(9);
        setRgb(NAVY, "text");
        pdf.text("PAY SUMMARY", margin, y);
        y += 5;
        setRgb(LINE, "draw");
        pdf.roundedRect(margin, y, contentWidth, 40, 1.5, 1.5, "S");
        summaryRow("Base Salary", baseSalary, y + 8);
        summaryRow("Bonus", totalBonus, y + 15);
        summaryRow("Additional Credits", totalAdditions, y + 22);
        summaryRow("Deductions", -Math.abs(totalDeductions), y + 29);
        setRgb(NAVY, "fill");
        pdf.rect(margin, y + 32, contentWidth, 8, "F");
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(11);
        pdf.setTextColor(255, 255, 255);
        pdf.text("NET SALARY", margin + 5, y + 37.5);
        pdf.text(money(finalSalary), pageWidth - margin - 5, y + 37.5, { align: "right" });
        y += 48;
      };

      const addBenefitPanels = () => {
        const showYearly = Boolean(yearly && !yearly.loading);
        const showLeave = typeof leaveBalance === "number";
        if (!showYearly && !showLeave) return;
        const gap = 4;
        const leaveWidth = showLeave ? (showYearly ? 49 : contentWidth) : 0;
        const yearlyWidth = showYearly ? contentWidth - (showLeave ? leaveWidth + gap : 0) : 0;
        const panelHeight = 39;
        if (showYearly && yearly) {
          setRgb(SOFT, "fill");
          setRgb(LINE, "draw");
          pdf.roundedRect(margin, y, yearlyWidth, panelHeight, 1.5, 1.5, "FD");
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(9);
          setRgb(NAVY, "text");
          pdf.text("MY YEARLY BONUS", margin + 4, y + 6);
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(7);
          setRgb(MUTED, "text");
          pdf.text(yearly.cycleLabel, margin + yearlyWidth - 4, y + 6, { align: "right" });
          pdf.text(`Assigned ${yearly.assigned}  •  All Done ${yearly.done}  •  Performance ${yearly.percent}%`, margin + 4, y + 12);
          pdf.setFontSize(8.5);
          setRgb(INK, "text");
          pdf.text(`Base Salary (${yearly.rate}%)`, margin + 4, y + 20);
          pdf.text(money(yearly.basePortion), margin + yearlyWidth - 4, y + 20, { align: "right" });
          pdf.text("+ Admin Bonus", margin + 4, y + 26);
          pdf.text(money(yearly.bonusAmount), margin + yearlyWidth - 4, y + 26, { align: "right" });
          setRgb(LINE, "draw");
          pdf.line(margin + 4, y + 29, margin + yearlyWidth - 4, y + 29);
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(10);
          setRgb(TEAL, "text");
          pdf.text("TOTAL", margin + 4, y + 35);
          pdf.text(money(yearly.total), margin + yearlyWidth - 4, y + 35, { align: "right" });
        }
        if (showLeave) {
          const left = margin + (showYearly ? yearlyWidth + gap : 0);
          setRgb(SOFT, "fill");
          setRgb(LINE, "draw");
          pdf.roundedRect(left, y, leaveWidth, panelHeight, 1.5, 1.5, "FD");
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(8);
          setRgb(NAVY, "text");
          pdf.text("LEAVE BALANCE", left + leaveWidth / 2, y + 8, { align: "center" });
          pdf.setFontSize(21);
          setRgb(TEAL, "text");
          pdf.text(String(leaveBalance), left + leaveWidth / 2, y + 23, { align: "center" });
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(7.5);
          setRgb(MUTED, "text");
          pdf.text("days remaining", left + leaveWidth / 2, y + 30, { align: "center" });
        }
        y += panelHeight + 9;
      };

      const addTableHeader = () => {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(8.5);
        setRgb(NAVY, "text");
        pdf.text("TRANSACTION HISTORY", margin, y);
        y += 5;
        setRgb(NAVY, "fill");
        pdf.rect(margin, y, contentWidth, 8, "F");
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(7.5);
        pdf.text("DATE", margin + 3, y + 5.2);
        pdf.text("TYPE", margin + 26, y + 5.2);
        pdf.text("DESCRIPTION", margin + 57, y + 5.2);
        pdf.text("AMOUNT", pageWidth - margin - 3, y + 5.2, { align: "right" });
        y += 8;
      };

      const addNewTransactionPage = () => {
        addFooter();
        pdf.addPage();
        pageNumber += 1;
        addDocumentHeader(true);
        addTableHeader();
      };

      addDocumentHeader();
      addStaffDetails();
      addSummary();
      addBenefitPanels();
      addTableHeader();

      if (ledger.length === 0) {
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);
        setRgb(MUTED, "text");
        pdf.text("No transactions recorded for this pay period.", pageWidth / 2, y + 12, { align: "center" });
        y += 24;
      } else {
        for (let index = 0; index < ledger.length; index += 1) {
          const entry = ledger[index];
          const descriptionImage = renderTextImage(entry.description || "—", {
            fontPx: 25,
            color: INK,
            maxWidthPx: 590,
            lineHeight: 1.5,
          });
          const descriptionHeight = descriptionImage ? Math.max(4.5, descriptionImage.heightMm * 0.72) : 5;
          const rowHeight = Math.max(10, descriptionHeight + 4);
          if (y + rowHeight > pageHeight - 22) addNewTransactionPage();
          if (index % 2 === 1) {
            setRgb(SOFT, "fill");
            pdf.rect(margin, y, contentWidth, rowHeight, "F");
          }
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(8);
          setRgb(INK, "text");
          const day = entry.date ? entry.date.slice(8, 10) : "—";
          pdf.text(`Day ${day}`, margin + 3, y + 6);
          pdf.text((entry.type || "—").replace(/_/g, " "), margin + 26, y + 6);
          if (descriptionImage) {
            pdf.addImage(descriptionImage.dataUrl, "PNG", margin + 56, y + 2, 98, descriptionHeight);
          }
          pdf.setFont("helvetica", "bold");
          setRgb(entry.amount < 0 ? "#a93434" : TEAL, "text");
          pdf.text(amount(entry.amount), pageWidth - margin - 3, y + 6, { align: "right" });
          setRgb(LINE, "draw");
          pdf.line(margin, y + rowHeight, pageWidth - margin, y + rowHeight);
          y += rowHeight;
        }
      }

      if (y > pageHeight - 55) {
        addFooter();
        pdf.addPage();
        pageNumber += 1;
        addDocumentHeader(true);
      }
      const signatureTop = Math.max(y + 10, pageHeight - 52);
      setRgb(MUTED, "text");
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7.5);
      pdf.text("I acknowledge receipt of this salary statement.", margin, signatureTop + 4);
      const signatureWidth = 58;
      const signatureX = pageWidth - margin - signatureWidth;
      pdf.addImage(signatureDataUrl, "PNG", signatureX + 2, signatureTop - 3, signatureWidth - 4, 19);
      setRgb(INK, "draw");
      pdf.line(signatureX, signatureTop + 17, signatureX + signatureWidth, signatureTop + 17);
      pdf.setFontSize(7.5);
      setRgb(MUTED, "text");
      pdf.text("EMPLOYEE SIGNATURE", signatureX + signatureWidth / 2, signatureTop + 21, { align: "center" });
      const signatureName = renderTextImage(staffName, { fontPx: 20, maxWidthPx: 330, color: MUTED });
      if (signatureName) {
        const nameHeight = 3.8;
        const nameWidth = Math.min(signatureWidth - 4, signatureName.widthMm * nameHeight / signatureName.heightMm);
        pdf.addImage(signatureName.dataUrl, "PNG", signatureX + (signatureWidth - nameWidth) / 2, signatureTop + 23, nameWidth, nameHeight);
      }
      addFooter();

      const filename = `Salary-Bonus-Report_${staffName.replace(/\s+/g, "_")}_${monthStartISO}.pdf`;
      pdf.save(filename);
      onOpenChange(false);
      toast({ title: "Downloaded", description: filename });
    } catch (error) {
      const description = error instanceof Error ? error.message : "Unknown error";
      toast({ title: "PDF failed", description, variant: "destructive" });
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
          <div className="overflow-hidden rounded-lg border border-border bg-background">
            <canvas
              ref={canvasRef}
              width={600}
              height={220}
              className="h-[180px] w-full touch-none cursor-crosshair bg-background"
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