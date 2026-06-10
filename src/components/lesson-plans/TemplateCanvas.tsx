import { useMemo, forwardRef, useRef, useState, useEffect, useLayoutEffect } from "react";
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
  /** Live drag column resize: colIdx is the LEFT column of the pair. Adjacent column compensates. */
  onColWidthChange?: (cardId: string, leftColIdx: number, newLeftPct: number) => void;
  /** Visual scale of the canvas (for converting drag pixel delta back to model space). */
  scale?: number;
  /** Show dashed page-break lines if content exceeds one page height. */
  showPageBreaks?: boolean;
  className?: string;
  renderOverlay?: (page: { width: number; height: number }) => React.ReactNode;
  /** Drag-to-reorder tables on the canvas. */
  dragCardId?: string | null;
  onCardDragStart?: (id: string) => void;
  onCardDragEnd?: () => void;
  onCardReorder?: (fromId: string, toId: string | null) => void;
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

/** Per-card draggable column separator overlay. Edges are non-draggable. */
function ColumnResizeOverlay({
  cardId,
  columns,
  colWidths,
  onColWidthChange,
  scale,
}: {
  cardId: string;
  columns: number;
  colWidths: number[];
  onColWidthChange: (cardId: string, leftColIdx: number, newLeftPct: number) => void;
  scale: number;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // Cumulative percentage positions for separators (B = 1..columns-1 between col B-1 and col B)
  const cum: number[] = [];
  let acc = 0;
  for (let i = 0; i < columns; i++) {
    acc += colWidths[i] ?? 100 / columns;
    cum.push(acc);
  }

  const startDrag = (e: React.MouseEvent, boundaryB: number) => {
    e.preventDefault();
    e.stopPropagation();
    const overlay = overlayRef.current;
    if (!overlay) return;
    const tableW = overlay.offsetWidth; // matches table width since overlay is inset:0
    const startX = e.clientX;
    const left = colWidths[boundaryB - 1];
    const right = colWidths[boundaryB];
    const total = left + right;

    const onMove = (ev: MouseEvent) => {
      const dxPx = (ev.clientX - startX) / (scale || 1);
      const dxPct = (dxPx / tableW) * 100;
      const newLeft = Math.max(5, Math.min(total - 5, left + dxPct));
      onColWidthChange(cardId, boundaryB - 1, newLeft);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div ref={overlayRef} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {Array.from({ length: columns - 1 }, (_, i) => i + 1).map(B => {
        // Only outer table edges are non-draggable. Every inner column boundary is adjustable.
        const isHover = hoverIdx === B;
        return (
          <div
            key={B}
            onMouseDown={e => startDrag(e, B)}
            onMouseEnter={() => setHoverIdx(B)}
            onMouseLeave={() => setHoverIdx(null)}
            title="Drag to resize column"
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${cum[B - 1]}%`,
              width: 10,
              marginLeft: -5,
              cursor: "col-resize",
              pointerEvents: "auto",
              background: isHover ? "rgba(59,130,246,0.25)" : "transparent",
              borderLeft: isHover ? "2px solid hsl(var(--primary))" : "2px solid transparent",
              zIndex: 4,
            }}
          />
        );
      })}
    </div>
  );
}

export const TemplateCanvas = forwardRef<HTMLDivElement, Props>(function TemplateCanvas(
  { template, editable, selectedCellId, onCellClick, onCellChange, onColWidthChange, scale = 1, showPageBreaks, className, renderOverlay, dragCardId, onCardDragStart, onCardDragEnd, onCardReorder },
  ref,
) {
  const palette = PALETTE_BY_ID(template.palette);
  const pageDims = useMemo(() => {
    const base = PAGE_PX[template.page.size];
    return template.page.orientation === "portrait"
      ? { width: base.width, height: base.height }
      : { width: base.height, height: base.width };
  }, [template.page.size, template.page.orientation]);

  const mmToPx = (mm: number) => (mm / 25.4) * 96;
  const m = template.page;
  const marginTop = mmToPx(m.marginTop ?? m.margin);
  const marginRight = mmToPx(m.marginRight ?? m.margin);
  const marginBottom = mmToPx(m.marginBottom ?? m.margin);
  const marginLeft = mmToPx(m.marginLeft ?? m.margin);

  const wm = template.branding.watermark;

  // Measure content height for page-break lines
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentH, setContentH] = useState(0);
  useLayoutEffect(() => {
    if (!showPageBreaks) return;
    const el = contentRef.current;
    if (!el) return;
    const update = () => setContentH(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [showPageBreaks, template]);

  const totalHeight = Math.max(pageDims.height, contentH + marginTop + marginBottom + 40);
  const pageCount = Math.max(1, Math.ceil(totalHeight / pageDims.height));

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

  const renderTableBlock = (card: typeof template.cards[number]) => {
    const cols = Math.max(1, card.columns);
    const colWidths = card.colWidths && card.colWidths.length === cols ? card.colWidths : Array.from({ length: cols }, () => 100 / cols);
    const dragProps = editable && onCardReorder && !card.free ? {
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", card.id);
        onCardDragStart?.(card.id);
      },
      onDragEnd: () => onCardDragEnd?.(),
      onDragOver: (e: React.DragEvent) => { if (dragCardId && dragCardId !== card.id) e.preventDefault(); },
      onDrop: (e: React.DragEvent) => {
        if (!dragCardId) return;
        e.preventDefault();
        e.stopPropagation();
        onCardReorder(dragCardId, card.id);
      },
    } : {};
    const isDragging = dragCardId === card.id;
    return (
      <div
        key={card.id}
        {...dragProps}
        style={{
          background: card.bgColor,
          border: card.borderColor ? `1px solid ${card.borderColor}` : (editable && onCardReorder && !card.free ? "1px dashed transparent" : undefined),
          borderRadius: 8,
          overflow: "hidden",
          opacity: isDragging ? 0.5 : 1,
          cursor: editable && onCardReorder && !card.free ? "move" : undefined,
          outline: dragCardId && dragCardId !== card.id && !card.free ? "1px dashed hsl(var(--primary) / 0.4)" : undefined,
          height: "100%",
        }}
      >
        <div style={{ background: palette.primary, color: "#fff", padding: "6px 10px", fontWeight: 600, fontSize: 13 }}>{card.title}</div>
        <div style={{ position: "relative" }}>
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
          {editable && onColWidthChange && cols >= 2 && (
            <ColumnResizeOverlay
              cardId={card.id}
              columns={cols}
              colWidths={colWidths}
              onColWidthChange={onColWidthChange}
              scale={scale}
            />
          )}
        </div>
      </div>
    );
  };

  const flowCards = template.cards.filter(c => !c.free);
  const freeCards = template.cards.filter(c => c.free);
  const b = template.branding;
  const useFreeLetterhead = !!b.freeLetterhead;

  return (
    <div
      ref={ref}
      className={cn("relative bg-white shadow-sm mx-auto", className)}
      style={{ width: pageDims.width, minHeight: totalHeight, color: palette.text, background: "#ffffff" }}
    >
      {/* Watermark */}
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

      {/* Free letterhead pieces (static render — interactive Rnd wrappers come via renderOverlay) */}
      {useFreeLetterhead && b.logoUrl && b.logoBox && (
        <img src={b.logoUrl} alt="" crossOrigin="anonymous"
          style={{ position: "absolute", left: b.logoBox.x, top: b.logoBox.y, width: b.logoBox.width, height: b.logoBox.height, objectFit: "contain", zIndex: 2 }} />
      )}
      {useFreeLetterhead && b.headerText && b.headerBox && (
        <div style={{
          position: "absolute", left: b.headerBox.x, top: b.headerBox.y, width: b.headerBox.width, height: b.headerBox.height, zIndex: 2,
          fontFamily: b.headerBox.fontFamily, fontSize: b.headerBox.fontSize ?? 22, color: b.headerBox.color ?? palette.primary,
          fontWeight: b.headerBox.bold ? 700 : 400, fontStyle: b.headerBox.italic ? "italic" : "normal",
          textDecoration: b.headerBox.underline ? "underline" : undefined, textAlign: b.headerBox.align ?? "left",
          whiteSpace: "pre-wrap", wordBreak: "break-word",
        }}>{b.headerText}</div>
      )}
      {useFreeLetterhead && template.letterheadFooterText && b.footerBox && (
        <div style={{
          position: "absolute", left: b.footerBox.x, top: b.footerBox.y, width: b.footerBox.width, height: b.footerBox.height, zIndex: 2,
          fontFamily: b.footerBox.fontFamily, fontSize: b.footerBox.fontSize ?? 11, color: b.footerBox.color ?? palette.accent,
          fontWeight: b.footerBox.bold ? 700 : 400, fontStyle: b.footerBox.italic ? "italic" : "normal",
          textDecoration: b.footerBox.underline ? "underline" : undefined, textAlign: b.footerBox.align ?? "left",
          whiteSpace: "pre-wrap", wordBreak: "break-word",
        }}>{template.letterheadFooterText}</div>
      )}

      {/* Free-positioned tables (static render — interactive Rnd wrappers come via renderOverlay) */}
      {freeCards.map(card => (
        <div key={card.id} style={{ position: "absolute", left: card.x ?? 0, top: card.y ?? 0, width: card.width ?? 400, zIndex: 3 }}>
          {renderTableBlock(card)}
        </div>
      ))}

      <div
        ref={contentRef}
        style={{
          position: "relative",
          zIndex: 1,
          paddingTop: marginTop,
          paddingRight: marginRight,
          paddingBottom: marginBottom,
          paddingLeft: marginLeft,
        }}
      >
        {!useFreeLetterhead && (
          <>
            <div className="flex items-center gap-3" style={{ borderBottom: `2px solid ${palette.primary}`, paddingBottom: 8 }}>
              {template.branding.logoUrl && (
                <img src={template.branding.logoUrl} alt="" style={{ height: 56 }} crossOrigin="anonymous" />
              )}
              <div style={{ color: palette.primary, fontWeight: 700, fontSize: 18 }}>{template.branding.headerText}</div>
            </div>
            {template.letterheadFooterText && (
              <div style={{ fontSize: 11, color: palette.accent, marginTop: 4, marginBottom: 12 }}>{template.letterheadFooterText}</div>
            )}
          </>
        )}

        <div
          className="space-y-3 mt-3"
          onDragOver={editable && onCardReorder ? (e) => { if (dragCardId) e.preventDefault(); } : undefined}
          onDrop={editable && onCardReorder ? (e) => {
            if (!dragCardId) return;
            e.preventDefault();
            if (e.target === e.currentTarget) onCardReorder(dragCardId, null);
          } : undefined}
        >
          {flowCards.map(card => renderTableBlock(card))}
        </div>

        {!renderOverlay && (template.freeElements ?? []).map(el => <FreeEl key={el.id} el={el} />)}
      </div>


      {/* Page-break dashed lines */}
      {showPageBreaks && pageCount > 1 && Array.from({ length: pageCount - 1 }, (_, i) => (
        <div
          key={`pb-${i}`}
          aria-hidden
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: pageDims.height * (i + 1),
            borderTop: "2px dashed hsl(var(--primary) / 0.55)",
            zIndex: 50,
            pointerEvents: "none",
          }}
        >
          <span
            style={{
              position: "absolute",
              right: 8,
              top: -10,
              background: "hsl(var(--primary))",
              color: "#fff",
              fontSize: 10,
              padding: "1px 6px",
              borderRadius: 4,
              fontWeight: 600,
            }}
          >
            Page {i + 2}
          </span>
        </div>
      ))}

      {renderOverlay && renderOverlay(pageDims)}
    </div>
  );
});
