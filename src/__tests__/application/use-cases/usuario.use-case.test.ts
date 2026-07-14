// src/__tests__/application/use-cases/usuario.use-case.test.ts
// User management use case tests
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getUsuarioById,
  listUsuarios,
  createUsuario,
  updateUsuario,
  deactivateUsuario,
} from '../../../application/use-cases/usuario.use-case.js';
import type { UsuarioQueryInput } from '../../../application/dto/usuario.dto.js';

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    usuario: {
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

vi.mock('../../../infrastructure/auth/password.js', () => ({
  hashPassword: vi.fn().mockResolvedValue('hashed-password'),
}));

function createMockUsuario(overrides?: Record<string, unknown>) {
  return {
    id: '123e4567-e89b-12d3-a456-426614174002',
    nombre_usuario: 'Juan Pérez',
    nik_usuario: 'jperez',
    password_hash: '$2a$12$LJ3m4ys3Lz0QvQvQvQvQvOeXz0QvQvQvQvQvQvQvQvQvQvQvQ',
    email: 'juan@ejemplo.com',
    telefono: '+5491122223333',
    rol: 'despachador',
    activo: true,
    intentos_fallidos: 0,
    bloqueado_hasta: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

const defaultQuery: UsuarioQueryInput = {
  page: 1,
  limit: 20,
  sort: 'created_at',
  order: 'desc',
};

describe('Usuario Use Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getUsuarioById', () => {
    it('should return user without password when found', async () => {
      const mockUser = createMockUsuario();
      mockPrisma.usuario.findUnique.mockResolvedValue(mockUser);

      const result = await getUsuarioById(mockUser.id);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.id).toBe(mockUser.id);
        expect(result.value).not.toHaveProperty('password_hash');
      }
    });

    it('should return error when user not found', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(null);

      const result = await getUsuarioById('non-existent-id');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('listUsuarios', () => {
    it('should return paginated users without passwords', async () => {
      const mockUsers = [createMockUsuario()];
      mockPrisma.usuario.findMany.mockResolvedValue(mockUsers);
      mockPrisma.usuario.count.mockResolvedValue(1);

      const result = await listUsuarios(defaultQuery);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.data).toHaveLength(1);
        expect(result.value.data[0]).not.toHaveProperty('password_hash');
      }
    });

    it('should apply role filter', async () => {
      mockPrisma.usuario.findMany.mockResolvedValue([]);
      mockPrisma.usuario.count.mockResolvedValue(0);

      await listUsuarios({ ...defaultQuery, rol: 'admin' });

      expect(mockPrisma.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            rol: 'admin',
          }),
        })
      );
    });
  });

  describe('createUsuario', () => {
    it('should create user successfully', async () => {
      const mockUser = createMockUsuario();
      mockPrisma.usuario.findUnique.mockResolvedValue(null);
      mockPrisma.usuario.create.mockResolvedValue(mockUser);

      const result = await createUsuario({
        nombre_usuario: mockUser.nombre_usuario,
        nik_usuario: mockUser.nik_usuario,
        password: 'Admin123!',
        email: mockUser.email,
        rol: mockUser.rol as 'admin' | 'gerente' | 'despachador',
        activo: true,
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.nik_usuario).toBe(mockUser.nik_usuario);
        expect(result.value).not.toHaveProperty('password_hash');
      }
    });

    it('should return error when nik already exists', async () => {
      const existingUser = createMockUsuario();
      mockPrisma.usuario.findUnique.mockResolvedValue(existingUser);

      const result = await createUsuario({
        nombre_usuario: 'New User',
        nik_usuario: existingUser.nik_usuario,
        password: 'Admin123!',
        email: 'new@ejemplo.com',
        rol: 'despachador',
        activo: true,
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('CONFLICT');
      }
    });
  });

  describe('updateUsuario', () => {
    it('should update user successfully', async () => {
      const mockUser = createMockUsuario();
      mockPrisma.usuario.findUnique.mockResolvedValue(mockUser);
      mockPrisma.usuario.findFirst.mockResolvedValue(null);
      mockPrisma.usuario.update.mockResolvedValue({ ...mockUser, nombre_usuario: 'Updated' });

      const result = await updateUsuario({
        id: mockUser.id,
        nombre_usuario: 'Updated',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.nombre_usuario).toBe('Updated');
      }
    });

    it('should return error when user not found', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(null);

      const result = await updateUsuario({
        id: 'non-existent-id',
        nombre_usuario: 'Updated',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });

    it('should hash password when provided', async () => {
      const mockUser = createMockUsuario();
      mockPrisma.usuario.findUnique.mockResolvedValue(mockUser);
      mockPrisma.usuario.findFirst.mockResolvedValue(null);
      mockPrisma.usuario.update.mockResolvedValue(mockUser);

      await updateUsuario({
        id: mockUser.id,
        password: 'NewPass123!',
      });

      expect(mockPrisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            password_hash: 'hashed-password',
          }),
        })
      );
    });
  });

  describe('deactivateUsuario', () => {
    it('should deactivate user successfully', async () => {
      const mockUser = createMockUsuario();
      mockPrisma.usuario.findUnique.mockResolvedValue(mockUser);
      mockPrisma.usuario.update.mockResolvedValue({ ...mockUser, activo: false });

      const result = await deactivateUsuario(mockUser.id);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.success).toBe(true);
      }
    });

    it('should return error when user not found', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(null);

      const result = await deactivateUsuario('non-existent-id');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });
  });
});
