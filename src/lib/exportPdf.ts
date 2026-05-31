import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { saveAs } from "file-saver";
import type { PageSize, Orientation } from "./lessonPlanTypes";

const PAGE_MM: Record<PageSize, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  Legal: { w: 216, h: 356 },
};

export async function exportPagesToPdf(
  pages: HTMLElement[],
  size: PageSize,
  orientation: Orientation,
  filename: string,
) {
  const dims = PAGE_MM[size];
  const pdf = new jsPDF({
    orientation,
    unit: "mm",
    format: orientation === "portrait" ? [dims.w, dims.h] : [dims.h, dims.w],
  });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < pages.length; i++) {
    const el = pages[i];
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
    const img = canvas.toDataURL("image/jpeg", 0.95);
    if (i > 0) pdf.addPage(orientation === "portrait" ? [dims.w, dims.h] : [dims.h, dims.w], orientation);
    // fit to page (width-based; height never exceeds since page element matches paper ratio)
    const ratio = canvas.height / canvas.width;
    const w = pageW;
    const h = Math.min(pageH, pageW * ratio);
    pdf.addImage(img, "JPEG", 0, 0, w, h);
  }

  const blob = pdf.output("blob");
  saveAs(blob, filename);
}
