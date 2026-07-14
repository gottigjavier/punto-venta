// src/__tests__/application/use-cases/proveedor.use-case.test.ts
// Supplier use case tests
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getProveedorById,
  listProveedores,
  createProveedor,
  updateProveedor,
  deleteProveedor,
} from '../../../application/use-cases/proveedor.use-case.js';
import type { ProveedorQueryInput } from '../../../application/dto/proveedor.dto.js';

// Create mock with vi.hoisted so it's available for vi.mock
const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    proveedor: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
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

function createMockProveedor(overrides?: Record<string, unknown>) {
  return {
    id: '123e4567-e89b-12d3-a456-426614174001',
    razon_social: 'Distribuidora Ejemplo S.A.',
    representante: 'Juan Pérez',
    cuit: '30-71234567-9',
    direccion_postal: 'Av. Corrientes 1234',
    email: 'contacto@ejemplo.com',
    telefonos: ['+5491122223333'],
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

const defaultQuery: ProveedorQueryInput = {
  page: 1,
  limit: 20,
  sort: 'created_at',
  order: 'desc',
};

describe('Proveedor Use Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getProveedorById', () => {
    it('should return supplier when found', async () => {
      const mockSupplier = createMockProveedor();
      mockPrisma.proveedor.findUnique.mockResolvedValue(mockSupplier);

      const result = await getProveedorById(mockSupplier.id);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.id).toBe(mockSupplier.id);
        expect(result.value.razon_social).toBe(mockSupplier.razon_social);
      }
    });

    it('should return error when supplier not found', async () => {
      mockPrisma.proveedor.findUnique.mockResolvedValue(null);

      const result = await getProveedorById('non-existent-id');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('listProveedores', () => {
    it('should return paginated suppliers', async () => {
      const mockSuppliers = [createMockProveedor()];
      mockPrisma.proveedor.findMany.mockResolvedValue(mockSuppliers);
      mockPrisma.proveedor.count.mockResolvedValue(1);

      const result = await listProveedores(defaultQuery);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.data).toHaveLength(1);
        expect(result.value.pagination.total).toBe(1);
      }
    });

    it('should apply search filter', async () => {
      mockPrisma.proveedor.findMany.mockResolvedValue([]);
      mockPrisma.proveedor.count.mockResolvedValue(0);

      await listProveedores({ ...defaultQuery, search: 'ejemplo' });

      expect(mockPrisma.proveedor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ razon_social: expect.objectContaining({ contains: 'ejemplo' }) }),
            ]),
          }),
        })
      );
    });
  });

  describe('createProveedor', () => {
    it('should create supplier successfully', async () => {
      const mockSupplier = createMockProveedor();
      mockPrisma.proveedor.findUnique.mockResolvedValue(null);
      mockPrisma.proveedor.create.mockResolvedValue(mockSupplier);

      const result = await createProveedor({
        razon_social: mockSupplier.razon_social,
        cuit: mockSupplier.cuit,
        email: mockSupplier.email,
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.razon_social).toBe(mockSupplier.razon_social);
      }
    });

    it('should return error when CUIT already exists', async () => {
      const existingSupplier = createMockProveedor();
      mockPrisma.proveedor.findUnique.mockResolvedValue(existingSupplier);

      const result = await createProveedor({
        razon_social: 'New Supplier',
        cuit: existingSupplier.cuit,
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('CONFLICT');
      }
    });
  });

  describe('updateProveedor', () => {
    it('should update supplier successfully', async () => {
      const mockSupplier = createMockProveedor();
      mockPrisma.proveedor.findUnique.mockResolvedValue(mockSupplier);
      mockPrisma.proveedor.findFirst.mockResolvedValue(null);
      mockPrisma.proveedor.update.mockResolvedValue({ ...mockSupplier, razon_social: 'Updated' });

      const result = await updateProveedor({
        id: mockSupplier.id,
        razon_social: 'Updated',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.razon_social).toBe('Updated');
      }
    });

    it('should return error when supplier not found', async () => {
      mockPrisma.proveedor.findUnique.mockResolvedValue(null);

      const result = await updateProveedor({
        id: 'non-existent-id',
        razon_social: 'Updated',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });

    it('should return error when CUIT conflicts', async () => {
      const mockSupplier = createMockProveedor();
      mockPrisma.proveedor.findUnique.mockResolvedValue(mockSupplier);
      mockPrisma.proveedor.findFirst.mockResolvedValue({ id: 'other-id' });

      const result = await updateProveedor({
        id: mockSupplier.id,
        cuit: '30-99999999-9',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('CONFLICT');
      }
    });
  });

  describe('deleteProveedor', () => {
    it('should delete supplier successfully', async () => {
      const mockSupplier = createMockProveedor();
      mockPrisma.proveedor.findUnique.mockResolvedValue({
        ...mockSupplier,
        _count: { productos: 0 },
      });
      mockPrisma.proveedor.delete.mockResolvedValue(mockSupplier);

      const result = await deleteProveedor(mockSupplier.id);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.success).toBe(true);
      }
    });

    it('should return error when supplier not found', async () => {
      mockPrisma.proveedor.findUnique.mockResolvedValue(null);

      const result = await deleteProveedor('non-existent-id');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });

    it('should return error when supplier has products', async () => {
      const mockSupplier = createMockProveedor();
      mockPrisma.proveedor.findUnique.mockResolvedValue({
        ...mockSupplier,
        _count: { productos: 5 },
      });

      const result = await deleteProveedor(mockSupplier.id);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
      }
    });
  });
});
