// src/__tests__/application/use-cases/venta.use-case.test.ts
// Sale use case tests
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createVenta,
  getVentaById,
  listVentas,
  getResumenDia,
  deleteVenta,
  cerrarCaja,
} from '../../../application/use-cases/venta.use-case.js';
import type { CreateVentaInput, VentaQueryInput } from '../../../application/dto/venta.dto.js';

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    producto: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    usuario: {
      findUnique: vi.fn(),
    },
    venta: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    detalleVenta: {
      create: vi.fn(),
    },
    cierreCaja: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
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

vi.mock('../../../infrastructure/auth/password.js', () => ({
  verifyPassword: vi.fn(),
}));

// Helper to create mock product (returned from DB)
function createMockProductoDb(overrides?: Record<string, unknown>) {
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
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

// Helper to create mock venta with details (returned from DB)
function createMockVentaDb(overrides?: Record<string, unknown>) {
  return {
    id: '123e4567-e89b-12d3-a456-426614175000',
    usuario_id: '123e4567-e89b-12d3-a456-426614174002',
    total: 750,
    estado: 'completada' as const,
    created_at: new Date(),
    usuario: {
      id: '123e4567-e89b-12d3-a456-426614174002',
      nombre_usuario: 'Juan Pérez',
      nik_usuario: 'jperez',
    },
    detalles_venta: [
      {
        id: '123e4567-e89b-12d3-a456-426614176000',
        venta_id: '123e4567-e89b-12d3-a456-426614175000',
        producto_id: '123e4567-e89b-12d3-a456-426614174000',
        cantidad: 3,
        precio_unitario: 250,
        subtotal: 750,
        producto: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          nombre: 'Pan integral',
          codigo: 'PAN-001',
        },
      },
    ],
    ...overrides,
  };
}

const validVentaInput: CreateVentaInput = {
  productos: [
    {
      producto_id: '123e4567-e89b-12d3-a456-426614174000',
      cantidad: 3,
      precio_unitario: 250,
    },
  ],
};

