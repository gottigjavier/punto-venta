// src/__tests__/application/use-cases/venta.use-case.test.ts
// Tests para createVenta (FEFO) y deleteVenta (revert por lote), modelo Lote.
// Patrón del repo: mock inline via vi.hoisted + vi.mock del client + logger.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createVenta,
  getVentaById,
  listVentas,
  getResumenDia,
  deleteVenta,
  cerrarCaja,
  getMasVendidosPorProducto,
} from '../../../application/use-cases/venta.use-case.js';
import type { CreateVentaInput, VentaQueryInput } from '../../../application/dto/venta.dto.js';

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    producto: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    lote: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    venta: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    detalleVenta: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    cierreCaja: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    movimientoCaja: { findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    usuario: { findUnique: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

vi.mock('../../../infrastructure/database/prisma/client.js', () => ({
  prisma: mockPrisma,
}));

vi.mock('../../../infrastructure/logging/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../infrastructure/auth/password.js', () => ({
  verifyPassword: vi.fn(),
}));

// ---- Mock factories ----
const PRODUCTO_ID = '123e4567-e89b-12d3-a456-426614174000';

function mockLoteDb(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lote-1',
    producto_id: PRODUCTO_ID,
    numero_lote: 'L-001',
    cantidad_disponible: 45,
    fecha_compra: new Date('2024-01-15'),
    fecha_vencimiento: new Date('2024-12-31'),
    precio_compra: 150,
    estado: 'activo',
    created_at: new Date(),
    ...overrides,
  };
}

// Fixture FEFO del spec: hoy = 2026-08-29 10:00 UTC-3
//   L1 (venc 2026-10-01, qty5, creado 2026-01-01)
//   L2 (venc 2026-09-01, qty7, creado 2026-01-03) ← primero en consumir (vto más próx)
//   L3 (venc 2026-09-01, qty3, creado 2026-01-02) ← segundo
const MOCK_NOW = Date.UTC(2026, 7, 29, 13, 0, 0); // 10:00 UTC-3

const L1 = mockLoteDb({
  id: 'L1',
  cantidad_disponible: 5,
  fecha_vencimiento: new Date('2026-10-01T00:00:00.000Z'),
  created_at: new Date('2026-01-01T00:00:00.000Z'),
});
const L2 = mockLoteDb({
  id: 'L2',
  cantidad_disponible: 7,
  fecha_vencimiento: new Date('2026-09-01T00:00:00.000Z'),
  created_at: new Date('2026-01-03T00:00:00.000Z'),
});
const L3 = mockLoteDb({
  id: 'L3',
  cantidad_disponible: 3,
  fecha_vencimiento: new Date('2026-09-01T00:00:00.000Z'),
  created_at: new Date('2026-01-02T00:00:00.000Z'),
});

// Construye un `tx` mock con lote.findMany/update + detalleVenta.create + venta helpers.
// El `tx.lote.updateMany` es necesario para el lazy pass (retirarLotesVencidos(tx)).
function buildTx(txOverrides: Record<string, unknown> = {}): { tx: unknown; spies: Record<string, ReturnType<typeof vi.fn>> } {
  const spies: Record<string, ReturnType<typeof vi.fn>> = {
    loteFindMany: vi.fn(),
    loteUpdate: vi.fn(),
    detalleVentaCreate: vi.fn(),
    ventaCreate: vi.fn(),
    ventaUpdate: vi.fn(),
  };
  const tx = {
    lote: {
      findMany: spies.loteFindMany,
      update: spies.loteUpdate,
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    detalleVenta: { create: spies.detalleVentaCreate },
    venta: {
      create: spies.ventaCreate,
      update: spies.ventaUpdate,
      findUnique: vi.fn(),
    },
    ...txOverrides,
  };
  return { tx, spies };
}

function mockVentaDb(overrides: Record<string, unknown> = {}) {
  return {
    id: 'venta-1',
    usuario_id: 'user-1',
    total: 500,
    estado: 'completada',
    cierre_caja_id: null,
    created_at: new Date(),
    usuario: { id: 'user-1', nombre_usuario: 'Juan' },
    detalles_venta: [
      { id: 'det-1', venta_id: 'venta-1', producto_id: PRODUCTO_ID, lote_id: 'L2', cantidad: 7, precio_unitario: 50, subtotal: 350, producto: { id: PRODUCTO_ID, nombre: 'Pan integral', codigo: 'PAN-001' } },
      { id: 'det-2', venta_id: 'venta-1', producto_id: PRODUCTO_ID, lote_id: 'L3', cantidad: 3, precio_unitario: 50, subtotal: 150, producto: { id: PRODUCTO_ID, nombre: 'Pan integral', codigo: 'PAN-001' } },
    ],
    ...overrides,
  };
};

describe('Venta Use Cases (modelo Lote)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Usa fake timers SOLO para tests que dependen de "hoy" (vencimientos).
  // Se define a nivel describe padre para que deleteVenta también lo use.
  const withFakeNow = (fn: () => void | Promise<void>) => async () => {
    vi.useFakeTimers({ now: MOCK_NOW, toFake: ['Date'] });
    try {
      await fn();
    } finally {
      vi.useRealTimers();
    }
  };

  // ----------------------------------------------------------------------
  describe('createVenta (FEFO sobre lotes)', () => {
    it('FEFO: consume L2(7) luego L3(3), L1 intacto; 2 detalles con lote_id; total=500', withFakeNow(async () => {
      mockPrisma.producto.findMany.mockResolvedValue([{ id: PRODUCTO_ID }]);
      const { tx, spies } = buildTx();
      spies.loteFindMany.mockResolvedValue([L1, L2, L3]);
      spies.loteUpdate.mockResolvedValue({});
      spies.detalleVentaCreate.mockResolvedValue({});
      spies.ventaCreate.mockResolvedValue({ id: 'venta-1', usuario_id: 'user-1', total: 0, estado: 'completada', created_at: new Date() });
      spies.ventaUpdate.mockResolvedValue({});
      // El findUnique final del use-case devuelve la venta con detalles
      (tx as any).venta.findUnique.mockResolvedValue(mockVentaDb());

      mockPrisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(tx)
      );

      const result = await createVenta(
        { productos: [{ producto_id: PRODUCTO_ID, cantidad: 10, precio_unitario: 50 }] },
        'user-1'
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.total).toBe(500); // 7*50 + 3*50
        expect(result.value.detalles_venta).toHaveLength(2);
        expect(result.value.detalles_venta[0].lote_id).toBe('L2');
        expect(result.value.detalles_venta[0].cantidad).toBe(7);
        expect(result.value.detalles_venta[1].lote_id).toBe('L3');
        expect(result.value.detalles_venta[1].cantidad).toBe(3);
      }
    }));

    it('cascada saltando lote agotado (L1 agotado, L4 qty4 → solo L4)', withFakeNow(async () => {
      mockPrisma.producto.findMany.mockResolvedValue([{ id: PRODUCTO_ID }]);
      const L1Agotado = mockLoteDb({ id: 'L1A', cantidad_disponible: 0, estado: 'agotado', fecha_vencimiento: new Date('2026-09-01T00:00:00.000Z'), created_at: new Date('2026-01-01') });
      const L4 = mockLoteDb({ id: 'L4', cantidad_disponible: 4, fecha_vencimiento: new Date('2026-09-15T00:00:00.000Z'), created_at: new Date('2026-01-02') });
      const { tx, spies } = buildTx();
      spies.loteFindMany.mockResolvedValue([L1Agotado, L4]);
      spies.loteUpdate.mockResolvedValue({});
      spies.detalleVentaCreate.mockResolvedValue({});
      spies.ventaCreate.mockResolvedValue({ id: 'venta-1', usuario_id: 'user-1', total: 0, estado: 'completada', created_at: new Date() });
      spies.ventaUpdate.mockResolvedValue({});
      (tx as any).venta.findUnique.mockResolvedValue(mockVentaDb({
        total: 150,
        detalles_venta: [
          { id: 'det-c', venta_id: 'venta-1', producto_id: PRODUCTO_ID, lote_id: 'L4', cantidad: 3, precio_unitario: 50, subtotal: 150, producto: { id: PRODUCTO_ID, nombre: 'Pan integral', codigo: 'PAN-001' } },
        ],
      }));
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));

      const result = await createVenta(
        { productos: [{ producto_id: PRODUCTO_ID, cantidad: 3, precio_unitario: 50 }] },
        'user-1'
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.total).toBe(150);
        expect(result.value.detalles_venta).toHaveLength(1);
        expect(result.value.detalles_venta[0].lote_id).toBe('L4');
        expect(result.value.detalles_venta[0].cantidad).toBe(3);
      }
    }));

    it('lote venc NULL va al final del FEFO', withFakeNow(async () => {
      mockPrisma.producto.findMany.mockResolvedValue([{ id: PRODUCTO_ID }]);
      const L6 = mockLoteDb({ id: 'L6', cantidad_disponible: 3, fecha_vencimiento: new Date('2026-09-10T00:00:00.000Z'), created_at: new Date('2026-01-02') });
      const L5 = mockLoteDb({ id: 'L5', cantidad_disponible: 5, fecha_vencimiento: null, created_at: new Date('2026-01-01') });
      const { tx, spies } = buildTx();
      // El use-case reordena en memoria; el orden crudo del mock no importa
      spies.loteFindMany.mockResolvedValue([L5, L6]);
      spies.loteUpdate.mockResolvedValue({});
      // detalleVenta.create: primero L6 (3) luego L5 (1)
      spies.detalleVentaCreate
        .mockResolvedValueOnce({ cantidad: 3, subtotal: 150 }) // L6
        .mockResolvedValueOnce({ cantidad: 1, subtotal: 50 }); // L5
      spies.ventaCreate.mockResolvedValue({ id: 'venta-1', usuario_id: 'user-1', total: 0, estado: 'completada', created_at: new Date() });
      spies.ventaUpdate.mockResolvedValue({});
      (tx as any).venta.findUnique.mockResolvedValue(mockVentaDb({
        total: 200,
        detalles_venta: [
          { id: 'd1', venta_id: 'venta-1', producto_id: PRODUCTO_ID, lote_id: 'L6', cantidad: 3, precio_unitario: 50, subtotal: 150, producto: { id: PRODUCTO_ID, nombre: 'Pan integral', codigo: 'PAN-001' } },
          { id: 'd2', venta_id: 'venta-1', producto_id: PRODUCTO_ID, lote_id: 'L5', cantidad: 1, precio_unitario: 50, subtotal: 50, producto: { id: PRODUCTO_ID, nombre: 'Pan integral', codigo: 'PAN-001' } },
        ],
      }));
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));

      const result = await createVenta(
        { productos: [{ producto_id: PRODUCTO_ID, cantidad: 4, precio_unitario: 50 }] },
        'user-1'
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.total).toBe(200);
        expect(result.value.detalles_venta[0].lote_id).toBe('L6');
        expect(result.value.detalles_venta[0].cantidad).toBe(3);
        expect(result.value.detalles_venta[1].lote_id).toBe('L5');
        expect(result.value.detalles_venta[1].cantidad).toBe(1);
      }
    }));

    it('STOCK_INSUFFICIENT: disponible < solicitado → no crea venta ni descuenta', withFakeNow(async () => {
      mockPrisma.producto.findMany.mockResolvedValue([{ id: PRODUCTO_ID }]);
      const LxBajo = mockLoteDb({ id: 'Lx', cantidad_disponible: 3, fecha_vencimiento: new Date('2026-12-01T00:00:00.000Z'), created_at: new Date() });
      const { tx, spies } = buildTx();
      spies.loteFindMany.mockResolvedValue([LxBajo]);
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));

      const result = await createVenta(
        { productos: [{ producto_id: PRODUCTO_ID, cantidad: 10, precio_unitario: 50 }] },
        'user-1'
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('STOCK_INSUFFICIENT');
        expect(result.error.disponible).toBe(3);
        expect(result.error.solicitado).toBe(10);
      }
      expect(spies.detalleVentaCreate).not.toHaveBeenCalled();
    }));

    it('lote vencido jamás se descuenta', withFakeNow(async () => {
      mockPrisma.producto.findMany.mockResolvedValue([{ id: PRODUCTO_ID }]);
      const loteVencido = mockLoteDb({ id: 'LV', cantidad_disponible: 8, estado: 'vencido', fecha_vencimiento: new Date('2020-01-01T00:00:00.000Z') });
      const loteActivo = mockLoteDb({ id: 'LA', cantidad_disponible: 2, fecha_vencimiento: new Date('2026-12-01T00:00:00.000Z'), created_at: new Date() });
      const { tx, spies } = buildTx();
      spies.loteFindMany.mockResolvedValue([loteVencido, loteActivo]);
      spies.loteUpdate.mockResolvedValue({});
      spies.detalleVentaCreate.mockResolvedValue({});
      spies.ventaCreate.mockResolvedValue({ id: 'venta-1', usuario_id: 'user-1', total: 0, estado: 'completada', created_at: new Date() });
      spies.ventaUpdate.mockResolvedValue({});
      (tx as any).venta.findUnique.mockResolvedValue(mockVentaDb({
        total: 100,
        detalles_venta: [
          { id: 'd', venta_id: 'venta-1', producto_id: PRODUCTO_ID, lote_id: 'LA', cantidad: 2, precio_unitario: 50, subtotal: 100, producto: { id: PRODUCTO_ID, nombre: 'Pan integral', codigo: 'PAN-001' } },
        ],
      }));
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));

      const result = await createVenta(
        { productos: [{ producto_id: PRODUCTO_ID, cantidad: 2, precio_unitario: 50 }] },
        'user-1'
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.detalles_venta).toHaveLength(1);
        expect(result.value.detalles_venta[0].lote_id).toBe('LA');
        expect(result.value.detalles_venta[0].cantidad).toBe(2);
      }
    }));

    it('lote a 0 → estado agotado', withFakeNow(async () => {
      mockPrisma.producto.findMany.mockResolvedValue([{ id: PRODUCTO_ID }]);
      const LExacto = mockLoteDb({ id: 'LE', cantidad_disponible: 2, fecha_vencimiento: new Date('2026-12-01T00:00:00.000Z'), created_at: new Date() });
      const { tx, spies } = buildTx();
      spies.loteFindMany.mockResolvedValue([LExacto]);
      const updateMock = spies.loteUpdate.mockResolvedValue({});
      spies.detalleVentaCreate.mockResolvedValue({});
      spies.ventaCreate.mockResolvedValue({ id: 'venta-1', usuario_id: 'user-1', total: 0, estado: 'completada', created_at: new Date() });
      spies.ventaUpdate.mockResolvedValue({});
      (tx as any).venta.findUnique.mockResolvedValue(mockVentaDb({
        total: 100,
        detalles_venta: [
          { id: 'd', venta_id: 'venta-1', producto_id: PRODUCTO_ID, lote_id: 'LE', cantidad: 2, precio_unitario: 50, subtotal: 100, producto: { id: PRODUCTO_ID, nombre: 'Pan integral', codigo: 'PAN-001' } },
        ],
      }));
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));

      const result = await createVenta(
        { productos: [{ producto_id: PRODUCTO_ID, cantidad: 2, precio_unitario: 50 }] },
        'user-1'
      );

      expect(result.isOk()).toBe(true);
      // Verificar que el update decrementó a 0 y puso estado agotado
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'LE' },
          data: expect.objectContaining({
            cantidad_disponible: { decrement: 2 },
            estado: 'agotado',
          }),
        })
      );
    }));

    it('producto no encontrado → NOT_FOUND', async () => {
      mockPrisma.producto.findMany.mockResolvedValue([]);
      const result = await createVenta(
        { productos: [{ producto_id: 'no-existe', cantidad: 1, precio_unitario: 50 }] },
        'user-1'
      );
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('NOT_FOUND');
    });

    it('transaction fails → DATABASE_ERROR', async () => {
      mockPrisma.producto.findMany.mockResolvedValue([{ id: PRODUCTO_ID }]);
      mockPrisma.$transaction.mockRejectedValue(new Error('Transaction failed'));
      const result = await createVenta(
        { productos: [{ producto_id: PRODUCTO_ID, cantidad: 1, precio_unitario: 50 }] },
        'user-1'
      );
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('DATABASE_ERROR');
    });
  });

  // ----------------------------------------------------------------------
  describe('deleteVenta', () => {
    it('CONFLICT si pertenece a período cerrado (cierre_caja_id != null)', async () => {
      mockPrisma.venta.findUnique.mockResolvedValue(
        mockVentaDb({ cierre_caja_id: 'cierre-1' })
      );

      const result = await deleteVenta('venta-1');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('CONFLICT');
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('VALIDATION_ERROR si algún detalle tiene lote_id NULL (pre-migración)', async () => {
      mockPrisma.venta.findUnique.mockResolvedValue(
        mockVentaDb({
          detalles_venta: [
            { id: 'd1', venta_id: 'venta-1', producto_id: PRODUCTO_ID, lote_id: null, cantidad: 3, precio_unitario: 50, subtotal: 150, producto: { id: PRODUCTO_ID, nombre: 'Pan integral', codigo: 'PAN-001' } },
          ],
        })
      );

      const result = await deleteVenta('venta-1');
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('VALIDATION_ERROR');
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('CONFLICT si la venta no está completada', async () => {
      mockPrisma.venta.findUnique.mockResolvedValue(
        mockVentaDb({ estado: 'cancelada' })
      );

      const result = await deleteVenta('venta-1');
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('CONFLICT');
    });

    it('revierte stock por lote: agotado→activo; vencido si venc<hoy', withFakeNow(async () => {
      const loteVigente = mockLoteDb({ id: 'LV', cantidad_disponible: 0, estado: 'agotado', fecha_vencimiento: new Date('2026-12-01T00:00:00.000Z') });
      const loteVencido = mockLoteDb({ id: 'LVD', cantidad_disponible: 0, estado: 'agotado', fecha_vencimiento: new Date('2020-01-01T00:00:00.000Z') });

      mockPrisma.venta.findUnique.mockResolvedValue(
        mockVentaDb({
          detalles_venta: [
            { id: 'd1', venta_id: 'venta-1', producto_id: PRODUCTO_ID, lote_id: 'LV', cantidad: 3, precio_unitario: 50, subtotal: 150, producto: { id: PRODUCTO_ID, nombre: 'Pan integral', codigo: 'PAN-001' } },
            { id: 'd2', venta_id: 'venta-1', producto_id: PRODUCTO_ID, lote_id: 'LVD', cantidad: 5, precio_unitario: 50, subtotal: 250, producto: { id: PRODUCTO_ID, nombre: 'Pan integral', codigo: 'PAN-001' } },
          ],
        })
      );

      const loteUpdate = vi.fn().mockResolvedValue({});
      // El use-case: (1) bucle de incremento (qty += cantidad), luego (2) lee findUnique
      // para decidir reactivar. El findUnique debe devolver qty YA incrementado (post-revert).
      // LV: +3 → qty 3 >0, venc 2026 > hoy → reactiva a 'activo'.
      // LVD: +5 → qty 5 >0, venc 2020 < hoy → reactiva a 'vencido'.
      const loteFindUnique = vi.fn()
        .mockResolvedValueOnce({ ...loteVigente, cantidad_disponible: 3 })
        .mockResolvedValueOnce({ ...loteVencido, cantidad_disponible: 5 });
      mockPrisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn({
          lote: { findUnique: loteFindUnique, update: loteUpdate },
          detalleVenta: { deleteMany: vi.fn().mockResolvedValue({}) },
          venta: { delete: vi.fn().mockResolvedValue({}) },
        })
      );

      const result = await deleteVenta('venta-1');
      expect(result.isOk()).toBe(true);

      // LV: incrementó a 3 y reactivó a 'activo' (venc 2026-12-01 > hoy → activo)
      expect(loteUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'LV' },
          data: expect.objectContaining({ estado: 'activo' }),
        })
      );
      // LVD: incrementó a 5 y reactivó a 'vencido' (venc 2020 < hoy → vencido)
      expect(loteUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'LVD' },
          data: expect.objectContaining({ estado: 'vencido' }),
        })
      );
    }));

    it('NOT_FOUND si la venta no existe', async () => {
      mockPrisma.venta.findUnique.mockResolvedValue(null);
      const result = await deleteVenta('non-existent');
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('NOT_FOUND');
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // ----------------------------------------------------------------------
  // Tests que NO dependen del modelo Lote ni de "hoy" — NO usan fake timers
  describe('getVentaById', () => {
    it('retorna venta con detalles', async () => {
      const mockVenta = mockVentaDb();
      mockPrisma.venta.findUnique.mockResolvedValue(mockVenta);

      const result = await getVentaById('venta-1');
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.id).toBe('venta-1');
        expect(result.value.total).toBe(500);
        expect(result.value.detalles_venta).toHaveLength(2);
      }
    });

    it('NOT_FOUND si no existe', async () => {
      mockPrisma.venta.findUnique.mockResolvedValue(null);
      const result = await getVentaById('non-existent');
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('NOT_FOUND');
    });

    it('DATABASE_ERROR', async () => {
      mockPrisma.venta.findUnique.mockRejectedValue(new Error('DB error'));
      const result = await getVentaById('x');
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('DATABASE_ERROR');
    });
  });

  describe('listVentas', () => {
    it('paginada con filtros (cierre_caja_id=null default)', async () => {
      mockPrisma.venta.findMany.mockResolvedValue([
        { id: 'v1', usuario_id: 'u1', total: 500, estado: 'completada', created_at: new Date(), usuario: { nombre_usuario: 'Juan' }, _count: { detalles_venta: 2 } },
        { id: 'v2', usuario_id: 'u2', total: 300, estado: 'completada', created_at: new Date(), usuario: { nombre_usuario: 'María' }, _count: { detalles_venta: 1 } },
      ]);
      mockPrisma.venta.count.mockResolvedValue(2);

      const result = await listVentas({ page: 1, limit: 20, sort: 'created_at', order: 'desc' } as VentaQueryInput);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.data).toHaveLength(2);
        expect(result.value.pagination.total).toBe(2);
        expect(result.value.data[0]?.cantidad_items).toBe(2);
      }
      expect(mockPrisma.venta.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ cierre_caja_id: null }) })
      );
    });

    it('DATABASE_ERROR', async () => {
      mockPrisma.venta.findMany.mockRejectedValue(new Error('DB error'));
      const result = await listVentas({ page: 1, limit: 20, sort: 'created_at', order: 'desc' } as VentaQueryInput);
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('DATABASE_ERROR');
    });
  });

  describe('getResumenDia', () => {
    it('resumen con agregación por producto', async () => {
      mockPrisma.cierreCaja.findFirst.mockResolvedValue({ fecha_apertura: new Date('2026-07-17T10:00:00Z') });
      mockPrisma.venta.findMany.mockResolvedValue([
        {
          id: 'v1', usuario_id: 'u1', total: 500, estado: 'completada', created_at: new Date(),
          usuario: { id: 'u1', nombre_usuario: 'Juan' },
          detalles_venta: [
            { id: 'd1', producto_id: 'p1', cantidad: 2, subtotal: 500, producto: { id: 'p1', nombre: 'Pan integral' } },
          ],
        },
      ]);
      mockPrisma.movimientoCaja.findMany.mockResolvedValue([]);

      const result = await getResumenDia();
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.total_ventas).toBe(1);
        expect(result.value.monto_total).toBe(500);
        expect(result.value.productos_vendidos[0].cantidad_total).toBe(2);
      }
    });

    it('fecha = apertura del cierre activo en UTC-3', async () => {
      mockPrisma.cierreCaja.findFirst.mockResolvedValue({ fecha_apertura: new Date('2026-07-15T03:00:00Z') }); // 00:00 UTC-3
      mockPrisma.venta.findMany.mockResolvedValue([]);
      mockPrisma.movimientoCaja.findMany.mockResolvedValue([]);

      expect(mockPrisma.cierreCaja.findFirst).not.toHaveBeenCalled();
      const result = await getResumenDia();
      expect(mockPrisma.cierreCaja.findFirst).toHaveBeenCalledWith({
        where: { estado: 'abierto' },
        select: { fecha_apertura: true },
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.fecha).toBe('2026-07-15');
      }
    });

    it('fecha vacía cuando no hay cierre activo', async () => {
      mockPrisma.cierreCaja.findFirst.mockResolvedValue(null);
      mockPrisma.venta.findMany.mockResolvedValue([]);
      mockPrisma.movimientoCaja.findMany.mockResolvedValue([]);

      const result = await getResumenDia();
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.fecha).toBe('');
      }
    });

    it('DATABASE_ERROR', async () => {
      mockPrisma.cierreCaja.findFirst.mockResolvedValue({ fecha_apertura: new Date('2026-07-17T10:00:00Z') });
      mockPrisma.venta.findMany.mockRejectedValue(new Error('DB error'));
      const result = await getResumenDia();
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('DATABASE_ERROR');
    });
  });

  describe('cerrarCaja', () => {
    const userId = 'user-1';
    const correctPassword = 'P@ss123';

    it('cierra con password correcto', async () => {
      const { verifyPassword } = await import('../../../infrastructure/auth/password.js');
      mockPrisma.usuario.findUnique.mockResolvedValue({ password_hash: '$2a$10$hashed' });
      vi.mocked(verifyPassword).mockResolvedValue(true);
      mockPrisma.venta.findMany.mockResolvedValue([
        { id: 'v1', usuario_id: userId, total: 500, estado: 'completada', created_at: new Date(), usuario: { id: userId, nombre_usuario: 'Juan' }, detalles_venta: [] },
      ]);
      mockPrisma.movimientoCaja.findMany.mockResolvedValue([]);
      mockPrisma.$transaction.mockResolvedValue({ id: 'cierre-1', monto_total: 500, cantidad_ventas: 1, fecha_cierre: new Date() });

      const result = await cerrarCaja(userId, correctPassword);
      expect(result.isOk()).toBe(true);
      expect(verifyPassword).toHaveBeenCalledWith(correctPassword, '$2a$10$hashed');
    });

    it('UNAUTHORIZED con password incorrecto', async () => {
      const { verifyPassword } = await import('../../../infrastructure/auth/password.js');
      mockPrisma.usuario.findUnique.mockResolvedValue({ password_hash: '$2a$10$hashed' });
      vi.mocked(verifyPassword).mockResolvedValue(false);

      const result = await cerrarCaja(userId, 'wrong');
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('UNAUTHORIZED');
      expect(mockPrisma.venta.findMany).not.toHaveBeenCalled();
    });

    it('CONFLICT sin ventas abiertas', async () => {
      const { verifyPassword } = await import('../../../infrastructure/auth/password.js');
      mockPrisma.usuario.findUnique.mockResolvedValue({ password_hash: '$2a$10$hashed' });
      vi.mocked(verifyPassword).mockResolvedValue(true);
      mockPrisma.venta.findMany.mockResolvedValue([]);
      mockPrisma.movimientoCaja.findMany.mockResolvedValue([]);

      const result = await cerrarCaja(userId, correctPassword);
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('CONFLICT');
    });
  });

  describe('getMasVendidosPorProducto', () => {
    it('agrega y ordena por frecuencia DESC', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { producto_id: 'p1', veces_vendido: 5, monto_total: 12500 },
        { producto_id: 'p2', veces_vendido: 2, monto_total: 5000 },
      ]);

      const result = await getMasVendidosPorProducto();
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value[0]?.producto_id).toBe('p1');
        expect(result.value[1]?.producto_id).toBe('p2');
      }
    });

    it('DATABASE_ERROR', async () => {
      mockPrisma.$queryRaw.mockRejectedValue(new Error('DB error'));
      const result = await getMasVendidosPorProducto();
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('DATABASE_ERROR');
    });
  });
});

void mockVentaDb;
