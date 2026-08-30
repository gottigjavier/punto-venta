// src/__tests__/application/use-cases/producto.use-case.test.ts
// Tests para el modelo Lote (post split Producto/Lote).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getProductoById,
  listProductos,
  createProducto,
  updateProducto,
  deleteProducto,
  searchProductos,
} from '../../../application/use-cases/producto.use-case.js';
import type { ProductoQueryInput, CreateProductoInput } from '../../../application/dto/producto.dto.js';

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    producto: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    lote: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      aggregate: vi.fn(),
      updateMany: vi.fn(),
    },
    rubro: { findUnique: vi.fn() },
    proveedor: { findUnique: vi.fn() },
  },
}));

vi.mock('../../../infrastructure/database/prisma/client.js', () => ({
  prisma: mockPrisma,
}));

vi.mock('../../../infrastructure/logging/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

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
    ...overrides,
  };
}

describe('Producto Use Cases (modelo Lote)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ----------------------------------------------------------------------
  describe('getProductoById', () => {
    // stock_actual = SUM activos no vencidos (3 + 4 = 7); vencido(9) excluido
    it('calcula stock_actual = SUM(lotes activos no vencidos), activo = true', async () => {
      const producto = mockProductoDb();
      const lotesActivos = [
        mockLoteRaw({ id: 'l1', cantidad_disponible: 3, fecha_vencimiento: new Date('2026-12-01T00:00:00.000Z') }),
        mockLoteRaw({ id: 'l2', cantidad_disponible: 4, fecha_vencimiento: new Date('2026-12-01T00:00:00.000Z') }),
      ];
      const loteVencido = mockLoteRaw({
        id: 'l3',
        cantidad_disponible: 9,
        estado: 'vencido',
        fecha_vencimiento: new Date('2020-01-01T00:00:00.000Z'),
      });
      const allLotes = [...lotesActivos, loteVencido];

      mockPrisma.producto.findUnique.mockResolvedValue(producto);
      // El use-case hace 2 queries a lote.findMany: una con select (sumas) y otra sin select (listado).
      // El where filtra estado='activo' + fecha_vencimiento. Mockkeamos con mockImplementation
      // que respete el where, filtrando activos no vencidos (suma = 3+4 = 7).
      mockPrisma.lote.findMany.mockImplementation((opts: { where?: { estado?: string } }) => {
        const where = opts?.where;
        if (where?.estado === 'activo') {
          // query de sumas / listado vigente → activos no vencidos
          return Promise.resolve([...lotesActivos]);
        }
        return Promise.resolve(allLotes);
      });

      const result = await getProductoById(PRODUCTO_ID);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.stock_actual).toBe(7);
        expect(result.value.activo).toBe(true);
        expect(result.value.lotes).toHaveLength(2); // solo vigentes
      }
    });

    it('NOT_FOUND si el producto no existe', async () => {
      mockPrisma.producto.findUnique.mockResolvedValue(null);
      const result = await getProductoById('non-existent');
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('NOT_FOUND');
    });
  });

  // ----------------------------------------------------------------------
  describe('listProductos / searchProductos', () => {
    it('listProductos filtra activo=true (oculta inactivos)', async () => {
      mockPrisma.producto.findMany.mockResolvedValue([mockProductoDb()]);
      mockPrisma.producto.count.mockResolvedValue(1);
      mockPrisma.lote.findMany.mockResolvedValue([]);
      mockPrisma.lote.aggregate.mockResolvedValue({ _sum: { cantidad_disponible: 45 } });

      await listProductos({
        page: 1,
        limit: 20,
        sort: 'created_at',
        order: 'desc',
        fecha_desde: undefined,
        fecha_hasta: undefined,
      });

      expect(mockPrisma.producto.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ activo: true }) })
      );
    });

    it('searchProductos filtra activo=true', async () => {
      mockPrisma.producto.findMany.mockResolvedValue([mockProductoDb()]);
      mockPrisma.lote.findMany.mockResolvedValue([]);

      await searchProductos('pan', 'nombre');

      expect(mockPrisma.producto.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            activo: true,
            nombre: expect.objectContaining({ contains: 'pan' }),
          }),
        })
      );
    });
  });

  // ----------------------------------------------------------------------
  describe('createProducto', () => {
    const baseInput: CreateProductoInput = {
      nombre: 'Pan integral',
      codigo: 'PAN-001',
      precio_venta: 250,
      cantidad_aviso: 0,
      rubro_id: 'rubro-1',
      proveedor_id: 'prov-1',
      unidad_medida: 'unidad',
    };

    it('crea producto sin campos de stock/compra; stock_actual=0, lotes=[]', async () => {
      mockPrisma.producto.findFirst.mockResolvedValue(null);
      mockPrisma.rubro.findUnique.mockResolvedValue({ id: 'rubro-1' });
      mockPrisma.proveedor.findUnique.mockResolvedValue({ id: 'prov-1' });
      mockPrisma.producto.create.mockResolvedValue(mockProductoDb({ cantidad_aviso: 0 }));
      mockPrisma.lote.findMany.mockResolvedValue([]);

      const result = await createProducto(baseInput);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.stock_actual).toBe(0);
        expect(result.value.lotes).toEqual([]);
        expect(result.value.activo).toBe(true);
      }
    });

    it('CONFLICT si el código ya existe para el proveedor', async () => {
      mockPrisma.producto.findFirst.mockResolvedValue(mockProductoDb());

      const result = await createProducto(baseInput);
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('CONFLICT');
    });

    it('NOT_FOUND si el rubro no existe', async () => {
      mockPrisma.producto.findFirst.mockResolvedValue(null);
      mockPrisma.rubro.findUnique.mockResolvedValue(null);

      const result = await createProducto(baseInput);
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('NOT_FOUND');
    });

    // NOTA: el P2002 (unique codigo+proveedor a nivel DB) es el fallback de
    // red de seguridad; el use-case ya valida app-level con findFirst → CONFLICT.
    // Testear el instanceof cross-module de PrismaClientKnownRequestError en ESM
    // es frágil (vitest puede resolver @prisma/client a una instancia distinta).
    // El chequeo app-level (test "CONFLICT si el código ya existe") cubre el escenario productivo.
  });

  // ----------------------------------------------------------------------
  describe('updateProducto', () => {
    it('actualiza exitosamente', async () => {
      const existing = mockProductoDb();
      mockPrisma.producto.findUnique.mockResolvedValue(existing);
      mockPrisma.producto.findFirst.mockResolvedValue(null);
      mockPrisma.producto.update.mockResolvedValue({ ...existing, nombre: 'Pan actualizado' });
      mockPrisma.lote.findMany.mockResolvedValue([]);

      const result = await updateProducto({ id: PRODUCTO_ID, nombre: 'Pan actualizado' });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.nombre).toBe('Pan actualizado');
      }
    });

    it('CONFLICT si el código duplica', async () => {
      const existing = mockProductoDb();
      mockPrisma.producto.findUnique.mockResolvedValue(existing);
      mockPrisma.producto.findFirst.mockResolvedValue({ id: 'otro-id' });

      const result = await updateProducto({ id: PRODUCTO_ID, codigo: 'DUPLICADO' });
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('CONFLICT');
    });
  });

  // ----------------------------------------------------------------------
  describe('deleteProducto', () => {
    // ---- Soft delete: lote activo → VALIDATION_ERROR ----
    it('VALIDATION_ERROR si tiene lote activo', async () => {
      const producto = mockProductoDb();
      mockPrisma.producto.findUnique.mockResolvedValue(producto);
      // hay un lote activo
      mockPrisma.lote.findFirst.mockResolvedValue({ id: 'lote-activo', estado: 'activo' });

      const result = await deleteProducto(PRODUCTO_ID);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('VALIDATION_ERROR');
      expect(result._unsafeUnwrapErr().message).toContain('stock activo');
      expect(mockPrisma.producto.update).not.toHaveBeenCalled();
      expect(mockPrisma.producto.delete).not.toHaveBeenCalled();
    });

    // ---- Soft delete permitido: lotes no activos → activo=false ----
    it('soft delete: activo=false cuando no hay lote activo; no borra físicamente', async () => {
      const producto = mockProductoDb();
      mockPrisma.producto.findUnique.mockResolvedValue(producto);
      // No hay lotes activos (agotado/vencido/descartado)
      mockPrisma.lote.findFirst.mockResolvedValue(null);
      mockPrisma.producto.update.mockResolvedValue({ ...producto, activo: false });

      const result = await deleteProducto(PRODUCTO_ID);

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().success).toBe(true);
      expect(mockPrisma.producto.update).toHaveBeenCalledWith({
        where: { id: PRODUCTO_ID },
        data: { activo: false },
      });
      expect(mockPrisma.producto.delete).not.toHaveBeenCalled();
    });

    it('NOT_FOUND si el producto no existe', async () => {
      mockPrisma.producto.findUnique.mockResolvedValue(null);
      const result = await deleteProducto('non-existent');
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('NOT_FOUND');
    });
  });
});