describe('Venta Use Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createVenta', () => {
    it('should create a sale successfully', async () => {
      const mockProduct = createMockProductoDb();
      mockPrisma.producto.findMany.mockResolvedValue([mockProduct]);

      // Mock $transaction to execute the callback and return the result
      mockPrisma.$transaction.mockImplementation(
        async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => {
          const tx = {
            venta: {
              create: vi.fn().mockResolvedValue({
                id: '123e4567-e89b-12d3-a456-426614175000',
                usuario_id: '123e4567-e89b-12d3-a456-426614174002',
                total: 750,
                estado: 'completada',
                created_at: new Date(),
              }),
              findUnique: vi.fn().mockResolvedValue(createMockVentaDb()),
            },
            detalleVenta: {
              create: vi.fn().mockResolvedValue({
                id: 'det-1',
                venta_id: '123e4567-e89b-12d3-a456-426614175000',
                producto_id: '123e4567-e89b-12d3-a456-426614174000',
                cantidad: 3,
                precio_unitario: 250,
                subtotal: 750,
              }),
            },
            producto: {
              update: vi.fn().mockResolvedValue(mockProduct),
            },
          };

          return fn(tx as unknown as typeof mockPrisma);
        }
      );

      const result = await createVenta(
        validVentaInput,
        '123e4567-e89b-12d3-a456-426614174002'
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.total).toBe(750);
        expect(result.value.estado).toBe('completada');
        expect(result.value.usuario_id).toBe(
          '123e4567-e89b-12d3-a456-426614174002'
        );
      }
    });

    it('should return error when product not found', async () => {
      mockPrisma.producto.findMany.mockResolvedValue([]);

      const result = await createVenta(validVentaInput, 'user-id');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });

    it('should return error when stock is insufficient', async () => {
      const lowStockProduct = createMockProductoDb({
        cantidad_disponible: 1,
        codigo: 'LOW-001',
      });
      mockPrisma.producto.findMany.mockResolvedValue([lowStockProduct]);

      const result = await createVenta(validVentaInput, 'user-id');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('STOCK_INSUFFICIENT');
        expect('disponible' in result.error ? result.error.disponible : undefined).toBe(1);
        expect('solicitado' in result.error ? result.error.solicitado : undefined).toBe(3);
      }
    });

    it('should return error when some products not found', async () => {
      // Requesting 2 products but only 1 exists
      const multiProductInput: CreateVentaInput = {
        productos: [
          {
            producto_id: '123e4567-e89b-12d3-a456-426614174000',
            cantidad: 2,
            precio_unitario: 250,
          },
          {
            producto_id: '123e4567-e89b-12d3-a456-426614174099',
            cantidad: 1,
            precio_unitario: 100,
          },
        ],
      };

      mockPrisma.producto.findMany.mockResolvedValue([
        createMockProductoDb(),
      ]);

      const result = await createVenta(multiProductInput, 'user-id');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });

    it('should return error when database transaction fails', async () => {
      const mockProduct = createMockProductoDb();
      mockPrisma.producto.findMany.mockResolvedValue([mockProduct]);
      mockPrisma.$transaction.mockRejectedValue(
        new Error('Transaction failed')
      );

      const result = await createVenta(validVentaInput, 'user-id');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('DATABASE_ERROR');
      }
    });

    it('should calculate total correctly with multiple products', async () => {
      const product1 = createMockProductoDb();
      const product2 = createMockProductoDb({
        id: '123e4567-e89b-12d3-a456-426614174001',
        codigo: 'LEC-002',
        cantidad_disponible: 100,
      });

      const multiInput: CreateVentaInput = {
        productos: [
          {
            producto_id: '123e4567-e89b-12d3-a456-426614174000',
            cantidad: 3,
            precio_unitario: 250,
          },
          {
            producto_id: '123e4567-e89b-12d3-a456-426614174001',
            cantidad: 2,
            precio_unitario: 150,
          },
        ],
      };

      mockPrisma.producto.findMany.mockResolvedValue([product1, product2]);

      const expectedTotal = 3 * 250 + 2 * 150; // 1050

      mockPrisma.$transaction.mockImplementation(
        async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => {
          const ventaCreated = {
            id: '123e4567-e89b-12d3-a456-426614175000',
            usuario_id: '123e4567-e89b-12d3-a456-426614174002',
            total: expectedTotal,
            estado: 'completada',
            created_at: new Date(),
          };
          const tx = {
            venta: {
              create: vi.fn().mockResolvedValue(ventaCreated),
              findUnique: vi.fn().mockResolvedValue({
                ...ventaCreated,
                usuario: {
                  id: '123e4567-e89b-12d3-a456-426614174002',
                  nombre_usuario: 'Juan',
                  nik_usuario: 'jperez',
                },
                detalles_venta: [
                  {
                    id: 'd1',
                    venta_id: ventaCreated.id,
                    producto_id: product1.id,
                    cantidad: 3,
                    precio_unitario: 250,
                    subtotal: 750,
                    producto: { id: product1.id, nombre: product1.nombre, codigo: product1.codigo },
                  },
                  {
                    id: 'd2',
                    venta_id: ventaCreated.id,
                    producto_id: product2.id,
                    cantidad: 2,
                    precio_unitario: 150,
                    subtotal: 300,
                    producto: { id: product2.id, nombre: product2.nombre, codigo: product2.codigo },
                  },
                ],
              }),
            },
            detalleVenta: {
              create: vi.fn().mockResolvedValue({}),
            },
            producto: {
              update: vi.fn().mockResolvedValue({}),
            },
          };
          return fn(tx as unknown as typeof mockPrisma);
        }
      );

      const result = await createVenta(
        multiInput,
        '123e4567-e89b-12d3-a456-426614174002'
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.total).toBe(expectedTotal);
        expect(result.value.detalles_venta).toHaveLength(2);
      }
    });
  });

  describe('getVentaById', () => {
    it('should return sale with details', async () => {
      const mockVenta = createMockVentaDb();
      mockPrisma.venta.findUnique.mockResolvedValue(mockVenta);

      const result = await getVentaById(mockVenta.id);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.id).toBe(mockVenta.id);
        expect(result.value.total).toBe(750);
        expect(result.value.detalles_venta).toHaveLength(1);
        expect(result.value.usuario.nombre_usuario).toBe('Juan Pérez');
      }
    });

    it('should return error when sale not found', async () => {
      mockPrisma.venta.findUnique.mockResolvedValue(null);

      const result = await getVentaById('non-existent-id');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });

    it('should handle database error', async () => {
      mockPrisma.venta.findUnique.mockRejectedValue(
        new Error('DB connection lost')
      );

      const result = await getVentaById('some-id');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('DATABASE_ERROR');
      }
    });
  });

  describe('listVentas', () => {
    it('should return paginated sales', async () => {
      const mockVentas = [
        {
          id: 'v1',
          usuario_id: 'u1',
          total: 500,
          estado: 'completada',
          created_at: new Date(),
          usuario: { nombre_usuario: 'Juan' },
          _count: { detalles_venta: 3 },
        },
        {
          id: 'v2',
          usuario_id: 'u2',
          total: 300,
          estado: 'completada',
          created_at: new Date(),
          usuario: { nombre_usuario: 'María' },
          _count: { detalles_venta: 2 },
        },
      ];
      mockPrisma.venta.findMany.mockResolvedValue(mockVentas);
      mockPrisma.venta.count.mockResolvedValue(2);

      const query: VentaQueryInput = {
        page: 1,
        limit: 20,
        sort: 'created_at',
        order: 'desc',
      };

      const result = await listVentas(query);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.data).toHaveLength(2);
        expect(result.value.pagination.total).toBe(2);
        expect(result.value.pagination.totalPages).toBe(1);
        expect(result.value.data[0]?.usuario_nombre).toBe('Juan');
        expect(result.value.data[0]?.cantidad_items).toBe(3);
      }
    });

    it('should filter by estado', async () => {
      mockPrisma.venta.findMany.mockResolvedValue([]);
      mockPrisma.venta.count.mockResolvedValue(0);

      const query: VentaQueryInput = {
        estado: 'completada',
        page: 1,
        limit: 20,
        sort: 'created_at',
        order: 'desc',
      };

      await listVentas(query);

      expect(mockPrisma.venta.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ estado: 'completada' }),
        })
      );
    });

    it('should filter by usuario_id', async () => {
      mockPrisma.venta.findMany.mockResolvedValue([]);
      mockPrisma.venta.count.mockResolvedValue(0);

      const query: VentaQueryInput = {
        usuario_id: '123e4567-e89b-12d3-a456-426614174002',
        page: 1,
        limit: 20,
        sort: 'created_at',
        order: 'desc',
      };

      await listVentas(query);

      expect(mockPrisma.venta.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            usuario_id: '123e4567-e89b-12d3-a456-426614174002',
          }),
        })
      );
    });

    it('should return empty result when no sales match', async () => {
      mockPrisma.venta.findMany.mockResolvedValue([]);
      mockPrisma.venta.count.mockResolvedValue(0);

      const query: VentaQueryInput = {
        page: 1,
        limit: 20,
        sort: 'created_at',
        order: 'desc',
      };

      const result = await listVentas(query);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.data).toHaveLength(0);
        expect(result.value.pagination.total).toBe(0);
      }
    });

    it('should handle database error', async () => {
      mockPrisma.venta.findMany.mockRejectedValue(new Error('DB error'));

      const query: VentaQueryInput = {
        page: 1,
        limit: 20,
        sort: 'created_at',
        order: 'desc',
      };

      const result = await listVentas(query);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('DATABASE_ERROR');
      }
    });

    it('should filter by cierre_caja_id = null by default (active period)', async () => {
      mockPrisma.venta.findMany.mockResolvedValue([]);
      mockPrisma.venta.count.mockResolvedValue(0);

      const query: VentaQueryInput = {
        page: 1,
        limit: 20,
        sort: 'created_at',
        order: 'desc',
        // cierre_caja_id intentionally omitted (undefined)
      };

      await listVentas(query);

      expect(mockPrisma.venta.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ cierre_caja_id: null }),
        })
      );
    });

    it('should filter by explicit cierre_caja_id when provided', async () => {
      mockPrisma.venta.findMany.mockResolvedValue([]);
      mockPrisma.venta.count.mockResolvedValue(0);

      const cierreId = '550e8400-e29b-41d4-a716-446655440000';
      const query: VentaQueryInput = {
        cierre_caja_id: cierreId,
        page: 1,
        limit: 20,
        sort: 'created_at',
        order: 'desc',
      };

      await listVentas(query);

      expect(mockPrisma.venta.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ cierre_caja_id: cierreId }),
        })
      );
    });

    it('should combine cierre_caja_id filter with estado filter', async () => {
      mockPrisma.venta.findMany.mockResolvedValue([]);
      mockPrisma.venta.count.mockResolvedValue(0);

      const query: VentaQueryInput = {
        estado: 'completada',
        page: 1,
        limit: 20,
        sort: 'created_at',
        order: 'desc',
        // cierre_caja_id omitted → defaults to null
      };

      await listVentas(query);

      expect(mockPrisma.venta.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            estado: 'completada',
            cierre_caja_id: null,
          }),
        })
      );
    });
  });

  describe('getResumenDia', () => {
    it('should return daily summary with sales', async () => {
      const mockVentas = [
        {
          id: 'v1',
          usuario_id: 'u1',
          total: 500,
          estado: 'completada',
          created_at: new Date(),
          usuario: { id: 'u1', nombre_usuario: 'Juan' },
          detalles_venta: [
            {
              id: 'd1',
              venta_id: 'v1',
              producto_id: 'p1',
              cantidad: 2,
              precio_unitario: 250,
              subtotal: 500,
              producto: { id: 'p1', nombre: 'Pan integral' },
            },
          ],
        },
        {
          id: 'v2',
          usuario_id: 'u1',
          total: 300,
          estado: 'completada',
          created_at: new Date(),
          usuario: { id: 'u1', nombre_usuario: 'Juan' },
          detalles_venta: [
            {
              id: 'd2',
              venta_id: 'v2',
              producto_id: 'p2',
              cantidad: 3,
              precio_unitario: 100,
              subtotal: 300,
              producto: { id: 'p2', nombre: 'Leche' },
            },
          ],
        },
        {
          id: 'v3',
          usuario_id: 'u2',
          total: 200,
          estado: 'completada',
          created_at: new Date(),
          usuario: { id: 'u2', nombre_usuario: 'María' },
          detalles_venta: [
            {
              id: 'd3',
              venta_id: 'v3',
              producto_id: 'p1',
              cantidad: 1,
              precio_unitario: 200,
              subtotal: 200,
              producto: { id: 'p1', nombre: 'Pan integral' },
            },
          ],
        },
      ];

      mockPrisma.venta.findMany.mockResolvedValue(mockVentas);

      const result = await getResumenDia();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.total_ventas).toBe(3);
        expect(result.value.monto_total).toBe(1000);

        // Products aggregation
        expect(result.value.productos_vendidos).toHaveLength(2);
        const pan = result.value.productos_vendidos.find(
          (p) => p.producto_id === 'p1'
        );
        expect(pan?.cantidad_total).toBe(3); // 2 + 1
        expect(pan?.monto_total).toBe(700); // 500 + 200

        const leche = result.value.productos_vendidos.find(
          (p) => p.producto_id === 'p2'
        );
        expect(leche?.cantidad_total).toBe(3);
        expect(leche?.monto_total).toBe(300);

        // User aggregation
        expect(result.value.ventas_por_usuario).toHaveLength(2);
        const juan = result.value.ventas_por_usuario.find(
          (u) => u.usuario_id === 'u1'
        );
        expect(juan?.cantidad_ventas).toBe(2);
        expect(juan?.monto_total).toBe(800);

        const maria = result.value.ventas_por_usuario.find(
          (u) => u.usuario_id === 'u2'
        );
        expect(maria?.cantidad_ventas).toBe(1);
        expect(maria?.monto_total).toBe(200);
      }
    });

    it('should return empty summary when no sales today', async () => {
      mockPrisma.venta.findMany.mockResolvedValue([]);

      const result = await getResumenDia();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.total_ventas).toBe(0);
        expect(result.value.monto_total).toBe(0);
        expect(result.value.productos_vendidos).toHaveLength(0);
        expect(result.value.ventas_por_usuario).toHaveLength(0);
      }
    });

    it('should handle database error', async () => {
      mockPrisma.venta.findMany.mockRejectedValue(new Error('DB error'));

      const result = await getResumenDia();

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('DATABASE_ERROR');
      }
    });

    it('should only include completed sales', async () => {
      mockPrisma.venta.findMany.mockResolvedValue([]);

      await getResumenDia();

      expect(mockPrisma.venta.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            estado: 'completada',
            created_at: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        })
      );
    });
  });

  describe('deleteVenta', () => {
    it('should reject deletion of an archived sale (cierre_caja_id != null)', async () => {
      const mockVenta = {
        ...createMockVentaDb(),
        cierre_caja_id: '550e8400-e29b-41d4-a716-446655440000',
        estado: 'completada',
        detalles_venta: [
          {
            id: 'd1',
            venta_id: '123e4567-e89b-12d3-a456-426614175000',
            producto_id: '123e4567-e89b-12d3-a456-426614174000',
            cantidad: 3,
            precio_unitario: 250,
            subtotal: 750,
          },
        ],
      };
      mockPrisma.venta.findUnique.mockResolvedValue(mockVenta);

      const result = await deleteVenta(mockVenta.id);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('CONFLICT');
        expect(result.error.message).toContain('período cerrado');
      }
      // Transaction should NOT be called
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('should allow deletion of a sale from active period (cierre_caja_id = null)', async () => {
      const mockVenta = {
        ...createMockVentaDb(),
        cierre_caja_id: null,
        estado: 'completada',
        detalles_venta: [
          {
            id: 'd1',
            venta_id: '123e4567-e89b-12d3-a456-426614175000',
            producto_id: '123e4567-e89b-12d3-a456-426614174000',
            cantidad: 3,
            precio_unitario: 250,
            subtotal: 750,
          },
        ],
      };
      mockPrisma.venta.findUnique.mockResolvedValue(mockVenta);
      mockPrisma.$transaction.mockImplementation(
        async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => {
          const tx = {
            producto: { update: vi.fn().mockResolvedValue({}) },
            detalleVenta: { deleteMany: vi.fn().mockResolvedValue({}) },
            venta: { delete: vi.fn().mockResolvedValue({}) },
          };
          return fn(tx as unknown as typeof mockPrisma);
        }
      );

      const result = await deleteVenta(mockVenta.id);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.id).toBe(mockVenta.id);
      }
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('should return not found for non-existent sale', async () => {
      mockPrisma.venta.findUnique.mockResolvedValue(null);

      const result = await deleteVenta('non-existent-id');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('cerrarCaja', () => {
    const userId = '123e4567-e89b-12d3-a456-426614174002';
    const correctPassword = 'MyP@ss123';
    const wrongPassword = 'wrongpass';

    it('should close cash register successfully with correct password', async () => {
      const { verifyPassword } = await import(
        '../../../infrastructure/auth/password.js'
      );

      // Mock user lookup
      mockPrisma.usuario.findUnique.mockResolvedValue({
        password_hash: '$2a$10$hashedpassword',
      });
      vi.mocked(verifyPassword).mockResolvedValue(true);

      // Mock open sales
      const mockVentasAbiertas = [
        {
          id: 'v1',
          usuario_id: userId,
          total: 500,
          estado: 'completada',
          created_at: new Date('2024-01-15T10:00:00Z'),
          usuario: { id: userId, nombre_usuario: 'Juan' },
          detalles_venta: [
            {
              id: 'd1',
              venta_id: 'v1',
              producto_id: 'p1',
              cantidad: 2,
              precio_unitario: 250,
              subtotal: 500,
              producto: { id: 'p1', nombre: 'Pan integral' },
            },
          ],
        },
      ];
      mockPrisma.venta.findMany.mockResolvedValue(mockVentasAbiertas);

      // Mock transaction
      mockPrisma.$transaction.mockImplementation(
        async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => {
          const tx = {
            cierreCaja: {
              create: vi.fn().mockResolvedValue({
                id: 'cierre-1',
                monto_total: 500,
                cantidad_ventas: 1,
                fecha_cierre: new Date(),
              }),
            },
            venta: {
              updateMany: vi.fn().mockResolvedValue({}),
            },
          };
          return fn(tx as unknown as typeof mockPrisma);
        }
      );

      const result = await cerrarCaja(userId, correctPassword);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.monto_total).toBe(500);
        expect(result.value.cantidad_ventas).toBe(1);
      }
      expect(verifyPassword).toHaveBeenCalledWith(
        correctPassword,
        '$2a$10$hashedpassword'
      );
    });

    it('should return UNAUTHORIZED with incorrect password', async () => {
      const { verifyPassword } = await import(
        '../../../infrastructure/auth/password.js'
      );

      // Mock user lookup
      mockPrisma.usuario.findUnique.mockResolvedValue({
        password_hash: '$2a$10$hashedpassword',
      });
      vi.mocked(verifyPassword).mockResolvedValue(false);

      const result = await cerrarCaja(userId, wrongPassword);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('UNAUTHORIZED');
        expect(result.error.message).toBe('Contraseña incorrecta');
      }
      // Should NOT query for open sales
      expect(mockPrisma.venta.findMany).not.toHaveBeenCalled();
    });

    it('should return UNAUTHORIZED when user not found', async () => {
      const { verifyPassword } = await import(
        '../../../infrastructure/auth/password.js'
      );

      mockPrisma.usuario.findUnique.mockResolvedValue(null);

      const result = await cerrarCaja('non-existent-user', correctPassword);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('UNAUTHORIZED');
        expect(result.error.message).toBe('Usuario no encontrado');
      }
      expect(verifyPassword).not.toHaveBeenCalled();
    });

    it('should return CONFLICT when no open sales exist', async () => {
      const { verifyPassword } = await import(
        '../../../infrastructure/auth/password.js'
      );

      mockPrisma.usuario.findUnique.mockResolvedValue({
        password_hash: '$2a$10$hashedpassword',
      });
      vi.mocked(verifyPassword).mockResolvedValue(true);
      mockPrisma.venta.findMany.mockResolvedValue([]);

      const result = await cerrarCaja(userId, correctPassword);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('CONFLICT');
        expect(result.error.message).toContain('No hay ventas completadas');
      }
    });
  });
});
