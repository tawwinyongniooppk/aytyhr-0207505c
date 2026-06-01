import { useMemo, forwardRef } from "react";
import type { LessonPlanTemplate, Cell, FreeElement } from "@/lib/lessonPlanTypes";
import { PAGE_PX, PALETTE_BY_ID } from "@/lib/lessonPlanDefaults";
import { cn } from "@/lib/utils";
import { Check, X, Star, ArrowRight, Circle } from "lucide-react";

interface Props {
  template: LessonPlanTemplate;
  editable?: boolean;
  selectedCellId?: string | null;
  selectedFreeId?: string | null;
  onCellClick?: (cardId: string, rowId: string, cellId: string) => void;
  onCellChange?: (cardId: string, rowId: string, cellId: string, value: string) => void;
  onFreeClick?: (id: string) => void;
  className?: string;
  // Edit mode for free elements + watermark (in IT Manager editor we render an overlay separately)
  renderOverlay?: (page: { width: number; height: number }) => React.ReactNode;
}

function renderPrefix(cell: Cell, indexInRow: number) {
  switch (cell.prefix) {
    case "bullet":
      return <span style={{ marginRight: 4 }}>•</span>;
    case "number":
      return <span style={{ marginRight: 4 }}>{indexInRow + 1}.</span>;
    case "checkbox":
      return <span style={{ display: "inline-block", width: 12, height: 12, border: "1px solid currentColor", marginRight: 4, verticalAlign: "middle" }} />;
    case "radio":
      return <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", border: "1px solid currentColor", marginRight: 4, verticalAlign: "middle" }} />;
    default:
      return null;
  }
}

