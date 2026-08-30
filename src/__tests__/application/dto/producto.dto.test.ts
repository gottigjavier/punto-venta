// src/__tests__/application/dto/producto.dto.test.ts
// Product DTO validation tests
// Tras el split Producto/Lote: el producto es el maestro (sin stock/compra/
// vencimiento). CreateProductoSchema solo acepta datos generales.
import { describe, it, expect } from 'vitest';
import {
  UnidadMedidaSchema,
  CreateProductoSchema,
  UpdateProductoSchema,
  ProductoQuerySchema,
  ProductoIdParamSchema,
  StockSearchSchema,
} from '../../../application/dto/producto.dto.js';

const RUBRO_ID = '123e4567-e89b-12d3-a456-426614174010';
const PROVEEDOR_ID = '123e4567-e89b-12d3-a456-426614174011';
const PRODUCTO_ID = '123e4567-e89b-12d3-a456-426614174000';

describe('Producto DTO Validation', () => {
  describe('UnidadMedidaSchema', () => {
    it('should accept valid unidades de medida', () => {
      for (const unidad of ['unidad', 'kg', 'g', 'l', 'ml']) {
        expect(UnidadMedidaSchema.safeParse(unidad).success).toBe(true);
      }
    });

    it('should reject invalid unidad de medida', () => {
      expect(UnidadMedidaSchema.safeParse('caja').success).toBe(false);
    });
  });

  describe('CreateProductoSchema', () => {
    const validProducto = {
      nombre: 'Pan integral',
      codigo: 'PAN-001',
      cantidad_aviso: 10,
      precio_venta: 250,
      rubro_id: RUBRO_ID,
      proveedor_id: PROVEEDOR_ID,
      unidad_medida: 'unidad',
    };

    it('should validate a valid product (sin datos de stock/compra)', () => {
      const result = CreateProductoSchema.safeParse(validProducto);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.nombre).toBe('Pan integral');
        expect(result.data.unidad_medida).toBe('unidad');
      }
    });

    it('should default cantidad_aviso y unidad_medida', () => {
      const result = CreateProductoSchema.safeParse({
        nombre: 'Pan integral',
        codigo: 'PAN-002',
        precio_venta: 250,
        rubro_id: RUBRO_ID,
        proveedor_id: PROVEEDOR_ID,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.cantidad_aviso).toBe(0);
        expect(result.data.unidad_medida).toBe('unidad');
      }
    });

    it('should reject legacy payload shape (stock_inicial/cantidad_disponible/precio_compra)', () => {
      // Un payload con la forma vieja (faltan nombre/codigo/precio_venta/
      // rubro_id/proveedor_id) debe fallar
      const result = CreateProductoSchema.safeParse({
        nombre: 'Pan integral',
        stock_inicial: 45,
        precio_compra: 150,
        cantidad_disponible: 45,
        fecha_compra: '2024-01-15',
        fecha_vencimiento: '2024-12-31',
      });
      expect(result.success).toBe(false);
    });

    it('should NOT expose legacy fields in the parsed output', () => {
      // Zod 4 hace strip de keys desconocidas: vencimiento/stock quedan fuera
      const result = CreateProductoSchema.safeParse({
        ...validProducto,
        stock_inicial: 45,
        precio_compra: 150,
        cantidad_disponible: 45,
        fecha_vencimiento: '2024-12-31',
        numero_remesa: 'REM-001',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect('stock_inicial' in result.data).toBe(false);
        expect('precio_compra' in result.data).toBe(false);
        expect('cantidad_disponible' in result.data).toBe(false);
        expect('fecha_vencimiento' in result.data).toBe(false);
        expect('numero_remesa' in result.data).toBe(false);
      }
    });

    it('should require nombre', () => {
      const { nombre, ...sinNombre } = validProducto;
      expect(CreateProductoSchema.safeParse(sinNombre).success).toBe(false);
    });

    it('should require precio_venta', () => {
      const { precio_venta, ...sinPrecio } = validProducto;
      expect(CreateProductoSchema.safeParse(sinPrecio).success).toBe(false);
    });

    it('should reject negative precio_venta', () => {
      expect(
        CreateProductoSchema.safeParse({ ...validProducto, precio_venta: -1 }).success
      ).toBe(false);
    });

    it('should reject negative cantidad_aviso', () => {
      expect(
        CreateProductoSchema.safeParse({ ...validProducto, cantidad_aviso: -1 }).success
      ).toBe(false);
    });

    it('should require rubro_id and proveedor_id as valid UUIDs', () => {
      expect(
        CreateProductoSchema.safeParse({ ...validProducto, rubro_id: 'no-uuid' }).success
      ).toBe(false);
      expect(
        CreateProductoSchema.safeParse({ ...validProducto, proveedor_id: 'no-uuid' }).success
      ).toBe(false);
    });
  });

  describe('UpdateProductoSchema', () => {
    it('should require id', () => {
      const result = UpdateProductoSchema.safeParse({
        nombre: 'Nuevo nombre',
      });
      expect(result.success).toBe(false);
    });

    it('should accept partial fields with id', () => {
      const result = UpdateProductoSchema.safeParse({
        id: PRODUCTO_ID,
        nombre: 'Nuevo nombre',
      });
      expect(result.success).toBe(true);
    });

    it('should NOT accept stock/compra legacy fields', () => {
      const result = UpdateProductoSchema.safeParse({
        id: PRODUCTO_ID,
        cantidad_disponible: 99,
        precio_compra: 5,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect('cantidad_disponible' in result.data).toBe(false);
        expect('precio_compra' in result.data).toBe(false);
      }
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

    it('should parse query parameters (incl. sort por maestro cantidad_aviso)', () => {
      const result = ProductoQuerySchema.safeParse({
        search: 'pan',
        rubro_id: RUBRO_ID,
        sort: 'cantidad_aviso',
        order: 'asc',
        page: '2',
        limit: '10',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.search).toBe('pan');
        expect(result.data.sort).toBe('cantidad_aviso');
        expect(result.data.page).toBe(2);
      }
    });

    it('should transform fecha_desde/fecha_hasta to Date', () => {
      const result = ProductoQuerySchema.safeParse({
        fecha_desde: '2024-01-01',
        fecha_hasta: '2024-12-31',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.fecha_desde).toBeInstanceOf(Date);
        expect(result.data.fecha_hasta).toBeInstanceOf(Date);
      }
    });

    it('should reject sort keys de lote (stock en lote no es campo de producto)', () => {
      const result = ProductoQuerySchema.safeParse({ sort: 'numero_lote' });
      expect(result.success).toBe(false);
    });
  });

  describe('ProductoIdParamSchema', () => {
    it('should validate a valid UUID', () => {
      expect(ProductoIdParamSchema.safeParse({ id: PRODUCTO_ID }).success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      expect(ProductoIdParamSchema.safeParse({ id: 'invalid' }).success).toBe(false);
    });
  });

  describe('StockSearchSchema', () => {
    it('should validate query with 3+ chars', () => {
      expect(StockSearchSchema.safeParse({ query: 'pan' }).success).toBe(true);
    });

    it('should reject short query', () => {
      expect(StockSearchSchema.safeParse({ query: 'pa' }).success).toBe(false);
    });
  });
});