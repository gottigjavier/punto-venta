// src/application/dto/historial.dto.ts
// Historial unificado (ventas + movimientos) DTOs with Zod validation
import { z } from 'zod';

// Query params for the unified history endpoint
export const HistorialQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['created_at', 'monto']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
  fecha_desde: z.string().optional(),
  fecha_hasta: z.string().optional(),
  usuario_id: z.string().uuid().optional(),
  tipo_fila: z.enum(['venta', 'movimiento']).optional(),
});

export type HistorialQueryInput = z.infer<typeof HistorialQuerySchema>;

// A unified row in the history (a sale OR a cash movement)
export interface FilaHistorial {
  id: string;
  tipo_fila: 'venta' | 'movimiento';
  created_at: Date | string;
  usuario_nombre: string;
  monto: number;
  estado: 'Venta' | 'Ingreso' | 'Egreso';
  cantidad_items: number | null;
  referencia_id?: string | null;
}
