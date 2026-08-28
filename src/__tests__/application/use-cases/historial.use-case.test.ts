// src/__tests__/application/use-cases/historial.use-case.test.ts
// Tests for the unified historial use case (sales + cash movements)
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { historialUnificado } from '../../../application/use-cases/historial.use-case.js';

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    venta: {
      findMany: vi.fn(),
    },
    movimientoCaja: {
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

// --- Mock factories ---

function createMockVentaDb(overrides?: Record<string, unknown>) {
  return {
    id: 'v1',
    total: 5000,
    estado: 'completada',
    created_at: new Date('2024-01-15T10:00:00Z'),
    usuario_id: 'u1',
    cierre_caja_id: null,
    _count: { detalles_venta: 2 },
    usuario: { nombre_usuario: 'Juan' },
    ...overrides,
  };
}

function createMockMovimientoDb(overrides?: Record<string, unknown>) {
  return {
    id: 'm1',
    tipo: 'ingreso' as const,
    monto: 1000,
    cierre_caja_id: null,
    created_at: new Date('2024-01-14T10:00:00Z'),
    usuario: { nombre_usuario: 'Ana' },
    ...overrides,
  };
}

// --- Tests ---

describe('historialUnificado', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should merge ventas and movimientos into a single array', async () => {
    mockPrisma.venta.findMany.mockResolvedValue([
      createMockVentaDb({ id: 'v1', total: 5000 }),
      createMockVentaDb({ id: 'v2', total: 3000 }),
    ]);
    mockPrisma.movimientoCaja.findMany.mockResolvedValue([
      createMockMovimientoDb({ id: 'm1', tipo: 'egreso', monto: 200 }),
    ]);

    const result = await historialUnificado({
      page: 1,
      limit: 10,
      sort: 'created_at',
      order: 'desc',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.data).toHaveLength(3);
      const tipos = result.value.data.map((f) => f.tipo_fila);
      expect(tipos).toContain('venta');
      expect(tipos).toContain('movimiento');
      // 2 ventas then 1 movimiento (order they were mapped)
      expect(result.value.data[0].id).toBe('v1');
      expect(result.value.data[2].id).toBe('m1');
      expect(result.value.pagination.total).toBe(3);
      expect(result.value.pagination.totalPages).toBe(1);
    }
  });

  it('should filter by tipo_fila', async () => {
    mockPrisma.venta.findMany.mockResolvedValue([
      createMockVentaDb({ id: 'v1', total: 5000 }),
    ]);
    mockPrisma.movimientoCaja.findMany.mockResolvedValue([
      createMockMovimientoDb({ id: 'm1', tipo: 'egreso', monto: 200 }),
    ]);

    const result = await historialUnificado({
      page: 1,
      limit: 10,
      sort: 'created_at',
      order: 'desc',
      tipo_fila: 'venta',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.data).toHaveLength(1);
      expect(result.value.data[0].tipo_fila).toBe('venta');
      expect(result.value.data[0].id).toBe('v1');
      // ensure movimiento was never matched
      expect(result.value.data.every((f) => f.tipo_fila === 'venta')).toBe(true);
    }
  });

  it('should paginate correctly', async () => {
    mockPrisma.venta.findMany.mockResolvedValue([
      createMockVentaDb({ id: 'v1' }),
    ]);
    mockPrisma.movimientoCaja.findMany.mockResolvedValue([
      createMockMovimientoDb({ id: 'm1' }),
    ]);

    const result = await historialUnificado({
      page: 1,
      limit: 1,
      sort: 'created_at',
      order: 'desc',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.data).toHaveLength(1);
      expect(result.value.pagination.total).toBe(2);
      expect(result.value.pagination.totalPages).toBe(2);
      expect(result.value.pagination.page).toBe(1);
      expect(result.value.pagination.limit).toBe(1);
    }
  });

  it('should order by monto (by absolute value)', async () => {
    mockPrisma.venta.findMany.mockResolvedValue([
      createMockVentaDb({ id: 'v1', total: 500 }),
    ]);
    mockPrisma.movimientoCaja.findMany.mockResolvedValue([
      createMockMovimientoDb({ id: 'm1', tipo: 'egreso', monto: 1000 }),
    ]);

    const result = await historialUnificado({
      page: 1,
      limit: 10,
      sort: 'monto',
      order: 'desc',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      // m1 abs(1000) > v1 abs(500)
      expect(result.value.data[0].id).toBe('m1');
      expect(result.value.data[1].id).toBe('v1');
    }
  });

  it('should return DATABASE_ERROR when prisma fails', async () => {
    mockPrisma.venta.findMany.mockRejectedValue(new Error('DB error'));
    mockPrisma.movimientoCaja.findMany.mockRejectedValue(new Error('DB error'));

    const result = await historialUnificado({
      page: 1,
      limit: 10,
      sort: 'created_at',
      order: 'desc',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('DATABASE_ERROR');
    }
  });
});
