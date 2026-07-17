// src/__tests__/application/use-cases/cierre.use-case.test.ts
// Cash closure use case tests
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  listCierres,
  getCierreById,
  exportCierreCsv,
} from '../../../application/use-cases/cierre.use-case.js';
import type { ListCierresQueryInput } from '../../../application/dto/cierre.dto.js';

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    cierreCaja: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
    },
    producto: {
      findMany: vi.fn(),
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

// Default query without filters
function defaultQuery(overrides?: Partial<ListCierresQueryInput>): ListCierresQueryInput {
  return {
    page: 1,
    limit: 20,
    sort: 'fecha_cierre',
    order: 'desc',
    ...overrides,
  };
}

const mockCierre = {
  id: 'cierre-1',
  fecha_apertura: new Date('2024-01-15T08:00:00Z'),
  fecha_cierre: new Date('2024-01-15T18:00:00Z'),
  monto_total: 1500,
  cantidad_ventas: 5,
  estado: 'cerrado',
  usuario_apertura: { id: 'u1', nombre_usuario: 'Juan' },
  usuario_cierre: { id: 'u2', nombre_usuario: 'María' },
};

const mockDetalles = [
  {
    id: 'det-1',
    tipo: 'producto',
    referencia_id: 'prod-1',
    nombre: 'Pan integral',
    cantidad: 10,
    monto_total: 2500,
  },
  {
    id: 'det-2',
    tipo: 'vendedor',
    referencia_id: 'vend-1',
    nombre: 'Juan Pérez',
    cantidad: 1,
    monto_total: 1500,
  },
];

describe('Cierre Use Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listCierres', () => {
    it('should return paginated cierres with default params', async () => {
      mockPrisma.cierreCaja.findMany.mockResolvedValue([mockCierre]);
      mockPrisma.cierreCaja.count.mockResolvedValue(1);

      const result = await listCierres(defaultQuery());

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.data).toHaveLength(1);
        expect(result.value.data[0]).toBeDefined();
        expect(result.value.data[0]!.id).toBe('cierre-1');
        expect(result.value.pagination.total).toBe(1);
        expect(result.value.pagination.totalPages).toBe(1);
      }
    });

    it('should filter by vendedor_id using detalles.some', async () => {
      mockPrisma.cierreCaja.findMany.mockResolvedValue([]);
      mockPrisma.cierreCaja.count.mockResolvedValue(0);

      const vendedorId = '123e4567-e89b-12d3-a456-426614170001';
      await listCierres(defaultQuery({ vendedor_id: vendedorId }));

      expect(mockPrisma.cierreCaja.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            detalles: {
              some: {
                tipo: 'vendedor',
                referencia_id: vendedorId,
              },
            },
          }),
        })
      );
    });

    it('should filter by producto_id using detalles.some', async () => {
      mockPrisma.cierreCaja.findMany.mockResolvedValue([]);
      mockPrisma.cierreCaja.count.mockResolvedValue(0);

      const productoId = '123e4567-e89b-12d3-a456-426614170099';
      await listCierres(defaultQuery({ producto_id: productoId }));

      expect(mockPrisma.cierreCaja.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            detalles: {
              some: {
                tipo: 'producto',
                referencia_id: productoId,
              },
            },
          }),
        })
      );
    });

    it('should filter by proveedor_id via producto lookup', async () => {
      const proveedorId = '123e4567-e89b-12d3-a456-426614170050';
      mockPrisma.producto.findMany.mockResolvedValue([
        { id: 'prod-a' },
        { id: 'prod-b' },
      ]);
      mockPrisma.cierreCaja.findMany.mockResolvedValue([]);
      mockPrisma.cierreCaja.count.mockResolvedValue(0);

      await listCierres(defaultQuery({ proveedor_id: proveedorId }));

      // Should first query products for this provider
      expect(mockPrisma.producto.findMany).toHaveBeenCalledWith({
        where: { proveedor_id: proveedorId },
        select: { id: true },
      });

      // Then filter cierres with those product IDs
      expect(mockPrisma.cierreCaja.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            detalles: {
              some: {
                tipo: 'producto',
                referencia_id: { in: ['prod-a', 'prod-b'] },
              },
            },
          }),
        })
      );
    });

    it('should return empty when proveedor has no products', async () => {
      const proveedorId = '123e4567-e89b-12d3-a456-426614170050';
      mockPrisma.producto.findMany.mockResolvedValue([]);

      const result = await listCierres(defaultQuery({ proveedor_id: proveedorId }));

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.data).toHaveLength(0);
        expect(result.value.pagination.total).toBe(0);
      }
      // Should NOT query cierres since no products exist
      expect(mockPrisma.cierreCaja.findMany).not.toHaveBeenCalled();
    });

    it('should filter by date range on fecha_cierre', async () => {
      mockPrisma.cierreCaja.findMany.mockResolvedValue([]);
      mockPrisma.cierreCaja.count.mockResolvedValue(0);

      const desde = new Date('2024-01-01');
      const hasta = new Date('2024-01-31');
      await listCierres(defaultQuery({ fecha_desde: desde, fecha_hasta: hasta }));

      expect(mockPrisma.cierreCaja.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            fecha_cierre: {
              gte: desde,
              lte: hasta,
            },
          }),
        })
      );
    });

    it('should handle database error', async () => {
      mockPrisma.cierreCaja.findMany.mockRejectedValue(new Error('DB error'));

      const result = await listCierres(defaultQuery());

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('DATABASE_ERROR');
      }
    });
  });

  describe('getCierreById', () => {
    it('should return cierre with details', async () => {
      mockPrisma.cierreCaja.findUnique.mockResolvedValue({
        ...mockCierre,
        detalles: mockDetalles,
      });

      const result = await getCierreById('cierre-1');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.id).toBe('cierre-1');
        expect(result.value.monto_total).toBe(1500);
        expect(result.value.detalles).toHaveLength(2);
        expect(result.value.detalles[0]).toBeDefined();
        expect(result.value.detalles[0]!.tipo).toBe('producto');
        expect(result.value.usuario_apertura.nombre_usuario).toBe('Juan');
      }
    });

    it('should return NOT_FOUND for non-existent cierre', async () => {
      mockPrisma.cierreCaja.findUnique.mockResolvedValue(null);

      const result = await getCierreById('non-existent');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });

    it('should handle database error', async () => {
      mockPrisma.cierreCaja.findUnique.mockRejectedValue(
        new Error('DB connection lost')
      );

      const result = await getCierreById('some-id');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('DATABASE_ERROR');
      }
    });
  });

  describe('exportCierreCsv', () => {
    it('should return CSV with header and data rows', async () => {
      mockPrisma.cierreCaja.findUnique.mockResolvedValue({
        ...mockCierre,
        detalles: mockDetalles,
      });

      const result = await exportCierreCsv('cierre-1');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const { csv, totalDetalles, truncated } = result.value;
        expect(totalDetalles).toBe(2);
        expect(truncated).toBe(false);

        // Header check
        expect(csv).toMatch(/^tipo,referencia_id,nombre,cantidad,monto_total/);

        // Data rows present
        expect(csv).toContain('producto');
        expect(csv).toContain('Pan integral');
        expect(csv).toContain('vendedor');
        expect(csv).toContain('Juan Pérez');
      }
    });

    it('should truncate when details exceed limit', async () => {
      const manyDetalles = Array.from({ length: 5 }, (_, i) => ({
        id: `det-${i}`,
        tipo: 'producto',
        referencia_id: `prod-${i}`,
        nombre: `Item ${i}`,
        cantidad: 1,
        monto_total: 100,
      }));

      mockPrisma.cierreCaja.findUnique.mockResolvedValue({
        ...mockCierre,
        detalles: manyDetalles,
      });

      const result = await exportCierreCsv('cierre-1', 3);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.totalDetalles).toBe(5);
        expect(result.value.truncated).toBe(true);
        expect(result.value.csv).toContain('AVISO: Truncado a 3 registros');
      }
    });

    it('should return NOT_FOUND for non-existent cierre', async () => {
      mockPrisma.cierreCaja.findUnique.mockResolvedValue(null);

      const result = await exportCierreCsv('non-existent');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });

    it('should handle database error', async () => {
      mockPrisma.cierreCaja.findUnique.mockRejectedValue(
        new Error('DB error')
      );

      const result = await exportCierreCsv('some-id');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('DATABASE_ERROR');
      }
    });
  });
});
