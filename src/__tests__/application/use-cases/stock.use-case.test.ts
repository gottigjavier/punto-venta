// src/__tests__/application/use-cases/stock.use-case.test.ts
// Stock management use case tests
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  listStock,
  stockIngreso,
  stockEdit,
} from '../../../application/use-cases/stock.use-case.js';
import type { StockQueryInput, StockIngresoInput } from '../../../application/dto/stock.dto.js';

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

vi.mock('../../../infrastructure/database/prisma/client.js', () => ({
  prisma: mockPrisma,
}));

vi.mock('../../../infrastructure/logging/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

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
    unidad_medida: 'unidad',
    cantidad_aviso: 0,
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

const defaultStockQuery: StockQueryInput = {
  page: 1,
  limit: 20,
  vencimiento_dias: 30,
  sort: 'created_at',
  order: 'desc',
};

describe('Stock Use Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listStock', () => {
    it('should return stock with alerts', async () => {
      const mockProducts = [
        createMockProducto({ cantidad_disponible: 45 }),
        createMockProducto({ id: 'another-id', cantidad_disponible: 5 }),
        createMockProducto({ id: 'expired-id', fecha_vencimiento: new Date('2020-01-01') }),
      ];
      mockPrisma.producto.findMany.mockResolvedValue(mockProducts);
      mockPrisma.producto.count.mockResolvedValue(3);

      const result = await listStock(defaultStockQuery);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.data).toHaveLength(3);
        expect(result.value.data[1]?.stock_bajo).toBe(true);
        expect(result.value.data[2]?.estado_vencimiento).toBe('vencido');
      }
    });

    it('should filter by stock_bajo', async () => {
      mockPrisma.producto.findMany.mockResolvedValue([]);
      mockPrisma.producto.count.mockResolvedValue(0);

      await listStock({ ...defaultStockQuery, stock_bajo: true });

      expect(mockPrisma.producto.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            cantidad_disponible: { lt: 10 },
          }),
        })
      );
    });

    it('should filter by vencidos', async () => {
      mockPrisma.producto.findMany.mockResolvedValue([]);
      mockPrisma.producto.count.mockResolvedValue(0);

      await listStock({ ...defaultStockQuery, vencidos: true });

      expect(mockPrisma.producto.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            fecha_vencimiento: { lt: expect.any(Date) },
          }),
        })
      );
    });
  });

  describe('stockIngreso', () => {
    it('should create new product when no existing match', async () => {
      const mockProduct = createMockProducto();
      mockPrisma.producto.findFirst.mockResolvedValue(null);
      mockPrisma.rubro.findUnique.mockResolvedValue({ id: mockProduct.rubro_id });
      mockPrisma.proveedor.findUnique.mockResolvedValue({ id: mockProduct.proveedor_id });
      mockPrisma.producto.create.mockResolvedValue(mockProduct);

      const input: StockIngresoInput = {
        nombre: mockProduct.nombre,
        codigo: mockProduct.codigo,
        cantidad: mockProduct.cantidad_disponible,
        precio_compra: mockProduct.precio_compra,
        precio_venta: mockProduct.precio_venta,
        rubro_id: mockProduct.rubro_id,
        proveedor_id: mockProduct.proveedor_id,
        unidad_medida: 'unidad',
        cantidad_aviso: 0,
        fecha_compra: undefined,
        fecha_vencimiento: undefined,
      };

      const result = await stockIngreso(input);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.codigo).toBe(mockProduct.codigo);
      }
    });

    it('should update existing product when fields differ', async () => {
      const existingProduct = createMockProducto({ cantidad_disponible: 10 });
      const updatedProduct = createMockProducto({ cantidad_disponible: 55 });
      mockPrisma.producto.findFirst.mockResolvedValue(existingProduct);
      mockPrisma.producto.update.mockResolvedValue(updatedProduct);

      const input: StockIngresoInput = {
        nombre: existingProduct.nombre,
        codigo: existingProduct.codigo,
        cantidad: 45,
        precio_compra: existingProduct.precio_compra,
        precio_venta: existingProduct.precio_venta,
        rubro_id: existingProduct.rubro_id,
        proveedor_id: existingProduct.proveedor_id,
        unidad_medida: 'unidad',
        cantidad_aviso: 0,
        fecha_compra: undefined,
        fecha_vencimiento: undefined,
      };

      const result = await stockIngreso(input);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.cantidad_disponible).toBe(55);
      }
    });

    it('should return error when all fields match existing product', async () => {
      const existingProduct = createMockProducto();
      mockPrisma.producto.findFirst.mockResolvedValue(existingProduct);

      const input: StockIngresoInput = {
        nombre: existingProduct.nombre,
        codigo: existingProduct.codigo,
        cantidad: existingProduct.cantidad_disponible,
        precio_compra: existingProduct.precio_compra,
        precio_venta: existingProduct.precio_venta,
        rubro_id: existingProduct.rubro_id,
        proveedor_id: existingProduct.proveedor_id,
        unidad_medida: existingProduct.unidad_medida as 'unidad',
        cantidad_aviso: 0,
        fecha_compra: existingProduct.fecha_compra?.toISOString().split('T')[0],
        fecha_vencimiento: existingProduct.fecha_vencimiento?.toISOString().split('T')[0],
        numero_remesa: existingProduct.numero_remesa,
      };

      const result = await stockIngreso(input);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('should return error when rubro not found', async () => {
      mockPrisma.producto.findFirst.mockResolvedValue(null);
      mockPrisma.rubro.findUnique.mockResolvedValue(null);

      const result = await stockIngreso({
        nombre: 'Pan',
        codigo: 'PAN-001',
        cantidad: 10,
        precio_compra: 100,
        precio_venta: 200,
        rubro_id: 'non-existent-rubro',
        proveedor_id: '123e4567-e89b-12d3-a456-426614174011',
        unidad_medida: 'unidad',
        cantidad_aviso: 0,
        fecha_compra: undefined,
        fecha_vencimiento: undefined,
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('stockEdit', () => {
    it('should edit product successfully', async () => {
      const mockProduct = createMockProducto();
      mockPrisma.producto.findUnique.mockResolvedValue(mockProduct);
      mockPrisma.producto.findFirst.mockResolvedValue(null);
      mockPrisma.producto.update.mockResolvedValue({ ...mockProduct, nombre: 'Updated' });

      const result = await stockEdit({
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

      const result = await stockEdit({
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

      const result = await stockEdit({
        id: mockProduct.id,
        codigo: 'EXISTING-CODE',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('CONFLICT');
      }
    });
  });
});
