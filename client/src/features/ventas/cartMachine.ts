/**
 * Pure transition functions for the POS cart state machine.
 *
 * These functions receive input args and return the next state snapshot.
 * They do NOT call React hooks, setState, or any side-effect.
 */

export type CartMode = 'editing' | 'confirmed';

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
const WEIGHT_VOLUME_UNITS = new Set(['kg', 'g', 'l', 'ml']);

/**
 * Count how many items are in the cart, applying the POS rule:
 *  - UNIT product (unidad)   → contributes `cantidad` (3 unidades → 3 items)
 *  - WEIGHT/VOLUME product   → contributes 1 per cart line (1.25 kg → 1 item)
 */
export function countCartItems(lines: CountableCartLine[]): number {
  return lines.reduce((sum, line) => {
    const isUnit = line.unidad_medida === 'unidad';
    return sum + (isUnit ? line.cantidad : 1);
  }, 0);
}

export type SaleResult =
  | { type: 'success' | 'error'; message: string; details?: string }
  | null;

/**
 * After a successful sale confirmation: freeze the cart (mode → confirmed).
 * The cart items are NOT cleared — they stay visible and disabled.
 */
export function onConfirmSuccess(
  saleResult: SaleResult,
): { cartMode: CartMode; saleResult: SaleResult } {
  return { cartMode: 'confirmed', saleResult };
}

/**
 * After a failed sale confirmation: keep editing mode so the user can retry.
 * Cart items are preserved.
 */
export function onConfirmError(
  saleResult: SaleResult,
): { cartMode: CartMode; saleResult: SaleResult } {
  return { cartMode: 'editing', saleResult };
}

/**
 * Clear the cart and reset to a clean editing state.
 */
export function onClearCart(): {
  cartMode: CartMode;
  saleResult: null;
  searchError: string;
} {
  return { cartMode: 'editing', saleResult: null, searchError: '' };
}

/**
 * When the user adds a product while the cart is in 'confirmed' mode:
 * discard the previous sale, switch to editing, clear saleResult,
 * and surface any stock warning as searchError.
 */
export function onAddWhenConfirmed(
  stockWarning: string | null,
): { cartMode: CartMode; saleResult: null; searchError: string } {
  return {
    cartMode: 'editing',
    saleResult: null,
    searchError: stockWarning ?? '',
  };
}
