// src/application/dto/venta.dto.ts
// Sale DTOs with Zod validation
import { z } from 'zod';

// Individual product in a sale
const DetalleVentaInputSchema = z.object({
  producto_id: z
    .string()
    .uuid('ID de producto inválido'),
  cantidad: z
    .number()
    .positive('La cantidad debe ser mayor a 0'),
  precio_unitario: z
    .number()
    .min(0, 'El precio unitario no puede ser negativo'),
});

// Create sale schema
export const CreateVentaSchema = z.object({
  productos: z
    .array(DetalleVentaInputSchema)
    .min(1, 'Debe incluir al menos un producto'),
});

export type CreateVentaInput = z.infer<typeof CreateVentaSchema>;
export type DetalleVentaInput = z.infer<typeof DetalleVentaInputSchema>;

// Sale query params for listing
export const VentaQuerySchema = z.object({
  search: z.string().optional(),
  usuario_id: z.string().uuid().optional(),
  estado: z.enum(['pendiente', 'completada', 'cancelada']).optional(),
  fecha_desde: z
    .string()
    .transform((val) => (val ? new Date(val) : undefined))
    .optional(),
  fecha_hasta: z
    .string()
    .transform((val) => (val ? new Date(val) : undefined))
    .optional(),
  sort: z
    .enum(['created_at', 'total', 'estado'])
    .default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type VentaQueryInput = z.infer<typeof VentaQuerySchema>;

// Sale ID param
export const VentaIdParamSchema = z.object({
  id: z.string().uuid('ID de venta inválido'),
});

export type VentaIdParam = z.infer<typeof VentaIdParamSchema>;
