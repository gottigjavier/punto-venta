// src/__tests__/application/dto/proveedor.dto.test.ts
// Supplier DTO validation tests
import { describe, it, expect } from 'vitest';
import {
  CreateProveedorSchema,
  UpdateProveedorSchema,
  ProveedorQuerySchema,
  ProveedorIdParamSchema,
} from '../../../application/dto/proveedor.dto.js';

describe('Proveedor DTO Validation', () => {
  describe('CreateProveedorSchema', () => {
    const validSupplier = {
      razon_social: 'Distribuidora Ejemplo S.A.',
    };

    it('should validate a valid supplier', () => {
      const result = CreateProveedorSchema.safeParse(validSupplier);
      expect(result.success).toBe(true);
    });

    it('should require razon_social', () => {
      const result = CreateProveedorSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should reject razon_social longer than 200 chars', () => {
      const result = CreateProveedorSchema.safeParse({
        razon_social: 'a'.repeat(201),
      });
      expect(result.success).toBe(false);
    });

    it('should accept valid optional fields', () => {
      const result = CreateProveedorSchema.safeParse({
        ...validSupplier,
        representante: 'Juan Pérez',
        cuit: '30-71234567-9',
        direccion_postal: 'Av. Corrientes 1234',
        email: 'contacto@ejemplo.com',
        telefonos: ['+5491122223333', '+5491144445555'],
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid CUIT format', () => {
      const result = CreateProveedorSchema.safeParse({
        ...validSupplier,
        cuit: '30712345679',
      });
      expect(result.success).toBe(false);
    });

    it('should accept valid CUIT format', () => {
      const result = CreateProveedorSchema.safeParse({
        ...validSupplier,
        cuit: '30-71234567-9',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid email format', () => {
      const result = CreateProveedorSchema.safeParse({
        ...validSupplier,
        email: 'invalid-email',
      });
      expect(result.success).toBe(false);
    });

    it('should accept valid email format', () => {
      const result = CreateProveedorSchema.safeParse({
        ...validSupplier,
        email: 'test@example.com',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('UpdateProveedorSchema', () => {
    it('should validate partial update', () => {
      const result = UpdateProveedorSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
        razon_social: 'Distribuidora Actualizada',
      });
      expect(result.success).toBe(true);
    });

    it('should require valid id', () => {
      const result = UpdateProveedorSchema.safeParse({
        id: 'invalid-uuid',
        razon_social: 'Distribuidora',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('ProveedorQuerySchema', () => {
    it('should use default values', () => {
      const result = ProveedorQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(20);
        expect(result.data.sort).toBe('created_at');
        expect(result.data.order).toBe('desc');
      }
    });

    it('should parse query parameters', () => {
      const result = ProveedorQuerySchema.safeParse({
        search: 'ejemplo',
        page: '2',
        limit: '10',
        sort: 'razon_social',
        order: 'asc',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.search).toBe('ejemplo');
        expect(result.data.page).toBe(2);
        expect(result.data.limit).toBe(10);
      }
    });
  });

  describe('ProveedorIdParamSchema', () => {
    it('should validate valid UUID', () => {
      const result = ProveedorIdParamSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const result = ProveedorIdParamSchema.safeParse({
        id: 'invalid-uuid',
      });
      expect(result.success).toBe(false);
    });
  });
});