function FreeEl({ el }: { el: FreeElement }) {
  const baseStyle: React.CSSProperties = {
    position: "absolute",
    left: el.x,
    top: el.y,
    width: el.width,
    height: el.height,
    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
    zIndex: el.zIndex ?? 2,
  };
  if (el.type === "text") {
    return (
      <div
        style={{
          ...baseStyle,
          fontFamily: el.fontFamily,
          fontSize: el.fontSize ?? 14,
          color: el.color ?? "#000",
          fontWeight: el.bold ? 700 : 400,
          fontStyle: el.italic ? "italic" : "normal",
          textDecoration: el.underline ? "underline" : undefined,
          textAlign: el.align ?? "left",
          padding: 2,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {el.text}
      </div>
    );
  }
  if (el.type === "image") {
    return <img src={el.imageUrl} alt="" style={{ ...baseStyle, objectFit: "contain" }} crossOrigin="anonymous" />;
  }
  if (el.type === "shape") {
    if (el.shape === "circle") {
      return <div style={{ ...baseStyle, background: el.bgColor ?? "transparent", border: `${el.borderWidth ?? 1}px solid ${el.borderColor ?? "#000"}`, borderRadius: "50%" }} />;
    }
    if (el.shape === "line") {
      return <div style={{ ...baseStyle, height: el.borderWidth ?? 2, background: el.borderColor ?? "#000", border: "none" }} />;
    }
    return <div style={{ ...baseStyle, background: el.bgColor ?? "transparent", border: `${el.borderWidth ?? 1}px solid ${el.borderColor ?? "#000"}` }} />;
  }
  if (el.type === "icon") {
    const color = el.color ?? "#000";
    const size = Math.min(el.width, el.height);
    const Icon = el.icon === "cross" ? X : el.icon === "star" ? Star : el.icon === "arrow" ? ArrowRight : el.icon === "bullet" ? Circle : Check;
    return <div style={baseStyle}><Icon style={{ width: size, height: size, color }} /></div>;
  }
  return null;
}

export const TemplateCanvas = forwardRef<HTMLDivElement, Props>(function TemplateCanvas(
  { template, editable, selectedCellId, onCellClick, onCellChange, className, renderOverlay },
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
  const wm = template.branding.watermark;

  const renderCell = (cardId: string, rowId: string, cell: Cell, indexInRow: number, colWidthPct: number, rowHeight?: number) => {
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
      height: rowHeight,
      outline: selectedCellId === cell.id ? `2px solid ${palette.accent}` : undefined,
    };

    const prefix = renderPrefix(cell, indexInRow);

    if (editable && !cell.locked) {
      if (cell.options && cell.options.length > 0) {
        return (
          <td key={cell.id} colSpan={cell.colSpan} style={baseStyle}>
            {prefix}
            <select
              value={cell.value}
              onChange={e => onCellChange?.(cardId, rowId, cell.id, e.target.value)}
              style={{ width: "100%", border: "none", background: "transparent", font: "inherit", color: "inherit", outline: "none" }}
            >
              <option value="">— Select —</option>
              {cell.options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </td>
        );
      }
      return (
        <td key={cell.id} colSpan={cell.colSpan} style={baseStyle}>
          {prefix}
          <textarea
            value={cell.value}
            onChange={e => onCellChange?.(cardId, rowId, cell.id, e.target.value)}
            rows={1}
            style={{
              width: prefix ? "calc(100% - 18px)" : "100%",
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
              display: "inline-block",
              verticalAlign: "top",
            }}
            onInput={e => {
              const t = e.currentTarget;
              t.style.height = "auto";
              t.style.height = t.scrollHeight + "px";
            }}
            ref={el => {
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
      <td key={cell.id} colSpan={cell.colSpan} style={baseStyle} onClick={() => onCellClick?.(cardId, rowId, cell.id)}>
        {prefix}
        {cell.value || (editable ? "" : <span style={{ opacity: 0.35 }}>{cell.locked ? "" : "—"}</span>)}
      </td>
    );
  };

  return (
    <div
      ref={ref}
      className={cn("relative bg-white shadow-sm mx-auto", className)}
      style={{ width: pageDims.width, minHeight: pageDims.height, color: palette.text, background: "#ffffff" }}
    >
      {/* Watermark (positioned & transformable) */}
      {(wm.text || wm.imageUrl) && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: wm.x ?? 0,
            top: wm.y ?? 0,
            width: wm.width ?? 400,
            height: wm.height ?? 200,
            transform: `rotate(${wm.rotation ?? 0}deg)`,
            opacity: wm.opacity,
            pointerEvents: "none",
            zIndex: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {wm.imageUrl ? (
            <img src={wm.imageUrl} alt="" style={{ maxWidth: "100%", maxHeight: "100%" }} crossOrigin="anonymous" />
          ) : (
            <div style={{ fontSize: Math.min((wm.width ?? 400) / 6, (wm.height ?? 200) / 2), fontWeight: 700, color: palette.primary, whiteSpace: "nowrap" }}>
              {wm.text}
            </div>
          )}
        </div>
      )}

      <div style={{ position: "relative", zIndex: 1, padding: marginPx }}>
        <div className="flex items-center gap-3" style={{ borderBottom: `2px solid ${palette.primary}`, paddingBottom: 8 }}>
          {template.branding.logoUrl && (
            <img src={template.branding.logoUrl} alt="" style={{ height: 56 }} crossOrigin="anonymous" />
          )}
          <div style={{ color: palette.primary, fontWeight: 700, fontSize: 18 }}>{template.branding.headerText}</div>
        </div>
        {template.letterheadFooterText && (
          <div style={{ fontSize: 11, color: palette.accent, marginTop: 4, marginBottom: 12 }}>{template.letterheadFooterText}</div>
        )}

        <div className="space-y-3 mt-3">
          {template.cards.map(card => {
            const cols = Math.max(1, card.columns);
            const colWidths = card.colWidths && card.colWidths.length === cols ? card.colWidths : Array.from({ length: cols }, () => 100 / cols);
            return (
              <div key={card.id} style={{ background: card.bgColor, border: card.borderColor ? `1px solid ${card.borderColor}` : undefined, borderRadius: 8, overflow: "hidden" }}>
                <div style={{ background: palette.primary, color: "#fff", padding: "6px 10px", fontWeight: 600, fontSize: 13 }}>{card.title}</div>
                <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                  <colgroup>
                    {colWidths.map((w, i) => <col key={i} style={{ width: `${w}%` }} />)}
                  </colgroup>
                  <tbody>
                    {card.rows.map(row => (
                      <tr key={row.id} style={{ height: row.height }}>
                        {row.cells.map((cell, idx) => renderCell(card.id, row.id, cell, idx, colWidths[idx] ?? 100 / cols, row.height))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>

        {/* Free elements layer (rendered statically in canvas; editor renders an interactive overlay separately) */}
        {!renderOverlay && (template.freeElements ?? []).map(el => <FreeEl key={el.id} el={el} />)}
      </div>

      {/* Optional interactive overlay from editor */}
      {renderOverlay && renderOverlay(pageDims)}
    </div>
  );
});
