// src/__tests__/application/use-cases/rubro.use-case.test.ts
// Rubro use case tests
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  listRubros,
  getRubroById,
  createRubro,
  updateRubro,
  deleteRubro,
} from '../../../application/use-cases/rubro.use-case.js';

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    rubro: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
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

function createMockRubro(overrides?: Record<string, unknown>) {
  return {
    id: '123e4567-e89b-12d3-a456-426614174010',
    nombre: 'Panadería',
    descripcion: 'Productos de panadería',
    activo: true,
    created_at: new Date(),
    updated_at: new Date(),
    _count: {
      productos: 5,
    },
    ...overrides,
  };
}

describe('Rubro Use Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listRubros', () => {
    it('should return all rubros', async () => {
      const mockRubros = [createMockRubro(), createMockRubro({ id: 'another-id', nombre: 'Lácteos' })];
      mockPrisma.rubro.findMany.mockResolvedValue(mockRubros);

      const result = await listRubros();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(2);
      }
    });

    it('should handle empty list', async () => {
      mockPrisma.rubro.findMany.mockResolvedValue([]);

      const result = await listRubros();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(0);
      }
    });
  });

  describe('getRubroById', () => {
    it('should return rubro when found', async () => {
      const mockRubro = createMockRubro();
      mockPrisma.rubro.findUnique.mockResolvedValue(mockRubro);

      const result = await getRubroById(mockRubro.id);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.id).toBe(mockRubro.id);
        expect(result.value.nombre).toBe(mockRubro.nombre);
      }
    });

    it('should return error when rubro not found', async () => {
      mockPrisma.rubro.findUnique.mockResolvedValue(null);

      const result = await getRubroById('non-existent-id');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('createRubro', () => {
    it('should create rubro successfully', async () => {
      const mockRubro = createMockRubro();
      mockPrisma.rubro.findUnique.mockResolvedValue(null);
      mockPrisma.rubro.create.mockResolvedValue(mockRubro);

      const result = await createRubro({
        nombre: mockRubro.nombre,
        descripcion: mockRubro.descripcion,
        activo: true,
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.nombre).toBe(mockRubro.nombre);
      }
    });

    it('should return error when name already exists', async () => {
      const existingRubro = createMockRubro();
      mockPrisma.rubro.findUnique.mockResolvedValue(existingRubro);

      const result = await createRubro({
        nombre: existingRubro.nombre,
        activo: true,
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('CONFLICT');
      }
    });
  });

  describe('updateRubro', () => {
    it('should update rubro successfully', async () => {
      const mockRubro = createMockRubro();
      mockPrisma.rubro.findUnique.mockResolvedValue(mockRubro);
      mockPrisma.rubro.findFirst.mockResolvedValue(null);
      mockPrisma.rubro.update.mockResolvedValue({ ...mockRubro, nombre: 'Updated' });

      const result = await updateRubro({
        id: mockRubro.id,
        nombre: 'Updated',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.nombre).toBe('Updated');
      }
    });

    it('should return error when rubro not found', async () => {
      mockPrisma.rubro.findUnique.mockResolvedValue(null);

      const result = await updateRubro({
        id: 'non-existent-id',
        nombre: 'Updated',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });

    it('should return error when name conflicts', async () => {
      const mockRubro = createMockRubro();
      mockPrisma.rubro.findUnique.mockResolvedValue(mockRubro);
      mockPrisma.rubro.findFirst.mockResolvedValue({ id: 'other-id' });

      const result = await updateRubro({
        id: mockRubro.id,
        nombre: 'Existing Name',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('CONFLICT');
      }
    });
  });

  describe('deleteRubro', () => {
    it('should delete rubro successfully', async () => {
      const mockRubro = createMockRubro();
      mockPrisma.rubro.findUnique.mockResolvedValue({
        ...mockRubro,
        _count: { productos: 0 },
      });
      mockPrisma.rubro.delete.mockResolvedValue(mockRubro);

      const result = await deleteRubro(mockRubro.id);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.success).toBe(true);
      }
    });

    it('should return error when rubro not found', async () => {
      mockPrisma.rubro.findUnique.mockResolvedValue(null);

      const result = await deleteRubro('non-existent-id');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });

    it('should return error when rubro has products', async () => {
      const mockRubro = createMockRubro();
      mockPrisma.rubro.findUnique.mockResolvedValue({
        ...mockRubro,
        _count: { productos: 5 },
      });

      const result = await deleteRubro(mockRubro.id);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
      }
    });
  });
});
