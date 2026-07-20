import { describe, it, expect } from 'vitest';
import {
  onConfirmSuccess,
  onConfirmError,
  onClearCart,
  onAddWhenConfirmed,
  countCartItems,
  type CartMode,
  type SaleResult,
} from './cartMachine';

describe('cartMachine', () => {
  describe('onConfirmSuccess', () => {
    it('returns cartMode: confirmed and preserves the saleResult', () => {
      const saleResult: SaleResult = {
        type: 'success',
        message: 'Venta #abc12345 registrada correctamente',
        details: 'Total: $1500.00 | 3 items',
      };

      const next = onConfirmSuccess(saleResult);

      expect(next.cartMode).toBe('confirmed');
      expect(next.saleResult).toBe(saleResult);
    });

    it('preserves a null saleResult edge case', () => {
      const next = onConfirmSuccess(null);
      expect(next.cartMode).toBe('confirmed');
      expect(next.saleResult).toBeNull();
    });
  });

  describe('onConfirmError', () => {
    it('returns cartMode: editing and preserves the error saleResult', () => {
      const saleResult: SaleResult = {
        type: 'error',
        message: 'Stock insuficiente',
        details: 'Disponible: 2 | Solicitado: 5',
      };

      const next = onConfirmError(saleResult);

      expect(next.cartMode).toBe('editing');
      expect(next.saleResult).toBe(saleResult);
    });

    it('returns cartMode: editing for a generic error', () => {
      const saleResult: SaleResult = {
        type: 'error',
        message: 'Error al procesar la venta',
      };

      const next = onConfirmError(saleResult);

      expect(next.cartMode).toBe('editing');
      expect(next.saleResult).toEqual(saleResult);
    });
  });

  describe('onClearCart', () => {
    it('returns editing mode with null saleResult and empty searchError', () => {
      const next = onClearCart();

      expect(next.cartMode).toBe('editing');
      expect(next.saleResult).toBeNull();
      expect(next.searchError).toBe('');
    });
  });

  describe('onAddWhenConfirmed', () => {
    it('returns editing mode, null saleResult, and empty searchError when no warning', () => {
      const next = onAddWhenConfirmed(null);

      expect(next.cartMode).toBe('editing');
      expect(next.saleResult).toBeNull();
      expect(next.searchError).toBe('');
    });

    it('returns the stock warning as searchError when provided', () => {
      const warning = 'Stock insuficiente para Aceite: se cargó el disponible (2 L) en lugar de la última venta (5 L).';
      const next = onAddWhenConfirmed(warning);

      expect(next.cartMode).toBe('editing');
      expect(next.saleResult).toBeNull();
      expect(next.searchError).toBe(warning);
    });

    it('uses empty string when warning is empty string (not null)', () => {
      const next = onAddWhenConfirmed('');
      expect(next.searchError).toBe('');
    });
  });

  describe('full state machine flow', () => {
    it('editing → confirmSuccess → confirmed → addWhenConfirmed → editing → clearCart → editing', () => {
      // Start: editing mode
      let cartMode: CartMode = 'editing';
      let saleResult: SaleResult = null;
      let searchError = '';

      // 1. User confirms a sale successfully
      const confirmResult = onConfirmSuccess({
        type: 'success',
        message: 'Venta #12345678 registrada correctamente',
        details: 'Total: $2500.00 | 5 items',
      });
      cartMode = confirmResult.cartMode;
      saleResult = confirmResult.saleResult;

      expect(cartMode).toBe('confirmed');
      expect(saleResult).not.toBeNull();
      expect(saleResult!.type).toBe('success');

      // 2. User adds a new product while confirmed → resets to editing
      const addResult = onAddWhenConfirmed('Stock bajo');
      cartMode = addResult.cartMode;
      saleResult = addResult.saleResult;
      searchError = addResult.searchError;

      expect(cartMode).toBe('editing');
      expect(saleResult).toBeNull();
      expect(searchError).toBe('Stock bajo');

      // 3. User clears the cart → everything clean
      const clearResult = onClearCart();
      cartMode = clearResult.cartMode;
      saleResult = clearResult.saleResult;
      searchError = clearResult.searchError;

      expect(cartMode).toBe('editing');
      expect(saleResult).toBeNull();
      expect(searchError).toBe('');
    });

    it('editing → confirmError → editing (with error visible)', () => {
      let cartMode: CartMode = 'editing';

      const errorResult = onConfirmError({
        type: 'error',
        message: 'Stock insuficiente',
      });
      cartMode = errorResult.cartMode;

      // Mode stays editing — user can retry
      expect(cartMode).toBe('editing');
      expect(errorResult.saleResult!.type).toBe('error');
    });
  });
});

describe('countCartItems', () => {
  it('sums cantidad for unit products and 1 per line for weight/volume products', () => {
    const cart = [
      { cantidad: 3, unidad_medida: 'unidad' },
      { cantidad: 2, unidad_medida: 'unidad' },
      { cantidad: 1.25, unidad_medida: 'kg' },
    ];

    expect(countCartItems(cart)).toBe(6);
  });

  it('counts each weight line as 1 regardless of quantity (fractional or multiple)', () => {
    const cart = [
      { cantidad: 0.5, unidad_medida: 'kg' },
      { cantidad: 2.75, unidad_medida: 'l' },
      { cantidad: 1, unidad_medida: 'g' },
    ];

    expect(countCartItems(cart)).toBe(3);
  });

  it('returns 0 for an empty cart', () => {
    expect(countCartItems([])).toBe(0);
  });
});
