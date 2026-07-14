// src/__tests__/application/dto/usuario.dto.test.ts
// User DTO validation tests
import { describe, it, expect } from 'vitest';
import {
  CreateUsuarioSchema,
  UpdateUsuarioSchema,
  UsuarioQuerySchema,
  UsuarioIdParamSchema,
} from '../../../application/dto/usuario.dto.js';

describe('Usuario DTO Validation', () => {
  describe('CreateUsuarioSchema', () => {
    const validUser = {
      nombre_usuario: 'Juan Pérez',
      nik_usuario: 'jperez',
      password: 'Admin123!',
      email: 'juan@ejemplo.com',
      rol: 'despachador' as const,
    };

    it('should validate a valid user', () => {
      const result = CreateUsuarioSchema.safeParse(validUser);
      expect(result.success).toBe(true);
    });

    it('should require nombre_usuario', () => {
      const { nombre_usuario, ...withoutNombre } = validUser;
      const result = CreateUsuarioSchema.safeParse(withoutNombre);
      expect(result.success).toBe(false);
    });

    it('should require nik_usuario', () => {
      const { nik_usuario, ...withoutNik } = validUser;
      const result = CreateUsuarioSchema.safeParse(withoutNik);
      expect(result.success).toBe(false);
    });

    it('should require password', () => {
      const { password, ...withoutPassword } = validUser;
      const result = CreateUsuarioSchema.safeParse(withoutPassword);
      expect(result.success).toBe(false);
    });

    it('should reject weak password', () => {
      const result = CreateUsuarioSchema.safeParse({
        ...validUser,
        password: 'weak',
      });
      expect(result.success).toBe(false);
    });

    it('should require uppercase in password', () => {
      const result = CreateUsuarioSchema.safeParse({
        ...validUser,
        password: 'admin123!',
      });
      expect(result.success).toBe(false);
    });

    it('should require number in password', () => {
      const result = CreateUsuarioSchema.safeParse({
        ...validUser,
        password: 'Admin!',
      });
      expect(result.success).toBe(false);
    });

    it('should require special character in password', () => {
      const result = CreateUsuarioSchema.safeParse({
        ...validUser,
        password: 'Admin123',
      });
      expect(result.success).toBe(false);
    });

    it('should require email', () => {
      const { email, ...withoutEmail } = validUser;
      const result = CreateUsuarioSchema.safeParse(withoutEmail);
      expect(result.success).toBe(false);
    });

    it('should reject invalid email format', () => {
      const result = CreateUsuarioSchema.safeParse({
        ...validUser,
        email: 'invalid-email',
      });
      expect(result.success).toBe(false);
    });

    it('should require rol', () => {
      const { rol, ...withoutRol } = validUser;
      const result = CreateUsuarioSchema.safeParse(withoutRol);
      expect(result.success).toBe(false);
    });

    it('should accept all valid roles', () => {
      const roles = ['admin', 'gerente', 'despachador'];
      for (const rol of roles) {
        const result = CreateUsuarioSchema.safeParse({
          ...validUser,
          rol,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid role', () => {
      const result = CreateUsuarioSchema.safeParse({
        ...validUser,
        rol: 'invalid_role',
      });
      expect(result.success).toBe(false);
    });

    it('should accept optional telefono', () => {
      const result = CreateUsuarioSchema.safeParse({
        ...validUser,
        telefono: '+5491122223333',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('UpdateUsuarioSchema', () => {
    it('should validate partial update', () => {
      const result = UpdateUsuarioSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
        nombre_usuario: 'Juan Pérez Actualizado',
      });
      expect(result.success).toBe(true);
    });

    it('should require valid id', () => {
      const result = UpdateUsuarioSchema.safeParse({
        id: 'invalid-uuid',
        nombre_usuario: 'Juan',
      });
      expect(result.success).toBe(false);
    });

    it('should allow password update', () => {
      const result = UpdateUsuarioSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
        password: 'NewPass123!',
      });
      expect(result.success).toBe(true);
    });

    it('should reject weak password on update', () => {
      const result = UpdateUsuarioSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
        password: 'weak',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('UsuarioQuerySchema', () => {
    it('should use default values', () => {
      const result = UsuarioQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(20);
        expect(result.data.sort).toBe('created_at');
        expect(result.data.order).toBe('desc');
      }
    });

    it('should parse query parameters', () => {
      const result = UsuarioQuerySchema.safeParse({
        search: 'juan',
        rol: 'admin',
        activo: 'true',
        page: '2',
        limit: '10',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.search).toBe('juan');
        expect(result.data.rol).toBe('admin');
        expect(result.data.activo).toBe(true);
        expect(result.data.page).toBe(2);
        expect(result.data.limit).toBe(10);
      }
    });
  });

  describe('UsuarioIdParamSchema', () => {
    it('should validate valid UUID', () => {
      const result = UsuarioIdParamSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const result = UsuarioIdParamSchema.safeParse({
        id: 'invalid-uuid',
      });
      expect(result.success).toBe(false);
    });
  });
});
