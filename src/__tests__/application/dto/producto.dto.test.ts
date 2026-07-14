// src/__tests__/application/dto/producto.dto.test.ts
// Product DTO validation tests
import { describe, it, expect } from 'vitest';
import {
  CreateProductoSchema,
  UpdateProductoSchema,
  ProductoQuerySchema,
  ProductoIdParamSchema,
} from '../../../application/dto/producto.dto.js';

describe('Producto DTO Validation', () => {
  describe('CreateProductoSchema', () => {
    const validProduct = {
      nombre: 'Pan integral',
      codigo: 'PAN-001',
      cantidad_disponible: 45,
      precio_compra: 150,
      precio_venta: 250,
      rubro_id: '123e4567-e89b-12d3-a456-426614174000',
      proveedor_id: '123e4567-e89b-12d3-a456-426614174001',
    };

    it('should validate a valid product', () => {
      const result = CreateProductoSchema.safeParse(validProduct);
      expect(result.success).toBe(true);
    });

    it('should require nombre', () => {
      const { nombre, ...withoutNombre } = validProduct;
      const result = CreateProductoSchema.safeParse(withoutNombre);
      expect(result.success).toBe(false);
    });

    it('should reject nombre longer than 200 chars', () => {
      const result = CreateProductoSchema.safeParse({
        ...validProduct,
        nombre: 'a'.repeat(201),
      });
      expect(result.success).toBe(false);
    });

    it('should require codigo', () => {
      const { codigo, ...withoutCodigo } = validProduct;
      const result = CreateProductoSchema.safeParse(withoutCodigo);
      expect(result.success).toBe(false);
    });

    it('should reject codigo longer than 50 chars', () => {
      const result = CreateProductoSchema.safeParse({
        ...validProduct,
        codigo: 'a'.repeat(51),
      });
      expect(result.success).toBe(false);
    });

    it('should require cantidad_disponible', () => {
      const { cantidad_disponible, ...withoutCantidad } = validProduct;
      const result = CreateProductoSchema.safeParse(withoutCantidad);
      expect(result.success).toBe(false);
    });

    it('should reject negative cantidad_disponible', () => {
      const result = CreateProductoSchema.safeParse({
        ...validProduct,
        cantidad_disponible: -1,
      });
      expect(result.success).toBe(false);
    });

    it('should require precio_compra', () => {
      const { precio_compra, ...withoutPrecio } = validProduct;
      const result = CreateProductoSchema.safeParse(withoutPrecio);
      expect(result.success).toBe(false);
    });

    it('should reject negative precio_compra', () => {
      const result = CreateProductoSchema.safeParse({
        ...validProduct,
        precio_compra: -1,
      });
      expect(result.success).toBe(false);
    });

    it('should require precio_venta', () => {
      const { precio_venta, ...withoutPrecio } = validProduct;
      const result = CreateProductoSchema.safeParse(withoutPrecio);
      expect(result.success).toBe(false);
    });

    it('should reject negative precio_venta', () => {
      const result = CreateProductoSchema.safeParse({
        ...validProduct,
        precio_venta: -1,
      });
      expect(result.success).toBe(false);
    });

    it('should require rubro_id', () => {
      const { rubro_id, ...withoutRubro } = validProduct;
      const result = CreateProductoSchema.safeParse(withoutRubro);
      expect(result.success).toBe(false);
    });

    it('should reject invalid rubro_id format', () => {
      const result = CreateProductoSchema.safeParse({
        ...validProduct,
        rubro_id: 'invalid-uuid',
      });
      expect(result.success).toBe(false);
    });

    it('should require proveedor_id', () => {
      const { proveedor_id, ...withoutProveedor } = validProduct;
      const result = CreateProductoSchema.safeParse(withoutProveedor);
      expect(result.success).toBe(false);
    });

    it('should reject invalid proveedor_id format', () => {
      const result = CreateProductoSchema.safeParse({
        ...validProduct,
        proveedor_id: 'invalid-uuid',
      });
      expect(result.success).toBe(false);
    });

    it('should accept valid optional fields', () => {
      const result = CreateProductoSchema.safeParse({
        ...validProduct,
        fecha_compra: '2024-01-15',
        fecha_vencimiento: '2024-12-31',
        numero_remesa: 'REM-001',
        unidad_medida: 'kg',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.fecha_compra).toBe('2024-01-15');
        expect(result.data.fecha_vencimiento).toBe('2024-12-31');
      }
    });

    it('should default unidad_medida to unidad', () => {
      const result = CreateProductoSchema.safeParse(validProduct);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.unidad_medida).toBe('unidad');
      }
    });

    it('should accept all unidad_medida values', () => {
      const unidades = ['unidad', 'kg', 'g', 'l', 'ml'];
      for (const unidad of unidades) {
        const result = CreateProductoSchema.safeParse({
          ...validProduct,
          unidad_medida: unidad,
        });
        expect(result.success).toBe(true);
      }
    });
  });

  describe('UpdateProductoSchema', () => {
    it('should validate partial update', () => {
      const result = UpdateProductoSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
        nombre: 'Pan integral actualizado',
      });
      expect(result.success).toBe(true);
    });

    it('should require valid id', () => {
      const result = UpdateProductoSchema.safeParse({
        id: 'invalid-uuid',
        nombre: 'Pan integral',
      });
      expect(result.success).toBe(false);
    });

    it('should allow empty update (only id)', () => {
      const result = UpdateProductoSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('ProductoQuerySchema', () => {
    it('should use default values', () => {
      const result = ProductoQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(20);
        expect(result.data.sort).toBe('created_at');
        expect(result.data.order).toBe('desc');
      }
    });

    it('should parse query parameters', () => {
      const result = ProductoQuerySchema.safeParse({
        search: 'pan',
        rubro_id: '123e4567-e89b-12d3-a456-426614174000',
        page: '2',
        limit: '10',
        sort: 'nombre',
        order: 'asc',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.search).toBe('pan');
        expect(result.data.page).toBe(2);
        expect(result.data.limit).toBe(10);
        expect(result.data.sort).toBe('nombre');
        expect(result.data.order).toBe('asc');
      }
    });

    it('should reject invalid sort field', () => {
      const result = ProductoQuerySchema.safeParse({
        sort: 'invalid_field',
      });
      expect(result.success).toBe(false);
    });

    it('should reject limit > 100', () => {
      const result = ProductoQuerySchema.safeParse({
        limit: '101',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('ProductoIdParamSchema', () => {
    it('should validate valid UUID', () => {
      const result = ProductoIdParamSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const result = ProductoIdParamSchema.safeParse({
        id: 'invalid-uuid',
      });
      expect(result.success).toBe(false);
    });
  });
});
