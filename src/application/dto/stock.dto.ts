// src/application/dto/stock.dto.ts
// Stock management DTOs with Zod validation
// Tras el split Producto/Lote, el "ingreso de stock" opera sobre LOTES.
import { z } from 'zod';

// Stock entry (ingreso) schema — crea o SUMA un lote del producto
export const StockIngresoSchema = z.object({
  producto_id: z
    .string()
    .uuid('ID de producto inválido'),
  numero_lote: z
    .string()
    .max(50, 'Número de lote máximo 50 caracteres')
    .nullable()
    .optional()
    .transform((v) => (v === '' ? null : v)),
  cantidad: z
    .number()
    .positive('Cantidad debe ser mayor a 0'),
  fecha_compra: z
    .string()
    .optional()
    .nullable(),
  fecha_vencimiento: z
    .string()
    .optional()
    .nullable(),
  precio_compra: z
    .number()
    .min(0, 'Precio de compra no puede ser negativo'),
  cantidad_aviso: z
    .coerce.number()
    .min(0, 'Cantidad de aviso no puede ser negativa')
    .optional(),
});

export type StockIngresoInput = z.infer<typeof StockIngresoSchema>;

// Editar lote — NUNCA toca cantidad_disponible (el stock solo cambia por ingreso/venta)
export const EditarLoteSchema = z.object({
  numero_lote: z
    .string()
    .max(50, 'Número de lote máximo 50 caracteres')
    .nullable()
    .optional()
    .transform((v) => (v === '' ? null : v)),
  fecha_compra: z
    .string()
    .optional()
    .nullable(),
  fecha_vencimiento: z
    .string()
    .optional()
    .nullable(),
  precio_compra: z
    .number()
    .min(0, 'Precio de compra no puede ser negativo')
    .optional(),
});

export type EditarLoteInput = z.infer<typeof EditarLoteSchema>;

// Lote ID param
export const LoteIdParamSchema = z.object({
  id: z.string().uuid('ID de lote inválido'),
});

export type LoteIdParam = z.infer<typeof LoteIdParamSchema>;

// Stock query params for listing — sort keys de LOTE
export const StockQuerySchema = z.object({
  search: z.string().optional(),
  rubro_id: z.string().uuid().optional(),
  vencimiento_dias: z.coerce.number().int().min(1).optional(),
  stock_bajo: z.coerce.boolean().optional(),
  vencidos: z.coerce.boolean().optional(),
  sort: z
    .enum([
      'numero_lote',
      'fecha_vencimiento',
      'fecha_compra',
      'precio_compra',
      'cantidad_disponible',
      'created_at',
      'producto.nombre',
    ])
    .default('created_at'),
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
