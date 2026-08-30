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

    // mock de findMany que RESPETA el filtro de estado del where (simula la DB):
    // el listado devuelve solo los lotes cuyo estado matchea el filtro estado del AND.
    function mockFindManyByEstado(todos: Record<string, unknown>[]) {
      mockPrisma.lote.findMany.mockImplementation((opts: { where?: any; select?: unknown }) => {
        // query de sumas del badge: solo lotes activos
        if (opts?.select) {
          return Promise.resolve(
            todos
              .filter((l) => (l as { estado: string }).estado === 'activo')
              .map((l) => ({
                producto_id: (l as { producto_id: string }).producto_id,
                cantidad_disponible: (l as { cantidad_disponible: number }).cantidad_disponible,
              }))
          );
        }
        // query de listado: aplicar el filtro de estado del AND si está presente
        const and: Array<{ estado?: unknown }> = opts?.where?.AND ?? [];
        const estadoFilter = and.find((c) => c.estado !== undefined);
        let filtered = todos;
        if (estadoFilter?.estado === 'activo') {
          filtered = todos.filter((l) => (l as { estado: string }).estado === 'activo');
        } else if (estadoFilter?.estado && (estadoFilter.estado as { in?: unknown }).in) {
          const inArr = (estadoFilter.estado as { in: string[] }).in;
          filtered = todos.filter((l) => inArr.includes((l as { estado: string }).estado));
        }
        return Promise.resolve(filtered);
      });
    }

    // ---- Escenario: fila POR LOTE + stock_bajo (default SOLO activo) ----
    it('retorna fila POR LOTE; default solo activo; stock_bajo usa SUM de lotes activos no vencidos', async () => {
      // 2 lotes activos (3 y 4). El lote vencido (10) NO entra en la vista default.
      // aviso = 5 → sum activos = 7 ≥ 5 → stock_bajo FALSE
      const lote1 = mockLoteRaw({ id: 'l1', numero_lote: 'L1', cantidad_disponible: 3, cantidad_aviso: 5 });
      const lote2 = mockLoteRaw({ id: 'l2', numero_lote: 'L2', cantidad_disponible: 4, cantidad_aviso: 5 });
      // Solo lotes ACTIVO en el listado (el filtro de estado corre en la query):
      const todos = [lote1, lote2];
      const vigentes = [lote1, lote2]; // badge: sum de lotes activos no vencidos
      mockFindManyVigentes(vigentes, todos);
      mockPrisma.lote.count.mockResolvedValue(2);
      mockPrisma.lote.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.lote.findFirst.mockResolvedValue(null);

      const result = await loteList({ ...STOCK_QUERY_BASE, archivados: undefined });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.data).toHaveLength(2);
        expect(result.value.pagination.total).toBe(2);
        // sum vigentes = 3+4 = 7 ≥ aviso 5 → no stock_bajo
        expect(result.value.data[0]?.stock_bajo).toBe(false);
      }

      // El where.AND del listado DEBE incluir el filtro de estado por defecto 'activo' (RF-01)
      const listCall = mockPrisma.lote.findMany.mock.calls.find((c) => !c[0]?.select);
      expect(listCall?.[0]?.where?.AND).toContainEqual({ estado: 'activo' });

      // ---- Aviso = 8 → sum 7 < 8 → stock_bajo TRUE ----
      const rows8 = [
        mockLoteRaw({ id: 'l1', cantidad_disponible: 3, producto: { cantidad_aviso: 8 } }),
        mockLoteRaw({ id: 'l2', cantidad_disponible: 4, producto: { cantidad_aviso: 8 } }),
      ];
      const vig8 = [rows8[0], rows8[1]];
      mockPrisma.lote.findMany.mockReset();
      mockPrisma.lote.findMany.mockImplementation((opts: { select?: unknown }) => {
        if (opts?.select) {
          return Promise.resolve(vig8.map((l: any) => ({ producto_id: l.producto_id, cantidad_disponible: l.cantidad_disponible })));
        }
        return Promise.resolve(rows8);
      });
      mockPrisma.lote.count.mockResolvedValue(2);

      const result8 = await loteList({ ...STOCK_QUERY_BASE, archivados: undefined });
      expect(result8.isOk()).toBe(true);
      if (result8.isOk()) {
        // sum vigentes = 7 < aviso 8 → stock_bajo TRUE
        expect(result8.value.data[0]?.stock_bajo).toBe(true);
      }
    });

    // ---- Escenario: badge por_vencer con default 30 ----
    it('badge por_vencer default 30; 45 días→ok; venc NULL→ok', async () => {
      const todayStr = toUTC3DateString(new Date());
      const today = new Date(todayStr + 'T00:00:00.000Z');

      const lotePorVencer = mockLoteRaw({
        id: 'pv',
        numero_lote: 'PV',
        fecha_vencimiento: new Date(today.getTime() + 20 * 86400000), // vence en 20 días
        cantidad_disponible: 5,
      });

      const loteOk = mockLoteRaw({
        id: 'ok',
        numero_lote: 'OK',
        fecha_vencimiento: new Date(today.getTime() + 45 * 86400000), // vence en 45 días
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

      // D fijo en 30 → lotePorVencer (20d) = por_vencer, loteOk (45d) = ok, null = ok
      const r1 = await loteList({ ...STOCK_QUERY_BASE, archivados: undefined });
      if (!r1.isOk()) throw new Error('r1');
      const byId = r1.value.data.reduce((acc, row) => {
        acc[row.id] = row;
        return acc;
      }, {} as Record<string, typeof r1.value.data[0]>);
      expect(byId['pv'].estado_vencimiento).toBe('por_vencer');
      expect(byId['ok'].estado_vencimiento).toBe('ok');
      expect(byId['null'].estado_vencimiento).toBe('ok');
    });

    // --- vencimiento_preaviso_dias tests ---
    it('badge por_vencer usa preaviso del producto (custom 15 días)', async () => {
      const todayStr = toUTC3DateString(new Date());
      const today = new Date(todayStr + 'T00:00:00.000Z');

      // Producto con preaviso 15 días
      const loteCustom = mockLoteRaw({
        id: 'custom',
        numero_lote: 'CUST',
        fecha_vencimiento: new Date(today.getTime() + 10 * 86400000), // vence en 10 días
        cantidad_disponible: 5,
        producto: {
          ...mockProductoDb().producto,
          vencimiento_preaviso_dias: 15, // NUEVO: preaviso custom
        },
      });

      // Producto con default 30 (para comparar)
      const loteDefault = mockLoteRaw({
        id: 'default',
        numero_lote: 'DEF',
        fecha_vencimiento: new Date(today.getTime() + 20 * 86400000), // vence en 20 días
        cantidad_disponible: 5,
      });

      mockPrisma.lote.findMany.mockResolvedValue([loteCustom, loteDefault]);
      mockPrisma.lote.count.mockResolvedValue(2);
      mockPrisma.lote.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.lote.findFirst.mockResolvedValue(null);

      const result = await loteList({ ...STOCK_QUERY_BASE, archivados: undefined });
      expect(result.isOk()).toBe(true);
      if (!result.isOk()) return;
      const byId = result.value.data.reduce((acc, row) => { acc[row.id] = row; return acc; }, {} as any);
      // Custom 15: vence en 10d < 15 → por_vencer
      expect(byId['custom'].estado_vencimiento).toBe('por_vencer');
      // Default 30: vence en 20d < 30 → por_vencer
      expect(byId['default'].estado_vencimiento).toBe('por_vencer');
    });

    it('badge por_vencer fallback 30 cuando producto tiene null', async () => {
      const todayStr = toUTC3DateString(new Date());
      const today = new Date(todayStr + 'T00:00:00.000Z');

      const loteNull = mockLoteRaw({
        id: 'null-preaviso',
        fecha_vencimiento: new Date(today.getTime() + 20 * 86400000), // 20 días
        producto: {
          ...mockProductoDb().producto,
          vencimiento_preaviso_dias: null, // Edge case: null en DB
        },
      });

      mockPrisma.lote.findMany.mockResolvedValue([loteNull]);
      mockPrisma.lote.count.mockResolvedValue(1);
      mockPrisma.lote.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.lote.findFirst.mockResolvedValue(null);

      const result = await loteList({ ...STOCK_QUERY_BASE, archivados: undefined });
      expect(result.isOk()).toBe(true);
      if (!result.isOk()) return;
      // Fallback 30: 20d < 30 → por_vencer
      expect(result.value.data[0].estado_vencimiento).toBe('por_vencer');
    });

    it('preaviso 0 → nunca por_vencer (solo ok/vencido)', async () => {
      const todayStr = toUTC3DateString(new Date());
      const today = new Date(todayStr + 'T00:00:00.000Z');

      const loteZero = mockLoteRaw({
        id: 'zero',
        fecha_vencimiento: new Date(today.getTime() + 10 * 86400000), // 10 días
        producto: {
          ...mockProductoDb().producto,
          vencimiento_preaviso_dias: 0,
        },
      });

      mockPrisma.lote.findMany.mockResolvedValue([loteZero]);
      mockPrisma.lote.count.mockResolvedValue(1);
      mockPrisma.lote.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.lote.findFirst.mockResolvedValue(null);

      const result = await loteList({ ...STOCK_QUERY_BASE, archivados: undefined });
      expect(result.isOk()).toBe(true);
      if (!result.isOk()) return;
      // 0 = sin preaviso → ok (aún no vencido)
      expect(result.value.data[0].estado_vencimiento).toBe('ok');
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

    // ---- RF-01 / RF-02: filtro de estado en la query (default vs archivados) ----
    it('default devuelve SOLO lotes activos (RF-01)', async () => {
      const activo = mockLoteRaw({ id: 'l-act', estado: 'activo' });
      const agotado = mockLoteRaw({ id: 'l-ago', estado: 'agotado' });
      const vencido = mockLoteRaw({ id: 'l-ven', estado: 'vencido', fecha_vencimiento: new Date('2020-01-01') });
      const descartado = mockLoteRaw({ id: 'l-desc', estado: 'descartado' });
      const todos = [activo, agotado, vencido, descartado];
      mockFindManyByEstado(todos);
      mockPrisma.lote.count.mockResolvedValue(1); // solo el activo
      mockPrisma.lote.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.lote.findFirst.mockResolvedValue(null);

      const result = await loteList({ ...STOCK_QUERY_BASE, archivados: undefined });

      expect(result.isOk()).toBe(true);
      // El where.AND contiene el filtro de estado por defecto 'activo'
      const listCall = mockPrisma.lote.findMany.mock.calls.find((c) => !c[0]?.select);
      expect(listCall?.[0]?.where?.AND).toContainEqual({ estado: 'activo' });
      if (result.isOk()) {
        expect(result.value.data).toHaveLength(1);
        expect(result.value.data[0]?.id).toBe('l-act');
        expect(result.value.pagination.total).toBe(1);
      }
    });

    it('archivados=true devuelve SOLO lotes terminales (RF-02)', async () => {
      const activo = mockLoteRaw({ id: 'l-act', estado: 'activo' });
      const agotado = mockLoteRaw({ id: 'l-ago', estado: 'agotado' });
      const vencido = mockLoteRaw({ id: 'l-ven', estado: 'vencido', fecha_vencimiento: new Date('2020-01-01') });
      const descartado = mockLoteRaw({ id: 'l-desc', estado: 'descartado' });
      const todos = [activo, agotado, vencido, descartado];
      mockFindManyByEstado(todos);
      mockPrisma.lote.count.mockResolvedValue(3); // los tres terminales
      mockPrisma.lote.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.lote.findFirst.mockResolvedValue(null);

      const result = await loteList({ ...STOCK_QUERY_BASE, archivados: 'true' });

      expect(result.isOk()).toBe(true);
      const listCall = mockPrisma.lote.findMany.mock.calls.find((c) => !c[0]?.select);
      expect(listCall?.[0]?.where?.AND).toContainEqual({ estado: { in: ['agotado', 'vencido', 'descartado'] } });
      if (result.isOk()) {
        const ids = result.value.data.map((r) => r.id).sort();
        expect(ids).toEqual(['l-ago', 'l-desc', 'l-ven']);
        expect(result.value.pagination.total).toBe(3);
        // El lote activo NUNCA aparece en la vista archivados
        expect(result.value.data.some((r) => r.id === 'l-act')).toBe(false);
      }
    });

    it('archivados=false equivale al default (solo activo) (RF-02)', async () => {
      const activo = mockLoteRaw({ id: 'l-act', estado: 'activo' });
      const vencido = mockLoteRaw({ id: 'l-ven', estado: 'vencido', fecha_vencimiento: new Date('2020-01-01') });
      const todos = [activo, vencido];
      mockFindManyByEstado(todos);
      mockPrisma.lote.count.mockResolvedValue(1);
      mockPrisma.lote.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.lote.findFirst.mockResolvedValue(null);

      const result = await loteList({ ...STOCK_QUERY_BASE, archivados: 'false' });

      expect(result.isOk()).toBe(true);
      const listCall = mockPrisma.lote.findMany.mock.calls.find((c) => !c[0]?.select);
      expect(listCall?.[0]?.where?.AND).toContainEqual({ estado: 'activo' });
      if (result.isOk()) {
        expect(result.value.data).toHaveLength(1);
        expect(result.value.data[0]?.id).toBe('l-act');
      }
    });

    // ---- RF-04 / RF-05: composición AND con search y rubro en ambas vistas ----
    it('search + archivados=true se componen AND (RF-04)', async () => {
      const lecheVenc = mockLoteRaw({ id: 'l-lv', estado: 'vencido', numero_lote: 'LV', fecha_vencimiento: new Date('2020-01-01') });
      mockFindManyByEstado([lecheVenc]);
      mockPrisma.lote.count.mockResolvedValue(1);
      mockPrisma.lote.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.lote.findFirst.mockResolvedValue(null);

      const result = await loteList({ ...STOCK_QUERY_BASE, archivados: 'true', search: 'leche' });

      expect(result.isOk()).toBe(true);
      const listCall = mockPrisma.lote.findMany.mock.calls.find((c) => !c[0]?.select);
      const AND = listCall?.[0]?.where?.AND ?? [];
      // El where.AND contiene AMBOS: filtro de estado (in terminales) + search
      expect(AND).toContainEqual({ estado: { in: ['agotado', 'vencido', 'descartado'] } });
      expect(AND.some((c: any) => c.OR !== undefined)).toBe(true);
    });

    it('rubro_id + archivados=true se componen AND (RF-05)', async () => {
      const vencLacteos = mockLoteRaw({ id: 'l-vl', estado: 'vencido', fecha_vencimiento: new Date('2020-01-01') });
      mockFindManyByEstado([vencLacteos]);
      mockPrisma.lote.count.mockResolvedValue(1);
      mockPrisma.lote.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.lote.findFirst.mockResolvedValue(null);

      const result = await loteList({ ...STOCK_QUERY_BASE, archivados: 'true', rubro_id: 'rubro-lacteos' });

      expect(result.isOk()).toBe(true);
      const listCall = mockPrisma.lote.findMany.mock.calls.find((c) => !c[0]?.select);
      const AND = listCall?.[0]?.where?.AND ?? [];
      expect(AND).toContainEqual({ estado: { in: ['agotado', 'vencido', 'descartado'] } });
      expect(AND).toContainEqual({ producto: { rubro_id: 'rubro-lacteos' } });
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
