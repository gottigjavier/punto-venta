// src/__tests__/application/dto/stock.dto.test.ts
// Stock DTO validation tests
// Tras el split Producto/Lote, el ingreso opera sobre LOTES (producto_id +
// numero_lote + cantidad) y el CRUD de lotes usa EditarLoteSchema.
import { describe, it, expect } from 'vitest';
import {
  StockIngresoSchema,
  EditarLoteSchema,
  LoteIdParamSchema,
  StockQuerySchema,
  StockAutocompleteSchema,
} from '../../../application/dto/stock.dto.js';

const PRODUCTO_ID = '123e4567-e89b-12d3-a456-426614174000';

describe('Stock DTO Validation', () => {
  describe('StockIngresoSchema', () => {
    const validIngreso = {
      producto_id: PRODUCTO_ID,
      numero_lote: 'L-001',
      cantidad: 45,
      precio_compra: 150,
    };

    it('should validate a valid stock entry (producto_id + numero_lote + cantidad)', () => {
      const result = StockIngresoSchema.safeParse(validIngreso);
      expect(result.success).toBe(true);
    });

    it('should accept optional fechas and omit them when absent', () => {
      const result = StockIngresoSchema.safeParse({
        ...validIngreso,
        fecha_compra: '2024-01-15',
        fecha_vencimiento: '2024-12-31',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.fecha_compra).toBe('2024-01-15');
        expect(result.data.fecha_vencimiento).toBe('2024-12-31');
      }
    });

    it('should reject legacy payload shape (nombre/codigo/rubro_id)', () => {
      // Un payload con la forma vieja (sin producto_id) debe fallar
      const result = StockIngresoSchema.safeParse({
        nombre: 'Pan integral',
        codigo: 'PAN-001',
        cantidad: 45,
        precio_compra: 150,
        rubro_id: '123e4567-e89b-12d3-a456-426614174010',
        proveedor_id: '123e4567-e89b-12d3-a456-426614174011',
      });
      expect(result.success).toBe(false);
    });

    it('should NOT expose legacy fields in the parsed output', () => {
      // Zod 4 hace strip de keys desconocidas: si mandan codigo/nombre,
      // el output parseado NO los contiene
      const result = StockIngresoSchema.safeParse({
        ...validIngreso,
        codigo: 'LEGACY',
        nombre: 'Legacy',
        rubro_id: 'legacy',
        numero_remesa: 'REM-001',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect('codigo' in result.data).toBe(false);
        expect('nombre' in result.data).toBe(false);
        expect('rubro_id' in result.data).toBe(false);
        expect('numero_remesa' in result.data).toBe(false);
      }
    });

    it('should require producto_id', () => {
      const { producto_id, ...withoutProducto } = validIngreso;
      const result = StockIngresoSchema.safeParse(withoutProducto);
      expect(result.success).toBe(false);
    });

    it('should reject invalid producto_id uuid', () => {
      const result = StockIngresoSchema.safeParse({
        ...validIngreso,
        producto_id: 'not-a-uuid',
      });
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

    it('should accept numero_lote absent (nunca mergea por vencimiento)', () => {
      const { numero_lote, ...sinLote } = validIngreso;
      const result = StockIngresoSchema.safeParse(sinLote);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.numero_lote).toBeUndefined();
      }
    });

    it('should accept numero_lote null', () => {
      const result = StockIngresoSchema.safeParse({
        ...validIngreso,
        numero_lote: null,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.numero_lote).toBeNull();
      }
    });

    it('should transform empty string numero_lote to null', () => {
      const result = StockIngresoSchema.safeParse({
        ...validIngreso,
        numero_lote: '',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.numero_lote).toBeNull();
      }
    });
  });

  describe('EditarLoteSchema', () => {
    it('should validate a partial edit (numero_lote/fechas/precio_compra)', () => {
      const result = EditarLoteSchema.safeParse({
        numero_lote: 'L-001-actualizado',
        fecha_compra: '2024-02-01',
        fecha_vencimiento: '2025-01-31',
        precio_compra: 130,
      });
      expect(result.success).toBe(true);
    });

    it('should allow empty edit', () => {
      const result = EditarLoteSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should reject negative precio_compra', () => {
      const result = EditarLoteSchema.safeParse({ precio_compra: -1 });
      expect(result.success).toBe(false);
    });

    it('should NOT accept cantidad/cantidad_disponible (el stock solo cambia por ingreso/venta)', () => {
      // Zod 4 hace strip de keys desconocidas: cantidad queda fuera del output
      const result = EditarLoteSchema.safeParse({
        cantidad: 5,
        cantidad_disponible: 7,
        precio_compra: 130,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect('cantidad' in result.data).toBe(false);
        expect('cantidad_disponible' in result.data).toBe(false);
        expect(result.data.precio_compra).toBe(130);
      }
    });
  });

  describe('LoteIdParamSchema', () => {
    it('should validate a valid UUID', () => {
      const result = LoteIdParamSchema.safeParse({ id: PRODUCTO_ID });
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const result = LoteIdParamSchema.safeParse({ id: 'invalid-uuid' });
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
        expect(result.data.archivados).toBeUndefined();
        expect(result.data.sort).toBe('created_at');
        expect(result.data.order).toBe('desc');
      }
    });

    it('should parse query parameters (sin legacy)', () => {
      const result = StockQuerySchema.safeParse({
        search: 'pan',
        rubro_id: PRODUCTO_ID,
        archivados: 'true',
        page: '2',
        limit: '10',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.search).toBe('pan');
        expect(result.data.archivados).toBe('true');
      }
    });

    it('should accept archivados=true y archivados=false', () => {
      expect(StockQuerySchema.safeParse({ archivados: 'true' }).success).toBe(true);
      const f = StockQuerySchema.safeParse({ archivados: 'false' });
      expect(f.success).toBe(true);
      if (f.success) {
        expect(f.data.archivados).toBe('false');
      }
    });

    it('should leave archivados undefined when absent', () => {
      const result = StockQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.archivados).toBeUndefined();
      }
    });

    it('should strip legacy params vencidos/stock_bajo/vencimiento_dias (NFR-02)', () => {
      const result = StockQuerySchema.safeParse({
        vencidos: 'true',
        stock_bajo: 'true',
        vencimiento_dias: '30',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).not.toHaveProperty('vencidos');
        expect(result.data).not.toHaveProperty('stock_bajo');
        expect(result.data).not.toHaveProperty('vencimiento_dias');
        expect(result.data.archivados).toBeUndefined();
      }
    });

    it('should accept sort keys de lote', () => {
      const result = StockQuerySchema.safeParse({ sort: 'numero_lote' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sort).toBe('numero_lote');
      }
    });

    it('should reject sort keys legacy de producto', () => {
      const result = StockQuerySchema.safeParse({ sort: 'cantidad_aviso' });
      expect(result.success).toBe(false);
    });

    it('should reject archivados=banana (valor no booleano → 400)', () => {
      const result = StockQuerySchema.safeParse({ archivados: 'banana' });
      expect(result.success).toBe(false);
    });
  });

  describe('StockAutocompleteSchema', () => {
    it('should validate valid autocomplete query', () => {
      const result = StockAutocompleteSchema.safeParse({ query: 'pan' });
      expect(result.success).toBe(true);
    });

    it('should require minimum 3 characters', () => {
      const result = StockAutocompleteSchema.safeParse({ query: 'pa' });
      expect(result.success).toBe(false);
    });

    it('should default tipo to nombre', () => {
      const result = StockAutocompleteSchema.safeParse({ query: 'pan' });
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