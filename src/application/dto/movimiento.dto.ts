// src/application/dto/movimiento.dto.ts
// Movimientos de caja (ingreso/egreso) DTOs with Zod validation
import { z } from 'zod';

// Create movement schema
export const CrearMovimientoSchema = z.object({
  tipo: z.enum(['ingreso', 'egreso'], {
    message: 'Tipo inválido: debe ser ingreso o egreso',
  }),
  monto: z
    .number()
    .positive('El monto debe ser mayor a 0'),
  descripcion: z.string().optional(),
  password: z.string().min(1, 'Contraseña requerida'),
});

export type CrearMovimientoInput = z.infer<typeof CrearMovimientoSchema>;

// Movement query params (listado)
export const MovimientoQuerySchema = z.object({
  sort: z.enum(['created_at', 'monto']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type MovimientoQueryInput = z.infer<typeof MovimientoQuerySchema>;
