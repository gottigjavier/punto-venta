// src/__tests__/application/dto/rubro.dto.test.ts
// Rubro DTO validation tests
import { describe, it, expect } from 'vitest';
import {
  CreateRubroSchema,
  UpdateRubroSchema,
  RubroIdParamSchema,
} from '../../../application/dto/rubro.dto.js';

describe('Rubro DTO Validation', () => {
  describe('CreateRubroSchema', () => {
    const validRubro = {
      nombre: 'Panadería',
    };

    it('should validate a valid rubro', () => {
      const result = CreateRubroSchema.safeParse(validRubro);
      expect(result.success).toBe(true);
    });

    it('should require nombre', () => {
      const result = CreateRubroSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should reject nombre longer than 100 chars', () => {
      const result = CreateRubroSchema.safeParse({
        nombre: 'a'.repeat(101),
      });
      expect(result.success).toBe(false);
    });

    it('should accept optional fields', () => {
      const result = CreateRubroSchema.safeParse({
        ...validRubro,
        descripcion: 'Productos de panadería frescos',
        activo: true,
      });
      expect(result.success).toBe(true);
    });

    it('should default activo to true', () => {
      const result = CreateRubroSchema.safeParse(validRubro);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.activo).toBe(true);
      }
    });
  });

  describe('UpdateRubroSchema', () => {
    it('should validate partial update', () => {
      const result = UpdateRubroSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
        nombre: 'Lácteos',
      });
      expect(result.success).toBe(true);
    });

    it('should require valid id', () => {
      const result = UpdateRubroSchema.safeParse({
        id: 'invalid-uuid',
        nombre: 'Lácteos',
      });
      expect(result.success).toBe(false);
    });

    it('should allow empty update (only id)', () => {
      const result = UpdateRubroSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('RubroIdParamSchema', () => {
    it('should validate valid UUID', () => {
      const result = RubroIdParamSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const result = RubroIdParamSchema.safeParse({
        id: 'invalid-uuid',
      });
      expect(result.success).toBe(false);
    });
  });
});
