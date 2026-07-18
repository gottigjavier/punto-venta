/**
 * Pure transition functions for the POS cart state machine.
 *
 * These functions receive input args and return the next state snapshot.
 * They do NOT call React hooks, setState, or any side-effect.
 */

export type CartMode = 'editing' | 'confirmed';

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
