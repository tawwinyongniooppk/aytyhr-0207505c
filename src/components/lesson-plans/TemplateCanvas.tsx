import { useMemo, forwardRef } from "react";
import type { LessonPlanTemplate, Cell } from "@/lib/lessonPlanTypes";
import { PAGE_PX, PALETTE_BY_ID } from "@/lib/lessonPlanDefaults";
import { cn } from "@/lib/utils";

interface Props {
  template: LessonPlanTemplate;
  editable?: boolean; // staff mode: unlocked cells editable
  selectedCellId?: string | null;
  onCellClick?: (cardId: string, rowId: string, cellId: string) => void;
  onCellChange?: (cardId: string, rowId: string, cellId: string, value: string) => void;
  className?: string;
}

export const TemplateCanvas = forwardRef<HTMLDivElement, Props>(function TemplateCanvas(
  { template, editable, selectedCellId, onCellClick, onCellChange, className },
  ref,
) {
  const palette = PALETTE_BY_ID(template.palette);
  const pageDims = useMemo(() => {
    const base = PAGE_PX[template.page.size];
    return template.page.orientation === "portrait"
      ? { width: base.width, height: base.height }
      : { width: base.height, height: base.width };
  }, [template.page.size, template.page.orientation]);

  const marginPx = (template.page.margin / 25.4) * 96;

  const renderCell = (cardId: string, rowId: string, cell: Cell, colWidthPct: number) => {
    const fontSize = Math.max(cell.fontSize ?? 12, cell.minFontSize ?? 12);
    const baseStyle: React.CSSProperties = {
      fontSize,
      fontFamily: cell.fontFamily,
      color: cell.color ?? palette.text,
      background: cell.bgColor,
      textAlign: cell.align ?? "left",
      fontWeight: cell.bold ? 700 : 400,
      fontStyle: cell.italic ? "italic" : "normal",
      textDecoration: cell.underline ? "underline" : undefined,
      width: `${colWidthPct * (cell.colSpan ?? 1)}%`,
      border: `${template.border.size}px ${template.border.style} ${template.border.color}`,
      padding: "6px 8px",
      verticalAlign: "top",
      wordBreak: "break-word",
      whiteSpace: "pre-wrap",
      minHeight: 28,
      outline: selectedCellId === cell.id ? `2px solid ${palette.accent}` : undefined,
    };

    if (editable && !cell.locked) {
      return (
        <td
          key={cell.id}
          colSpan={cell.colSpan}
          style={baseStyle}
        >
          <textarea
            value={cell.value}
            onChange={e => onCellChange?.(cardId, rowId, cell.id, e.target.value)}
            rows={1}
            style={{
              width: "100%",
              border: "none",
              outline: "none",
              resize: "none",
              background: "transparent",
              font: "inherit",
              color: "inherit",
              textAlign: cell.align ?? "left",
              padding: 0,
              minHeight: fontSize * 1.4,
              overflow: "hidden",
            }}
            onInput={(e) => {
              const t = e.currentTarget;
              t.style.height = "auto";
              t.style.height = t.scrollHeight + "px";
            }}
            ref={(el) => {
              if (el) {
                el.style.height = "auto";
                el.style.height = el.scrollHeight + "px";
              }
            }}
          />
        </td>
      );
    }

    return (
      <td
        key={cell.id}
        colSpan={cell.colSpan}
        style={baseStyle}
        onClick={() => onCellClick?.(cardId, rowId, cell.id)}
      >
        {cell.value || (editable ? "" : <span style={{ opacity: 0.35 }}>{cell.locked ? "" : "—"}</span>)}
      </td>
    );
  };

  return (
    <div
      ref={ref}
      className={cn("relative bg-white shadow-sm mx-auto", className)}
      style={{
        width: pageDims.width,
        minHeight: pageDims.height,
        color: palette.text,
        background: "#ffffff",
      }}
    >
      {/* Watermark */}
      {(template.branding.watermark.text || template.branding.watermark.imageUrl) && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            opacity: template.branding.watermark.opacity,
            zIndex: 0,
          }}
        >
          {template.branding.watermark.imageUrl ? (
            <img src={template.branding.watermark.imageUrl} alt="" style={{ maxWidth: "70%", maxHeight: "70%" }} />
          ) : (
            <div style={{ fontSize: 90, fontWeight: 700, color: palette.primary, transform: "rotate(-30deg)" }}>
              {template.branding.watermark.text}
            </div>
          )}
        </div>
      )}

      <div style={{ position: "relative", zIndex: 1, padding: marginPx }}>
        {/* Header / letterhead */}
        <div className="flex items-center gap-3" style={{ borderBottom: `2px solid ${palette.primary}`, paddingBottom: 8 }}>
          {template.branding.logoUrl && (
            <img src={template.branding.logoUrl} alt="" style={{ height: 56 }} crossOrigin="anonymous" />
          )}
          <div style={{ color: palette.primary, fontWeight: 700, fontSize: 18 }}>
            {template.branding.headerText}
          </div>
        </div>
        {template.letterheadFooterText && (
          <div style={{ fontSize: 11, color: palette.accent, marginTop: 4, marginBottom: 12 }}>
            {template.letterheadFooterText}
          </div>
        )}

        {/* Cards */}
        <div className="space-y-3 mt-3">
          {template.cards.map(card => {
            const cols = Math.max(1, card.columns);
            const widthPct = 100 / cols;
            return (
              <div key={card.id} style={{ background: card.bgColor, border: card.borderColor ? `1px solid ${card.borderColor}` : undefined, borderRadius: 8, overflow: "hidden" }}>
                <div style={{ background: palette.primary, color: "#fff", padding: "6px 10px", fontWeight: 600, fontSize: 13 }}>
                  {card.title}
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                  <tbody>
                    {card.rows.map(row => (
                      <tr key={row.id}>
                        {row.cells.map(cell => renderCell(card.id, row.id, cell, widthPct))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});
