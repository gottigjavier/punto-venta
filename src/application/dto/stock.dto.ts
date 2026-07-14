// src/application/dto/stock.dto.ts
// Stock management DTOs with Zod validation
import { z } from 'zod';
import { UnidadMedidaSchema } from './producto.dto.js';

// Stock entry (ingreso) schema
export const StockIngresoSchema = z.object({
  nombre: z
    .string()
    .min(1, 'Nombre requerido')
    .max(200, 'Nombre máximo 200 caracteres'),
  codigo: z
    .string()
    .min(1, 'Código requerido')
    .max(50, 'Código máximo 50 caracteres'),
  cantidad: z
    .number()
    .min(0.001, 'Cantidad debe ser mayor a 0'),
  cantidad_aviso: z
    .coerce.number()
    .min(0, 'Cantidad de aviso no puede ser negativa')
    .optional()
    .default(0),
  precio_compra: z
    .number()
    .min(0, 'Precio de compra no puede ser negativo'),
  precio_venta: z
    .number()
    .min(0, 'Precio de venta no puede ser negativo'),
  rubro_id: z
    .string()
    .uuid('ID de rubro inválido'),
  proveedor_id: z
    .string()
    .uuid('ID de proveedor inválido'),
  fecha_compra: z
    .string()
    .optional(),
  fecha_vencimiento: z
    .string()
    .optional(),
  numero_remesa: z
    .string()
    .max(50, 'Número de remesa máximo 50 caracteres')
    .optional(),
  unidad_medida: UnidadMedidaSchema.default('unidad'),
});

export type StockIngresoInput = z.infer<typeof StockIngresoSchema>;

// Stock edit schema (existing product)
export const StockEditSchema = z.object({
  id: z.string().uuid('ID de producto inválido'),
  nombre: z
    .string()
    .min(1, 'Nombre requerido')
    .max(200, 'Nombre máximo 200 caracteres')
    .optional(),
  codigo: z
    .string()
    .min(1, 'Código requerido')
    .max(50, 'Código máximo 50 caracteres')
    .optional(),
  cantidad: z
    .number()
    .min(0, 'Cantidad no puede ser negativa')
    .optional(),
  cantidad_aviso: z
    .coerce.number()
    .min(0, 'Cantidad de aviso no puede ser negativa')
    .optional(),
  precio_compra: z
    .number()
    .min(0, 'Precio de compra no puede ser negativo')
    .optional(),
  precio_venta: z
    .number()
    .min(0, 'Precio de venta no puede ser negativo')
    .optional(),
  rubro_id: z
    .string()
    .uuid('ID de rubro inválido')
    .optional(),
  proveedor_id: z
    .string()
    .uuid('ID de proveedor inválido')
    .optional(),
  fecha_compra: z
    .string()
    .optional(),
  fecha_vencimiento: z
    .string()
    .optional(),
  numero_remesa: z
    .string()
    .max(50, 'Número de remesa máximo 50 caracteres')
    .optional(),
  unidad_medida: UnidadMedidaSchema.optional(),
});

export type StockEditInput = z.infer<typeof StockEditSchema>;

// Stock query params for listing
export const StockQuerySchema = z.object({
  search: z.string().optional(),
  rubro_id: z.string().uuid().optional(),
  vencimiento_dias: z.coerce.number().int().min(1).optional(),
  stock_bajo: z.coerce.boolean().optional(),
  vencidos: z.coerce.boolean().optional(),
  sort: z.enum(['nombre', 'codigo', 'cantidad_disponible', 'cantidad_aviso', 'precio_venta', 'fecha_vencimiento', 'created_at']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type StockQueryInput = z.infer<typeof StockQuerySchema>;

// Stock search for autocomplete
export const StockAutocompleteSchema = z.object({
  query: z.string().min(3, 'Mínimo 3 caracteres para búsqueda'),
  tipo: z.enum(['nombre', 'codigo']).default('nombre'),
});

export type StockAutocompleteInput = z.infer<typeof StockAutocompleteSchema>;
