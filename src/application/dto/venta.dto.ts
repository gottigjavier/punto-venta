// src/application/dto/venta.dto.ts
// Sale DTOs with Zod validation
import { z } from "zod";

// Individual product in a sale
// (exported for swagger component registration; validated on createVenta)
// SE2: el precio unitario NO se acepta en el request. El server lo resuelve
// siempre desde Producto.precio_venta (catálogo) para no congelar en la venta
// precios arbitrarios del cliente.
export const DetalleVentaInputSchema = z.object({
  producto_id: z.string().uuid("ID de producto inválido"),
  cantidad: z.number().positive("La cantidad debe ser mayor a 0"),
});

// Create sale schema
// NOTA: el split por lote (FEFO) es interno del use-case. El input de cada línea
// es producto_id + cantidad; el precio se toma del catálogo (SE2) y NO exпone
// lote_id.
export const CreateVentaSchema = z.object({
  productos: z
    .array(DetalleVentaInputSchema)
    .min(1, "Debe incluir al menos un producto"),
});

export type CreateVentaInput = z.infer<typeof CreateVentaSchema>;
export type DetalleVentaInput = z.infer<typeof DetalleVentaInputSchema>;

// Sale query params for listing
export const VentaQuerySchema = z.object({
  search: z.string().optional(),
  usuario_id: z.string().uuid().optional(),
  estado: z.enum(["pendiente", "completada", "cancelada"]).optional(),
  cierre_caja_id: z.string().uuid("ID de cierre inválido").optional(),
  fecha_desde: z
    .string()
    .transform((val) => (val ? new Date(val) : undefined))
    .optional(),
  fecha_hasta: z
    .string()
    .transform((val) => (val ? new Date(val) : undefined))
    .optional(),
  sort: z.enum(["created_at", "total", "estado"]).default("created_at"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  // EF3: paginación keyset como modo ADICIONAL al offset (page/limit). El token
  // es opaco (base64url, ver shared/utils/cursor.ts): el client lo recibe como
  // `next_cursor` en la respuesta y lo devuelve tal cual acá. Si viene `cursor`,
  // el use-case pagina por (created_at, id) y exige sort=created_at.
  cursor: z.string().min(1).optional(),
});

export type VentaQueryInput = z.infer<typeof VentaQuerySchema>;

// Sale ID param
export const VentaIdParamSchema = z.object({
  id: z.string().uuid("ID de venta inválido"),
});

export type VentaIdParam = z.infer<typeof VentaIdParamSchema>;

// Close cash period schema
export const CerrarCajaSchema = z.object({
  password: z.string().min(1, "Contraseña requerida"),
});

export type CerrarCajaInput = z.infer<typeof CerrarCajaSchema>;

// Sale detail query params for cierre-level drill-down
export const VentaCierreQuerySchema = z.object({
  vendedor: z.string().optional(),
  producto: z.string().optional(),
  id_venta: z.string().optional(),
  monto_min: z.coerce.number().min(0).optional(),
  monto_max: z.coerce.number().min(0).optional(),
  sort: z.enum(["cantidad", "monto", "id_venta"]).default("id_venta"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export type VentaCierreQueryInput = z.infer<typeof VentaCierreQuerySchema>;
