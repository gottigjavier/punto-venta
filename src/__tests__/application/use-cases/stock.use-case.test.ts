// src/__tests__/application/use-cases/stock.use-case.test.ts
// Tests para el modelo Lote (post split Producto/Lote).
// Patrón del repo: mock inline via vi.hoisted + vi.mock del client + logger.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loteIngreso,
  loteList,
  loteEdit,
  loteRetirar,
  loteDelete,
} from '../../../application/use-cases/stock.use-case.js';
import type { StockIngresoInput, StockQueryInput, EditarLoteInput } from '../../../application/dto/stock.dto.js';
import { toUTC3DateString } from '../../../application/use-cases/stock.use-case.js';

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    producto: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    lote: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    detalleVenta: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
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

// ---- Mock factories (shape RAW Prisma: lo que devuelve lote.findMany/include) ----

const PRODUCTO_ID = '123e4567-e89b-12d3-a456-426614174000';

function mockProductoDb(overrides: Record<string, unknown> = {}) {
  return {
    id: PRODUCTO_ID,
    nombre: 'Pan integral',
    codigo: 'PAN-001',
    cantidad_aviso: 0,
    precio_venta: 250,
    unidad_medida: 'unidad',
    activo: true,
    rubro_id: 'rubro-1',
    proveedor_id: 'prov-1',
    created_at: new Date(),
    updated_at: new Date(),
    rubro: { id: 'rubro-1', nombre: 'Panadería' },
    proveedor: { id: 'prov-1', razon_social: 'Distribuidora S.A.' },
    ...overrides,
  };
}

function mockLoteRaw(overrides: Record<string, unknown> = {}) {
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
    producto: {
      id: PRODUCTO_ID,
      nombre: 'Pan integral',
      codigo: 'PAN-001',
      unidad_medida: 'unidad',
      precio_venta: 250,
      cantidad_aviso: 0,
      rubro: { id: 'rubro-1', nombre: 'Panadería' },
      proveedor: { id: 'prov-1', razon_social: 'Distribuidora S.A.' },
    },
    ...overrides,
  };
}

const STOCK_QUERY_BASE: StockQueryInput = {
  page: 1,
  limit: 20,
  sort: 'created_at',
  order: 'desc',
};

