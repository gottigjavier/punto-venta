// src/application/dto/cierre.dto.ts
// Cierre DTOs with Zod validation
import { z } from 'zod';

// Query params for listing cash closures
export const ListCierresQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  fecha_desde: z
    .string()
    .transform((val) => (val ? new Date(val) : undefined))
    .optional(),
  fecha_hasta: z
    .string()
    .transform((val) => (val ? new Date(val) : undefined))
    .optional(),
  vendedor_id: z.string().uuid().optional(),
  producto_id: z.string().uuid().optional(),
  proveedor_id: z.string().uuid().optional(),
  monto_min: z.coerce.number().min(0).optional(),
  monto_max: z.coerce.number().min(0).optional(),
  sort: z
    .enum(['fecha_cierre', 'monto_total', 'cantidad_ventas'])
    .default('fecha_cierre'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type ListCierresQueryInput = z.infer<typeof ListCierresQuerySchema>;
