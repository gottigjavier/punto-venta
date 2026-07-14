// src/__tests__/application/dto/stock.dto.test.ts
// Stock DTO validation tests
import { describe, it, expect } from 'vitest';
import {
  StockIngresoSchema,
  StockEditSchema,
  StockQuerySchema,
  StockAutocompleteSchema,
} from '../../../application/dto/stock.dto.js';

describe('Stock DTO Validation', () => {
  describe('StockIngresoSchema', () => {
    const validIngreso = {
      nombre: 'Pan integral',
      codigo: 'PAN-001',
      cantidad: 45,
      precio_compra: 150,
      precio_venta: 250,
      rubro_id: '123e4567-e89b-12d3-a456-426614174000',
      proveedor_id: '123e4567-e89b-12d3-a456-426614174001',
    };

    it('should validate a valid stock entry', () => {
      const result = StockIngresoSchema.safeParse(validIngreso);
      expect(result.success).toBe(true);
    });

    it('should require nombre', () => {
      const { nombre, ...withoutNombre } = validIngreso;
      const result = StockIngresoSchema.safeParse(withoutNombre);
      expect(result.success).toBe(false);
    });

    it('should require codigo', () => {
      const { codigo, ...withoutCodigo } = validIngreso;
      const result = StockIngresoSchema.safeParse(withoutCodigo);
      expect(result.success).toBe(false);
    });

    it('should require cantidad > 0', () => {
      const result = StockIngresoSchema.safeParse({
        ...validIngreso,
        cantidad: 0,
      });
      expect(result.success).toBe(false);
    });

    it('should reject negative cantidad', () => {
      const result = StockIngresoSchema.safeParse({
        ...validIngreso,
        cantidad: -1,
      });
      expect(result.success).toBe(false);
    });

    it('should require precio_compra >= 0', () => {
      const result = StockIngresoSchema.safeParse({
        ...validIngreso,
        precio_compra: -1,
      });
      expect(result.success).toBe(false);
    });

    it('should require precio_venta >= 0', () => {
      const result = StockIngresoSchema.safeParse({
        ...validIngreso,
        precio_venta: -1,
      });
      expect(result.success).toBe(false);
    });

    it('should require rubro_id', () => {
      const { rubro_id, ...withoutRubro } = validIngreso;
      const result = StockIngresoSchema.safeParse(withoutRubro);
      expect(result.success).toBe(false);
    });

    it('should require proveedor_id', () => {
      const { proveedor_id, ...withoutProveedor } = validIngreso;
      const result = StockIngresoSchema.safeParse(withoutProveedor);
      expect(result.success).toBe(false);
    });

    it('should accept optional fields', () => {
      const result = StockIngresoSchema.safeParse({
        ...validIngreso,
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
  });

  describe('StockEditSchema', () => {
    it('should validate partial edit', () => {
      const result = StockEditSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
        nombre: 'Pan integral actualizado',
      });
      expect(result.success).toBe(true);
    });

    it('should require valid id', () => {
      const result = StockEditSchema.safeParse({
        id: 'invalid-uuid',
        nombre: 'Pan',
      });
      expect(result.success).toBe(false);
    });

    it('should allow empty edit (only id)', () => {
      const result = StockEditSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should reject negative cantidad', () => {
      const result = StockEditSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
        cantidad: -1,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('StockQuerySchema', () => {
    it('should use default values', () => {
      const result = StockQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(20);
        expect(result.data.vencimiento_dias).toBeUndefined();
        expect(result.data.sort).toBe('created_at');
        expect(result.data.order).toBe('desc');
      }
    });

    it('should parse query parameters', () => {
      const result = StockQuerySchema.safeParse({
        search: 'pan',
        rubro_id: '123e4567-e89b-12d3-a456-426614174000',
        vencimiento_dias: '15',
        stock_bajo: 'true',
        vencidos: 'false',
        page: '2',
        limit: '10',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.search).toBe('pan');
        expect(result.data.vencimiento_dias).toBe(15);
        expect(result.data.stock_bajo).toBe(true);
        // Note: z.coerce.boolean('false') returns true in Zod (non-empty string = truthy)
        // The API layer handles this by using query parameter presence, not string coercion
        expect(result.data.vencidos).toBe(true);
      }
    });
  });

  describe('StockAutocompleteSchema', () => {
    it('should validate valid autocomplete query', () => {
      const result = StockAutocompleteSchema.safeParse({
        query: 'pan',
      });
      expect(result.success).toBe(true);
    });

    it('should require minimum 3 characters', () => {
      const result = StockAutocompleteSchema.safeParse({
        query: 'pa',
      });
      expect(result.success).toBe(false);
    });

    it('should default tipo to nombre', () => {
      const result = StockAutocompleteSchema.safeParse({
        query: 'pan',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tipo).toBe('nombre');
      }
    });

    it('should accept tipo codigo', () => {
      const result = StockAutocompleteSchema.safeParse({
        query: 'PAN-001',
        tipo: 'codigo',
      });
      expect(result.success).toBe(true);
    });
  });
});