describe('Stock/lote Use Cases (modelo Lote)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ----------------------------------------------------------------------
  describe('loteIngreso', () => {
    // ---- Escenario 1: merge suma + precio promedio 106.67 ----
    it('merge: misma (producto_id, numero_lote, fecha_vencimiento) suma cantidad y promeda precio (106.67)', async () => {
      const producto = mockProductoDb({ activo: false }); // inactivo → reactivar
      const existing = {
        id: 'lote-existing',
        cantidad_disponible: 10,
        precio_compra: 100,
      };
      mockPrisma.producto.findUnique.mockResolvedValue(producto);
      mockPrisma.lote.findFirst.mockResolvedValue(existing);
      // El update devuelve el lote con nuevo stock/precio (el mapLote consume esto)
      const mergedRaw = {
        ...mockLoteRaw({ id: 'lote-existing', cantidad_disponible: 30, precio_compra: 106.67 }),
      };
      mockPrisma.lote.update.mockResolvedValue(mergedRaw);

      const input: StockIngresoInput = {
        producto_id: PRODUCTO_ID,
        numero_lote: 'L-001',
        cantidad: 20,
        precio_compra: 110,
        fecha_vencimiento: '2024-12-31',
      };

      const result = await loteIngreso(input);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.lote.id).toBe('lote-existing'); // MISMO id
        // Verificar el promedio: (10*100 + 20*110)/30 = 106.666 → 106.67
        expect(result.value.lote.cantidad_disponible).toBe(30);
        expect(result.value.lote.precio_compra).toBe(106.67);
      }

      // Verificar que el update incrementó cantidad
      expect(mockPrisma.lote.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'lote-existing' },
          data: expect.objectContaining({
            cantidad_disponible: { increment: 20 },
            precio_compra: 106.67,
          }),
        })
      );

      // Reactivó producto inactivo
      expect(mockPrisma.producto.update).toHaveBeenCalledWith({
        where: { id: PRODUCTO_ID },
        data: { activo: true },
      });
    });

    // ---- Escenario 2: mismo numero_lote, distinto vencimiento → lote nuevo ----
    it('misma numero_lote distinto vencimiento crea segundo lote (no modifica existente)', async () => {
      const producto = mockProductoDb();
      // findFirst con venc nuevo → null (no existe lote con ese venc)
      mockPrisma.producto.findUnique.mockResolvedValue(producto);
      mockPrisma.lote.findFirst.mockResolvedValue(null);
      const nuevoRaw = mockLoteRaw({
        id: 'lote-new',
        numero_lote: 'L-001',
        fecha_vencimiento: new Date('2025-06-01'),
      });
      mockPrisma.lote.create.mockResolvedValue(nuevoRaw);

      const input: StockIngresoInput = {
        producto_id: PRODUCTO_ID,
        numero_lote: 'L-001',
        cantidad: 15,
        fecha_vencimiento: '2025-06-01',
        precio_compra: 120,
      };

      const result = await loteIngreso(input);

      expect(result.isOk()).toBe(true);
      expect(mockPrisma.lote.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            producto_id: PRODUCTO_ID,
            numero_lote: 'L-001',
            cantidad_disponible: 15, // el ingreso setea cantidad_disponible = input.cantidad
          }),
        })
      );
      // Verificar que NO se modificó el lote existente
      expect(mockPrisma.lote.update).not.toHaveBeenCalled();
    });

    // ---- Escenario 3: numero_lote NULL → lote nuevo (nunca mergea) ----
    it('numero_lote null crea lote nuevo sin buscar merge', async () => {
      mockPrisma.producto.findUnique.mockResolvedValue(mockProductoDb());
      mockPrisma.lote.findFirst.mockResolvedValue(null);
      mockPrisma.lote.create.mockResolvedValue(mockLoteRaw({ id: 'lote-null', numero_lote: null }));

      const result = await loteIngreso({
        producto_id: PRODUCTO_ID,
        numero_lote: null,
        cantidad: 10,
        precio_compra: 100,
      });

      expect(result.isOk()).toBe(true);
      expect(mockPrisma.lote.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.lote.create).toHaveBeenCalledTimes(1);
    });

    // ---- Escenario: reactiva producto inactivo ----
    it('reactiva producto inactivo (activo=true)', async () => {
      mockPrisma.producto.findUnique.mockResolvedValue(mockProductoDb({ activo: false }));
      mockPrisma.lote.findFirst.mockResolvedValue(null);
      mockPrisma.lote.create.mockResolvedValue(mockLoteRaw());

      await loteIngreso({
        producto_id: PRODUCTO_ID,
        cantidad: 10,
        precio_compra: 100,
      });

      expect(mockPrisma.producto.update).toHaveBeenCalledWith({
        where: { id: PRODUCTO_ID },
        data: { activo: true },
      });
    });

    // ---- Escenario: actualiza cantidad_aviso si viene ----
    it('actualiza cantidad_aviso del producto si viene en input', async () => {
      mockPrisma.producto.findUnique.mockResolvedValue(mockProductoDb());
      mockPrisma.lote.findFirst.mockResolvedValue(null);
      mockPrisma.lote.create.mockResolvedValue(mockLoteRaw());

      await loteIngreso({
        producto_id: PRODUCTO_ID,
        cantidad: 10,
        precio_compra: 100,
        cantidad_aviso: 5,
      });

      expect(mockPrisma.producto.update).toHaveBeenCalledWith({
        where: { id: PRODUCTO_ID },
        data: { cantidad_aviso: 5 },
      });
    });

    // ---- Escenario: producto no encontrado ----
    it('error NOT_FOUND si el producto no existe', async () => {
      mockPrisma.producto.findUnique.mockResolvedValue(null);
      const result = await loteIngreso({
        producto_id: 'non-existent',
        cantidad: 10,
        precio_compra: 100,
      });
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('NOT_FOUND');
    });
  });

  // ----------------------------------------------------------------------
  describe('loteList', () => {
    // mock de findMany que DISTINGUE la query de sumas (select:{producto_id,cantidad_disponible})
    // de la query de listado (include). La query de sumas solo suma lotes activos no vencidos.
    function mockFindManyVigentes(vigentes: Record<string, unknown>[], todos: Record<string, unknown>[]) {
      mockPrisma.lote.findMany.mockImplementation((opts: { select?: unknown; include?: unknown }) => {
        // query de sumas: select con cantidad_disponible
        if (opts?.select) {
          return Promise.resolve(
            vigentes.map((l) => ({
              producto_id: (l as { producto_id: string }).producto_id,
              cantidad_disponible: (l as { cantidad_disponible: number }).cantidad_disponible,
            }))
          );
        }
        // query de listado: devuelve todos (incluye vencidos, que el use-case mapea)
        return Promise.resolve(todos);
      });
    }

    // ---- Escenario: fila POR LOTE + stock_bajo ----
    it('retorna fila POR LOTE; stock_bajo usa SUM de lotes activos no vencidos', async () => {
      // 2 lotes activos (3 y 4) + 1 vencido (10). aviso = 5 → sum vigente 7 ≥ 5 → FALSE
      const lote1 = mockLoteRaw({ id: 'l1', numero_lote: 'L1', cantidad_disponible: 3, cantidad_aviso: 5 });
      const lote2 = mockLoteRaw({ id: 'l2', numero_lote: 'L2', cantidad_disponible: 4, cantidad_aviso: 5 });
      const loteVencido = mockLoteRaw({
        id: 'l3', numero_lote: 'L3', cantidad_disponible: 10, estado: 'vencido',
        fecha_vencimiento: new Date('2020-01-01'), cantidad_aviso: 5,
      });
      const todos = [lote1, lote2, loteVencido];
      const vigentes = [lote1, lote2];
      mockFindManyVigentes(vigentes, todos);
      mockPrisma.lote.count.mockResolvedValue(3);
      mockPrisma.lote.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.lote.findFirst.mockResolvedValue(null);

      const result = await loteList({ ...STOCK_QUERY_BASE, vencimiento_dias: undefined });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.data).toHaveLength(3);
        // sum vigentes = 3+4 = 7 ≥ aviso 5 → no stock_bajo
        expect(result.value.data[0]?.stock_bajo).toBe(false);
      }

      // ---- Aviso = 8 → sum 7 < 8 → stock_bajo TRUE ----
      // forzar aviso 8 dentro del producto anidado (el mapLote toma cantidad_aviso de l.producto)
      const rows8 = [
        mockLoteRaw({ id: 'l1', cantidad_disponible: 3, producto: { cantidad_aviso: 8 } }),
        mockLoteRaw({ id: 'l2', cantidad_disponible: 4, producto: { cantidad_aviso: 8 } }),
        mockLoteRaw({ id: 'l3', cantidad_disponible: 10, estado: 'vencido', fecha_vencimiento: new Date('2020-01-01'), producto: { cantidad_aviso: 8 } }),
      ];
      const vig8 = [rows8[0], rows8[1]];
      mockPrisma.lote.findMany.mockReset();
      mockPrisma.lote.findMany.mockImplementation((opts: { select?: unknown }) => {
        if (opts?.select) return Promise.resolve(vig8.map((l: any) => ({ producto_id: l.producto_id, cantidad_disponible: l.cantidad_disponible })));
        return Promise.resolve(rows8);
      });
      mockPrisma.lote.count.mockResolvedValue(3);

      const result8 = await loteList({ ...STOCK_QUERY_BASE, vencimiento_dias: undefined });
      expect(result8.isOk()).toBe(true);
      if (result8.isOk()) {
        // sum vigentes = 7 < aviso 8 → stock_bajo TRUE
        expect(result8.value.data[0]?.stock_bajo).toBe(true);
      }
    });

    // ---- Escenario: badge por_vencer + filtro ventana ----
    it('badge por_vender default 30; 45 días→ok; vencimiento_dias=30 filtra; venc NULL→ok', async () => {
      const todayStr = toUTC3DateString(new Date());
      const today = new Date(todayStr + 'T00:00:00.000Z');

      const lotePorVencer = mockLoteRaw({
        id: 'pv',
        numero_lote: 'PV',
        fecha_vencimiento: new Date(todayStr + 'T00:00:00.000Z'), // vence hoy+20
        cantidad_disponible: 5,
      });
      // seteamos una fecha dentro de 20 días del mock
      const futureVenc = new Date(today.getTime() + 20 * 86400000);
      lotePorVencer.fecha_vencimiento = futureVenc;

      const loteOk = mockLoteRaw({
        id: 'ok',
        numero_lote: 'OK',
        fecha_vencimiento: new Date(today.getTime() + 45 * 86400000),
        cantidad_disponible: 5,
      });

      const loteNull = mockLoteRaw({
        id: 'null',
        numero_lote: 'N',
        fecha_vencimiento: null,
        cantidad_disponible: 5,
      });

      mockPrisma.lote.findMany.mockResolvedValue([lotePorVencer, loteOk, loteNull]);
      mockPrisma.lote.count.mockResolvedValue(3);
      mockPrisma.lote.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.lote.findFirst.mockResolvedValue(null);

      // Sin vencimiento_dias: badge usa default 30 → lotePorVencer (20d) = por_vencer, loteOk (45d) = ok, null = ok
      const r1 = await loteList({ ...STOCK_QUERY_BASE });
      if (!r1.isOk()) throw new Error('r1');
      const byId = Object.fromKeys = r1.value.data.reduce((acc, row) => {
        acc[row.id] = row;
        return acc;
      }, {} as Record<string, typeof r1.value.data[0]>);
      expect(byId['pv'].estado_vencimiento).toBe('por_vencer');
      expect(byId['ok'].estado_vencimiento).toBe('ok');
      expect(byId['null'].estado_vencimiento).toBe('ok');

      // Con vencimiento_dias=30 EXPLÍCITO: filtra la ventana → solo devuelve lotePorVencer (≤30d), loteOk (45d) fuera
      mockPrisma.lote.findMany.mockResolvedValue([lotePorVencer]);
      mockPrisma.lote.count.mockResolvedValue(1);
      const r2 = await loteList({ ...STOCK_QUERY_BASE, vencimiento_dias: 30 });
      if (!r2.isOk()) throw new Error('r2');
      expect(r2.value.data).toHaveLength(1);
      expect(r2.value.data[0]?.id).toBe('pv');
    });

    // ---- Escenario: lazy pass ejecuta updateMany ----
    it('lazy pass: loteList ejecuta updateMany marcando vencidos', async () => {
      mockPrisma.lote.findMany.mockResolvedValue([]);
      mockPrisma.lote.count.mockResolvedValue(0);
      mockPrisma.lote.updateMany.mockResolvedValue({ count: 2 });

      await loteList(STOCK_QUERY_BASE);

      expect(mockPrisma.lote.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            estado: 'activo',
            fecha_vencimiento: { lt: expect.any(Date) },
          }),
          data: { estado: 'vencido' },
        })
      );
    });

    // ---- Escenario: vencidos ----
    it('filtro vencidos devuelve lotes vencidos', async () => {
      const vencido = mockLoteRaw({
        id: 'v1',
        estado: 'vencido',
        fecha_vencimiento: new Date('2020-01-01'),
      });
      mockPrisma.lote.findMany.mockResolvedValue([vencido]);
      mockPrisma.lote.count.mockResolvedValue(1);
      mockPrisma.lote.updateMany.mockResolvedValue({ count: 0 });

      const result = await loteList({ ...STOCK_QUERY_BASE, vencidos: true });
      if (!result.isOk()) throw new Error('ok');
      expect(result.value.data).toHaveLength(1);
      expect(result.value.data[0]?.estado_vencimiento).toBe('vencido');
    });
  });

  // ----------------------------------------------------------------------
  describe('loteEdit', () => {
    it('NO toca cantidad_disponible al editar', async () => {
      const lote = mockLoteRaw({ cantidad_disponible: 7 });
      mockPrisma.lote.findUnique.mockResolvedValue(lote);
      mockPrisma.lote.findFirst.mockResolvedValue(null); // sin duplicado
      const edited = mockLoteRaw({ precio_compra: 200 });
      mockPrisma.lote.update.mockResolvedValue(edited);

      const input: EditarLoteInput = {
        numero_lote: 'L-EDIT',
        fecha_vencimiento: '2025-12-31',
        precio_compra: 200,
      };

      const result = await loteEdit('lote-1', input);

      expect(result.isOk()).toBe(true);
      // Verificar que el update NO incluye cantidad_disponible
      const callData = mockPrisma.lote.update.mock.calls[0]?.[0]?.data;
      expect(callData).not.toHaveProperty('cantidad_disponible');
      expect(callData).toEqual(
        expect.objectContaining({
          numero_lote: 'L-EDIT',
          precio_compra: 200,
        })
      );
    });

    it('CONFLICT si duplica (numero_lote, fecha_vencimiento) de otro lote', async () => {
      const lote = mockLoteRaw();
      mockPrisma.lote.findUnique.mockResolvedValue(lote);
      // existe otro lote con el mismo par
      mockPrisma.lote.findFirst.mockResolvedValue({ ...mockLoteRaw(), id: 'otro-lote' });

      const result = await loteEdit('lote-1', {
        numero_lote: 'L-DUP',
        fecha_vencimiento: '2025-12-31',
        precio_compra: 200,
      });

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('CONFLICT');
    });

    it('NOT_FOUND si el lote no existe', async () => {
      mockPrisma.lote.findUnique.mockResolvedValue(null);
      const result = await loteEdit('non-existent', { precio_compra: 200 });
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('NOT_FOUND');
    });
  });

  // ----------------------------------------------------------------------
  describe('loteRetirar', () => {
    it('marca descartado desde activo', async () => {
      const lote = mockLoteRaw({ estado: 'activo' });
      mockPrisma.lote.findUnique.mockResolvedValue(lote);
      mockPrisma.lote.update.mockResolvedValue({ ...lote, estado: 'descartado' });

      const result = await loteRetirar('lote-1');
      expect(result.isOk()).toBe(true);
      expect(mockPrisma.lote.update).toHaveBeenCalledWith({
        where: { id: 'lote-1' },
        data: { estado: 'descartado' },
        include: expect.anything(),
      });
    });

    it('CONFLICT si el lote está vencido (no es activo/agotado)', async () => {
      const lote = mockLoteRaw({ estado: 'vencido' });
      mockPrisma.lote.findUnique.mockResolvedValue(lote);

      const result = await loteRetirar('lote-1');
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('CONFLICT');
      expect(mockPrisma.lote.update).not.toHaveBeenCalled();
    });
  });

  // ----------------------------------------------------------------------
  describe('loteDelete', () => {
    it('CONFLICT si tiene DetalleVenta asociado', async () => {
      mockPrisma.lote.findUnique.mockResolvedValue(mockLoteRaw());
      mockPrisma.detalleVenta.findFirst.mockResolvedValue({ id: 'det-1', lote_id: 'lote-1' });

      const result = await loteDelete('lote-1');
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('CONFLICT');
      expect(mockPrisma.lote.delete).not.toHaveBeenCalled();
    });

    it('borra físicamente si NO tiene DetalleVenta', async () => {
      mockPrisma.lote.findUnique.mockResolvedValue(mockLoteRaw());
      mockPrisma.detalleVenta.findFirst.mockResolvedValue(null);
      mockPrisma.lote.delete.mockResolvedValue({});

      const result = await loteDelete('lote-1');
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().success).toBe(true);
      expect(mockPrisma.lote.delete).toHaveBeenCalledWith({ where: { id: 'lote-1' } });
    });

    it('NOT_FOUND si el lote no existe', async () => {
      mockPrisma.lote.findUnique.mockResolvedValue(null);
      const result = await loteDelete('non-existent');
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('NOT_FOUND');
    });
  });
});
