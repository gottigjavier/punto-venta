// src/application/dto/producto.dto.ts
// Product DTOs with Zod validation
import { z } from 'zod';

// Unidad de medida enum
export const UnidadMedidaSchema = z.enum(['unidad', 'kg', 'g', 'l', 'ml']);

// Create product schema
export const CreateProductoSchema = z.object({
  nombre: z
    .string()
    .min(1, 'Nombre requerido')
    .max(200, 'Nombre máximo 200 caracteres'),
  codigo: z
    .string()
    .min(1, 'Código requerido')
    .max(50, 'Código máximo 50 caracteres'),
  cantidad_disponible: z
    .number()
    .min(0, 'Cantidad no puede ser negativa'),
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

export type CreateProductoInput = z.infer<typeof CreateProductoSchema>;

// Update product schema (all fields optional)
export const UpdateProductoSchema = CreateProductoSchema.partial().extend({
  id: z.string().uuid('ID de producto inválido'),
});

export type UpdateProductoInput = z.infer<typeof UpdateProductoSchema>;

// Product query params for listing
export const ProductoQuerySchema = z.object({
  search: z.string().optional(),
  rubro_id: z.string().uuid().optional(),
  proveedor_id: z.string().uuid().optional(),
  fecha_desde: z.string().optional().transform((val) => (val ? new Date(val) : undefined)),
  fecha_hasta: z.string().optional().transform((val) => (val ? new Date(val) : undefined)),
  sort: z.enum(['nombre', 'codigo', 'precio_venta', 'precio_compra', 'cantidad_aviso', 'created_at', 'updated_at']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(1000).default(20),
});

export type ProductoQueryInput = z.infer<typeof ProductoQuerySchema>;

// Product ID param
export const ProductoIdParamSchema = z.object({
  id: z.string().uuid('ID de producto inválido'),
});

export type ProductoIdParam = z.infer<typeof ProductoIdParamSchema>;

// Stock search for autocomplete
export const StockSearchSchema = z.object({
  query: z.string().min(3, 'Mínimo 3 caracteres para búsqueda'),
});

export type StockSearchInput = z.infer<typeof StockSearchSchema>;
