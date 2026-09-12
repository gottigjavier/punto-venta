import { describe, it, expect } from 'vitest';
import {
  onConfirmSuccess,
  onConfirmError,
  onClearCart,
  onAddWhenConfirmed,
  countCartItems,
  reconcileCartWithStock,
  shouldBlockConfirm,
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
    it('returns editing mode and null saleResult when no warning', () => {
      const next = onAddWhenConfirmed(null);

      expect(next.cartMode).toBe('editing');
      expect(next.saleResult).toBeNull();
    });

    it('returns the stock warning as an error saleResult when provided', () => {
      const warning = 'Stock insuficiente para Aceite: se cargó el disponible (2 L) en lugar de la última venta (5 L).';
      const next = onAddWhenConfirmed(warning);

      expect(next.cartMode).toBe('editing');
      expect(next.saleResult).toEqual({ type: 'error', message: warning });
    });

    it('returns null saleResult when warning is empty string (not null)', () => {
      const next = onAddWhenConfirmed('');
      expect(next.saleResult).toBeNull();
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

      // 2. User adds a new product while confirmed with a stock warning
      //    → resets to editing and surfaces the warning in the cart footer
      const addResult = onAddWhenConfirmed('Stock bajo');
      cartMode = addResult.cartMode;
      saleResult = addResult.saleResult;

      expect(cartMode).toBe('editing');
      expect(saleResult).toEqual({ type: 'error', message: 'Stock bajo' });

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

describe('reconcileCartWithStock', () => {
  it('clamps cantidad to the fresh stock and updates stock_disponible', () => {
    const freshStock = new Map([['p1', 40]]);

    const result = reconcileCartWithStock(
      [
        {
          producto_id: 'p1',
          cantidad: 50,
          stock_disponible: 100,
          nombre: 'Aceite',
        },
      ],
      freshStock,
    );

    expect(result).toEqual([
      { producto_id: 'p1', cantidad: 40, stock_disponible: 40, nombre: 'Aceite' },
    ]);
  });

  it('keeps lines within stock but still refreshes stock_disponible', () => {
    const freshStock = new Map([['p1', 40]]);

    const result = reconcileCartWithStock(
      [{ producto_id: 'p1', cantidad: 25, stock_disponible: 100 }],
      freshStock,
    );

    expect(result).toEqual([{ producto_id: 'p1', cantidad: 25, stock_disponible: 40 }]);
  });

  it('removes lines whose fresh stock dropped to 0', () => {
    const freshStock = new Map([['p1', 0]]);

    const result = reconcileCartWithStock(
      [{ producto_id: 'p1', cantidad: 50, stock_disponible: 100 }],
      freshStock,
    );

    expect(result).toEqual([]);
  });

  it('preserves lines for products absent from the fresh map', () => {
    const freshStock = new Map([['p2', 3]]);

    const result = reconcileCartWithStock(
      [{ producto_id: 'p1', cantidad: 50, stock_disponible: 100 }],
      freshStock,
    );

    expect(result).toEqual([{ producto_id: 'p1', cantidad: 50, stock_disponible: 100 }]);
  });

  it('does not mutate the original lines array', () => {
    const lines = [{ producto_id: 'p1', cantidad: 50, stock_disponible: 100 }];
    const freshStock = new Map([['p1', 40]]);

    reconcileCartWithStock(lines, freshStock);

    expect(lines).toEqual([{ producto_id: 'p1', cantidad: 50, stock_disponible: 100 }]);
  });
});

describe('shouldBlockConfirm', () => {
  const base = {
    cartLength: 2,
    cartMode: 'editing' as CartMode,
    submitting: false,
    pendingError: false,
  };

  it('allows confirmation on a normal editable non-empty cart', () => {
    expect(shouldBlockConfirm(base)).toBe(false);
  });

  it('blocks while an error/warning message is pending', () => {
    expect(shouldBlockConfirm({ ...base, pendingError: true })).toBe(true);
  });

  it('blocks while submitting', () => {
    expect(shouldBlockConfirm({ ...base, submitting: true })).toBe(true);
  });

  it('blocks on an empty cart', () => {
    expect(shouldBlockConfirm({ ...base, cartLength: 0 })).toBe(true);
  });

  it('blocks on a confirmed (frozen) cart', () => {
    expect(shouldBlockConfirm({ ...base, cartMode: 'confirmed' })).toBe(true);
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
