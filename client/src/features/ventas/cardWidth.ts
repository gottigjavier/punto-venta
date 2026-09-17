import type { ProductSearchResult, UltimaVenta } from "./types";

// ─── Card width helpers ──────────────────────────────────────────────────
const CARD_FONT = "500 14px system-ui, -apple-system, sans-serif";
const CARD_FONT_MONO = "12px ui-monospace, SFMono-Regular, monospace";
const CARD_FONT_XS = "12px system-ui, -apple-system, sans-serif";
const CARD_FONT_XXS = "10px system-ui, -apple-system, sans-serif";

// Fixed chrome inside the card (padding + gaps + price column + icon)
const CARD_PADDING_X = 24; // px-3 * 2
const CARD_GAP_X = 8; // gap-2
const PRICE_COL_WIDTH = 80; // approximate price + button column
const CARD_BORDER = 2; // border
const CARD_ICON = 24; // leading icon (Package)

// QC2: a single module-level canvas, created lazily on first use and reused by
// every measureTextWidth call. Before, each call created a new canvas via
// `document.createElement` — with large catalogs and repeated renders that
// meant needless allocation and GC pressure on every width computation.
// `undefined` = not initialized yet; `null` = 2d context unavailable.
let measureCtx: CanvasRenderingContext2D | null | undefined;

function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (measureCtx === undefined) {
    const canvas = document.createElement("canvas");
    measureCtx = canvas.getContext("2d");
  }
  return measureCtx;
}

function measureTextWidth(text: string, font: string): number {
  const ctx = getMeasureCtx();
  if (!ctx) return text.length * 8;
  ctx.font = font;
  return ctx.measureText(text).width;
}

export function unitLabel(unit: string | null | undefined): string {
  if (!unit) return "";
  return unit === "unidad" ? "U" : unit;
}

export function computeMinCardWidth(
  products: ProductSearchResult[],
  lastQtyMap: Map<string, number>,
  ultimasVentasMap: Map<string, UltimaVenta>,
): number {
  if (products.length === 0) return 180;
  let maxNamePx = 0;
  let maxCodePx = 0;
  let maxMetaPx = 0;
  for (const p of products) {
    const namePx = measureTextWidth(p.nombre, CARD_FONT);
    if (namePx > maxNamePx) maxNamePx = namePx;
    const codePx = measureTextWidth(p.codigo || "", CARD_FONT_MONO);
    if (codePx > maxCodePx) maxCodePx = codePx;
    const stockPx = measureTextWidth(
      `Stock: ${p.stock_actual} ${unitLabel(p.unidad_medida)}`,
      CARD_FONT_XS,
    );
    if (stockPx > maxMetaPx) maxMetaPx = stockPx;
    const ultimaCantidad = ultimasVentasMap.get(p.id)?.ultima_cantidad ?? 0;
    const ventaPx = measureTextWidth(
      `Última venta: ${ultimaCantidad} ${unitLabel(p.unidad_medida)}`,
      CARD_FONT_XXS,
    );
    if (ventaPx > maxMetaPx) maxMetaPx = ventaPx;
    const lastQty = lastQtyMap.get(p.id) ?? 1;
    const predPx = measureTextWidth(
      `Cant predeterminada: ${lastQty} ${unitLabel(p.unidad_medida)}`,
      CARD_FONT_XXS,
    );
    if (predPx > maxMetaPx) maxMetaPx = predPx;
  }
  const contentWidth = CARD_ICON + CARD_GAP_X + Math.max(maxNamePx, maxCodePx);
  const innerWidth = Math.max(contentWidth, maxMetaPx) + PRICE_COL_WIDTH;
  return Math.max(Math.ceil(innerWidth + CARD_PADDING_X + CARD_BORDER), 180);
}