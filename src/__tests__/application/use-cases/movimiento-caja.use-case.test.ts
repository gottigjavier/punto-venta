// src/__tests__/application/use-cases/movimiento-caja.use-case.test.ts
// Cash movements (ingresos/egresos) use case tests
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  crearMovimiento,
  listarMovimientos,
  archivarMovimientos,
} from '../../../application/use-cases/movimiento-caja.use-case.js';

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    movimientoCaja: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
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

function createMockMovimientoDb(overrides?: Record<string, unknown>) {
  return {
    id: 'm1',
    tipo: 'ingreso',
    monto: 1000,
    descripcion: null,
    usuario_id: 'u1',
    cierre_caja_id: null,
    created_at: new Date('2024-01-15T10:00:00Z'),
    usuario: { id: 'u1', nombre_usuario: 'Juan' },
    ...overrides,
  };
}

describe('MovimientoCaja Use Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('crearMovimiento', () => {
    it('should create an ingreso movement in the active period', async () => {
      const mockMovimiento = createMockMovimientoDb({
        tipo: 'ingreso',
        monto: 1000,
        descripcion: 'Apartado de cliente',
      });
      mockPrisma.movimientoCaja.create.mockResolvedValue(mockMovimiento);

      const result = await crearMovimiento(
        { tipo: 'ingreso', monto: 1000, descripcion: 'Apartado de cliente' },
        'u1'
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.id).toBe('m1');
        expect(result.value.tipo).toBe('ingreso');
        expect(result.value.monto).toBe(1000);
        expect(result.value.usuario.nombre_usuario).toBe('Juan');
      }
      expect(mockPrisma.movimientoCaja.create).toHaveBeenCalledWith({
        data: {
          tipo: 'ingreso',
          monto: 1000,
          descripcion: 'Apartado de cliente',
          usuario_id: 'u1',
          cierre_caja_id: null, // periodo activo
        },
        include: {
          usuario: { select: { id: true, nombre_usuario: true } },
        },
      });
    });

    it('should create an egreso movement without descripcion', async () => {
      const mockMovimiento = createMockMovimientoDb({
        tipo: 'egreso',
        monto: 250,
        descripcion: null,
      });
      mockPrisma.movimientoCaja.create.mockResolvedValue(mockMovimiento);

      const result = await crearMovimiento(
        { tipo: 'egreso', monto: 250 },
        'u1'
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.tipo).toBe('egreso');
        expect(result.value.monto).toBe(250);
        expect(result.value.descripcion).toBeNull();
      }
    });

    it('should reject monto <= 0', async () => {
      const result = await crearMovimiento(
        { tipo: 'ingreso', monto: 0 },
        'u1'
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
      }
      expect(mockPrisma.movimientoCaja.create).not.toHaveBeenCalled();
    });

    it('should handle database error', async () => {
      mockPrisma.movimientoCaja.create.mockRejectedValue(
        new Error('DB error')
      );

      const result = await crearMovimiento(
        { tipo: 'ingreso', monto: 100 },
        'u1'
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('DATABASE_ERROR');
      }
    });
  });

  describe('listarMovimientos', () => {
    const defaultQuery = {
      sort: 'created_at',
      order: 'desc',
      page: 1,
      limit: 50,
    };

    it('should return movements with resumen and pagination', async () => {
      const mockPaginated = [
        createMockMovimientoDb({ id: 'm1', tipo: 'ingreso', monto: 1000 }),
        createMockMovimientoDb({ id: 'm2', tipo: 'egreso', monto: 250 }),
      ];
      mockPrisma.movimientoCaja.findMany.mockResolvedValue(mockPaginated);
      mockPrisma.movimientoCaja.count.mockResolvedValue(2);

      const result = await listarMovimientos(defaultQuery);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.data).toHaveLength(2);
        // resumen computed over ALL active movements
        expect(result.value.resumen).toEqual({
          ingresos: 1000,
          egresos: 250,
          total: 750,
        });
        expect(result.value.pagination).toEqual({
          page: 1,
          limit: 50,
          total: 2,
          totalPages: 1,
        });
      }
    });

    it('should handle database error', async () => {
      mockPrisma.movimientoCaja.findMany.mockRejectedValue(
        new Error('DB error')
      );

      const result = await listarMovimientos(defaultQuery);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('DATABASE_ERROR');
      }
    });
  });

  describe('archivarMovimientos', () => {
    it('should archive all active movements to a cierre', async () => {
      mockPrisma.movimientoCaja.updateMany.mockResolvedValue({ count: 3 });

      const tx = { movimientoCaja: mockPrisma.movimientoCaja };
      const result = await archivarMovimientos(
        tx as never,
        'cierre-1'
      );

      expect(result).toEqual({ count: 3 });
      expect(mockPrisma.movimientoCaja.updateMany).toHaveBeenCalledWith({
        where: { cierre_caja_id: null },
        data: { cierre_caja_id: 'cierre-1' },
      });
    });
  });
});
