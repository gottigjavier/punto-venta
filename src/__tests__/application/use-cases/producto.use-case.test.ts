// src/__tests__/application/use-cases/producto.use-case.test.ts
// Product use case tests
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getProductoById,
  listProductos,
  createProducto,
  updateProducto,
  deleteProducto,
} from '../../../application/use-cases/producto.use-case.js';
import type { ProductoQueryInput, CreateProductoInput } from '../../../application/dto/producto.dto.js';

// Create mock with vi.hoisted so it's available for vi.mock
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
    rubro: {
      findUnique: vi.fn(),
    },
    proveedor: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock Prisma client
vi.mock('../../../infrastructure/database/prisma/client.js', () => ({
  prisma: mockPrisma,
}));

// Mock logger
vi.mock('../../../infrastructure/logging/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Helper to create mock product
function createMockProducto(overrides?: Record<string, unknown>) {
  return {
    id: '123e4567-e89b-12d3-a456-426614174000',
    nombre: 'Pan integral',
    codigo: 'PAN-001',
    cantidad_disponible: 45,
    precio_compra: 150,
    precio_venta: 250,
    rubro_id: '123e4567-e89b-12d3-a456-426614174010',
    proveedor_id: '123e4567-e89b-12d3-a456-426614174011',
    fecha_compra: new Date('2024-01-15'),
    fecha_vencimiento: new Date('2024-12-31'),
    numero_remesa: 'REM-001',
    cantidad_aviso: 0,
    unidad_medida: 'unidad',
    created_at: new Date(),
    updated_at: new Date(),
    rubro: {
      id: '123e4567-e89b-12d3-a456-426614174010',
      nombre: 'Panadería',
    },
    proveedor: {
      id: '123e4567-e89b-12d3-a456-426614174011',
      razon_social: 'Distribuidora Ejemplo S.A.',
    },
    ...overrides,
  };
}

const defaultQuery: ProductoQueryInput = {
  page: 1,
  limit: 20,
  sort: 'created_at',
  order: 'desc',
  fecha_desde: undefined,
  fecha_hasta: undefined,
};

describe('Producto Use Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getProductoById', () => {
    it('should return product when found', async () => {
      const mockProduct = createMockProducto();
      mockPrisma.producto.findUnique.mockResolvedValue(mockProduct);

      const result = await getProductoById(mockProduct.id);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.id).toBe(mockProduct.id);
        expect(result.value.nombre).toBe(mockProduct.nombre);
      }
    });

    it('should return error when product not found', async () => {
      mockPrisma.producto.findUnique.mockResolvedValue(null);

      const result = await getProductoById('non-existent-id');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });

    it('should handle database errors', async () => {
      mockPrisma.producto.findUnique.mockRejectedValue(new Error('DB error'));

      const result = await getProductoById('some-id');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('DATABASE_ERROR');
      }
    });
  });

  describe('listProductos', () => {
    it('should return paginated products', async () => {
      const mockProducts = [createMockProducto(), createMockProducto({ id: 'another-id' })];
      mockPrisma.producto.findMany.mockResolvedValue(mockProducts);
      mockPrisma.producto.count.mockResolvedValue(2);

      const result = await listProductos(defaultQuery);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.data).toHaveLength(2);
        expect(result.value.pagination.total).toBe(2);
        expect(result.value.pagination.totalPages).toBe(1);
      }
    });

    it('should apply search filter', async () => {
      mockPrisma.producto.findMany.mockResolvedValue([]);
      mockPrisma.producto.count.mockResolvedValue(0);

      await listProductos({ ...defaultQuery, search: 'pan' });

      expect(mockPrisma.producto.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ nombre: expect.objectContaining({ contains: 'pan' }) }),
            ]),
          }),
        })
      );
    });

    it('should apply rubro filter', async () => {
      mockPrisma.producto.findMany.mockResolvedValue([]);
      mockPrisma.producto.count.mockResolvedValue(0);

      await listProductos({
        ...defaultQuery,
        rubro_id: '123e4567-e89b-12d3-a456-426614174010',
      });

      expect(mockPrisma.producto.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            rubro_id: '123e4567-e89b-12d3-a456-426614174010',
          }),
        })
      );
    });

    it('should handle database errors', async () => {
      mockPrisma.producto.findMany.mockRejectedValue(new Error('DB error'));

      const result = await listProductos(defaultQuery);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('DATABASE_ERROR');
      }
    });
  });

  describe('createProducto', () => {
    it('should create product successfully', async () => {
      const mockProduct = createMockProducto();
      mockPrisma.producto.findFirst.mockResolvedValue(null);
      mockPrisma.rubro.findUnique.mockResolvedValue({ id: mockProduct.rubro_id });
      mockPrisma.proveedor.findUnique.mockResolvedValue({ id: mockProduct.proveedor_id });
      mockPrisma.producto.create.mockResolvedValue(mockProduct);

      const input: CreateProductoInput = {
        nombre: mockProduct.nombre,
        codigo: mockProduct.codigo,
        cantidad_disponible: mockProduct.cantidad_disponible,
        precio_compra: mockProduct.precio_compra,
        precio_venta: mockProduct.precio_venta,
        rubro_id: mockProduct.rubro_id,
        proveedor_id: mockProduct.proveedor_id,
        cantidad_aviso: 0,
        unidad_medida: 'unidad',
        fecha_compra: undefined,
        fecha_vencimiento: undefined,
      };

      const result = await createProducto(input);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.codigo).toBe(mockProduct.codigo);
      }
    });

    it('should return error when code already exists for supplier', async () => {
      const existingProduct = createMockProducto();
      mockPrisma.producto.findFirst.mockResolvedValue(existingProduct);

      const result = await createProducto({
        nombre: 'Nuevo producto',
        codigo: existingProduct.codigo,
        cantidad_disponible: 10,
        precio_compra: 100,
        precio_venta: 200,
        rubro_id: existingProduct.rubro_id,
        proveedor_id: existingProduct.proveedor_id,
        cantidad_aviso: 0,
        unidad_medida: 'unidad',
        fecha_compra: undefined,
        fecha_vencimiento: undefined,
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('CONFLICT');
      }
    });

    it('should return error when rubro not found', async () => {
      mockPrisma.producto.findFirst.mockResolvedValue(null);
      mockPrisma.rubro.findUnique.mockResolvedValue(null);

      const result = await createProducto({
        nombre: 'Pan',
        codigo: 'PAN-001',
        cantidad_disponible: 10,
        precio_compra: 100,
        precio_venta: 200,
        rubro_id: 'non-existent-rubro',
        proveedor_id: '123e4567-e89b-12d3-a456-426614174011',
        cantidad_aviso: 0,
        unidad_medida: 'unidad',
        fecha_compra: undefined,
        fecha_vencimiento: undefined,
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });

    it('should return error when proveedor not found', async () => {
      mockPrisma.producto.findFirst.mockResolvedValue(null);
      mockPrisma.rubro.findUnique.mockResolvedValue({ id: 'rubro-id' });
      mockPrisma.proveedor.findUnique.mockResolvedValue(null);

      const result = await createProducto({
        nombre: 'Pan',
        codigo: 'PAN-001',
        cantidad_disponible: 10,
        precio_compra: 100,
        precio_venta: 200,
        rubro_id: 'rubro-id',
        proveedor_id: 'non-existent-proveedor',
        cantidad_aviso: 0,
        unidad_medida: 'unidad',
        fecha_compra: undefined,
        fecha_vencimiento: undefined,
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('updateProducto', () => {
    it('should update product successfully', async () => {
      const mockProduct = createMockProducto();
      mockPrisma.producto.findUnique.mockResolvedValue(mockProduct);
      mockPrisma.producto.findFirst.mockResolvedValue(null);
      mockPrisma.producto.update.mockResolvedValue({ ...mockProduct, nombre: 'Updated' });

      const result = await updateProducto({
        id: mockProduct.id,
        nombre: 'Updated',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.nombre).toBe('Updated');
      }
    });

    it('should return error when product not found', async () => {
      mockPrisma.producto.findUnique.mockResolvedValue(null);

      const result = await updateProducto({
        id: 'non-existent-id',
        nombre: 'Updated',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });

    it('should return error when code conflicts', async () => {
      const mockProduct = createMockProducto();
      mockPrisma.producto.findUnique.mockResolvedValue(mockProduct);
      mockPrisma.producto.findFirst.mockResolvedValue({ id: 'other-id' });

      const result = await updateProducto({
        id: mockProduct.id,
        codigo: 'EXISTING-CODE',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('CONFLICT');
      }
    });
  });

  describe('deleteProducto', () => {
    it('should delete product successfully', async () => {
      const mockProduct = createMockProducto();
      mockPrisma.producto.findUnique.mockResolvedValue({
        ...mockProduct,
        _count: { detalles_venta: 0 },
      });
      mockPrisma.producto.delete.mockResolvedValue(mockProduct);

      const result = await deleteProducto(mockProduct.id);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.success).toBe(true);
      }
    });

    it('should return error when product not found', async () => {
      mockPrisma.producto.findUnique.mockResolvedValue(null);

      const result = await deleteProducto('non-existent-id');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });

    it('should return error when product has sales', async () => {
      const mockProduct = createMockProducto();
      mockPrisma.producto.findUnique.mockResolvedValue({
        ...mockProduct,
        _count: { detalles_venta: 5 },
      });

      const result = await deleteProducto(mockProduct.id);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
      }
    });
  });
});
