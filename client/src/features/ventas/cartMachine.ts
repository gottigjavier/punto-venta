/**
 * Pure transition functions for the POS cart state machine.
 *
 * These functions receive input args and return the next state snapshot.
 * They do NOT call React hooks, setState, or any side-effect.
 */

export type CartMode = "editing" | "confirmed";

/**
 * A cart line needs only these two fields to be counted toward the
 * "items" counter. Kept structural so it works with the local `CartItem`
 * type in VentasPage without a circular import.
 */
export interface CountableCartLine {
  cantidad: number;
  unidad_medida: string;
}

/**
 * Units of measure that represent WEIGHT / VOLUME (granel). A product sold
 * this way contributes exactly 1 item to the counter, regardless of the
 * quantity entered (e.g. 1.25 kg → 1 item).
 *
 * Source of truth: the backend `UnidadMedida` enum
 * ('unidad' | 'kg' | 'g' | 'l' | 'ml'). Everything that is NOT 'unidad'
 * is weight/volume.
 */
const WEIGHT_VOLUME_UNITS = new Set(["kg", "g", "l", "ml"]);

/**
 * Count how many items are in the cart, applying the POS rule:
 *  - UNIT product (unidad)   → contributes `cantidad` (3 unidades → 3 items)
 *  - WEIGHT/VOLUME product   → contributes 1 per cart line (1.25 kg → 1 item)
 */
export function countCartItems(lines: CountableCartLine[]): number {
  return lines.reduce((sum, line) => {
    const isUnit = line.unidad_medida === "unidad";
    return sum + (isUnit ? line.cantidad : 1);
  }, 0);
}

/**
 * A cart line needs only these three fields to be reconciled against fresh
 * stock. Kept structural so it works with the local `CartItem` type in
 * VentasPage without a circular import.
 */
export interface ReconcileLine {
  producto_id: string;
  cantidad: number;
  stock_disponible: number;
}

/**
 * Reconcile cart lines against a server-fresh stock map.
 *
 * Used after a sale confirmation fails with STOCK_INSUFFICIENT: another user
 * closed a sale first, so the stock the cart was built against is stale and
 * some `cantidad` values may exceed what actually remains. For every line
 * whose product exists in the fresh map:
 *  - `stock_disponible` is updated to the fresh value;
 *  - `cantidad` is clamped to `min(cantidad, stock)` (never negative);
 *  - lines whose quantity drops to 0 are removed (that stock is gone).
 * Lines for products absent from the map are preserved untouched.
 */
export function reconcileCartWithStock<L extends ReconcileLine>(
  lines: L[],
  freshStock: Map<string, number>,
): L[] {
  return lines
    .map((line) => {
      const stock = freshStock.get(line.producto_id);
      if (stock === undefined) return line;
      const clamped = Math.min(line.cantidad, Math.max(0, stock));
      return clamped <= 0
        ? null
        : { ...line, cantidad: clamped, stock_disponible: stock };
    })
    .filter((line): line is L => line !== null);
}

/**
 * Whether the "Confirmar Venta" action must be blocked.
 *
 * The POS blocks confirmation while the operator still has an unacknowledged
 * warning visible (a stock-insufficiency message shown in the cart footer): a
 * distracted user could confirm a sale without noticing that the quantities
 * changed (e.g. after another user consumed stock first). Closing the warning
 * message re-enables the action.
 */
export function shouldBlockConfirm(args: {
  cartLength: number;
  cartMode: CartMode;
  submitting: boolean;
  pendingError: boolean;
}): boolean {
  return (
    args.submitting ||
    args.cartLength === 0 ||
    args.cartMode === "confirmed" ||
    args.pendingError
  );
}

export type SaleResult = {
  type: "success" | "error";
  message: string;
  details?: string;
} | null;

/**
 * After a successful sale confirmation: freeze the cart (mode → confirmed).
 * The cart items are NOT cleared — they stay visible and disabled.
 */
export function onConfirmSuccess(saleResult: SaleResult): {
  cartMode: CartMode;
  saleResult: SaleResult;
} {
  return { cartMode: "confirmed", saleResult };
}

/**
 * After a failed sale confirmation: keep editing mode so the user can retry.
 * Cart items are preserved.
 */
export function onConfirmError(saleResult: SaleResult): {
  cartMode: CartMode;
  saleResult: SaleResult;
} {
  return { cartMode: "editing", saleResult };
}

/**
 * Clear the cart and reset to a clean editing state.
 */
export function onClearCart(): {
  cartMode: CartMode;
  saleResult: null;
  searchError: string;
} {
  return { cartMode: "editing", saleResult: null, searchError: "" };
}

/**
 * When the user adds a product while the cart is in 'confirmed' mode:
 * discard the previous sale, switch to editing, clear saleResult,
 * and surface any stock warning as an error saleResult (shown in the
 * cart footer). The searchError channel is reserved for search errors.
 */
export function onAddWhenConfirmed(stockWarning: string | null): {
  cartMode: CartMode;
  saleResult: SaleResult;
} {
  return {
    cartMode: "editing",
    saleResult: stockWarning ? { type: "error", message: stockWarning } : null,
  };
}
