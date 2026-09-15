// src/application/dto/response.dto.ts
// Response schema DTOs (Swagger components) backed by Zod.
//
// Única fuente de verdad de los shapes del wire: cada schema refleja lo que
// realmente devuelven los use-cases/controllers (ver ground-truth). Estos
// schemas se registran en Fastify vía `fastify.addSchema` y se referencian con
// `$ref` en las `response` de cada route (envelope inline + data como $ref).
//
// Convenciones de wire:
// - Decimal (Prisma)     -> z.number()  (backend convierte con toNumber())
// - @db.Timestamptz      -> z.iso.datetime()  (ISO string en el wire)
// - @db.Date             -> z.iso.datetime()  (llega como ISO date-time UTC-midnight)
// - nullable column      -> .nullable()
// - columna ausente      -> .optional()  (NO está en el wire cuando no aplica)
import { z } from "zod";

// ===== Primitivos reutilizables =====
const UUID = z.string().uuid();
const ISO_DATETIME = z.iso.datetime();

const UnidadMedidaEnum = z.enum(["unidad", "kg", "g", "l", "ml"]);
const EstadoVentaEnum = z.enum(["pendiente", "completada", "cancelada"]);
const EstadoLoteEnum = z.enum(["activo", "agotado", "vencido", "descartado"]);
const RolEnum = z.enum(["admin", "gerente", "despachador"]);
const TipoMovimientoEnum = z.enum(["ingreso", "egreso"]);

// ===== Meta / genérico =====
export const PaginationSchema = z.object({
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  totalPages: z.number(),
});

// ===== Lote (stock vive en el lote tras el split Producto/Lote) =====
export const LoteSchema = z.object({
  id: UUID,
  producto_id: UUID,
  numero_lote: z.string().nullable(),
  cantidad_disponible: z.number(),
  fecha_compra: ISO_DATETIME.nullable(),
  fecha_vencimiento: ISO_DATETIME.nullable(),
  precio_compra: z.number(),
  estado: EstadoLoteEnum,
  created_at: ISO_DATETIME,
});

// ===== Producto =====
// rubro/proveedor/vencimiento_preaviso_dias: presentes en list/detail, AUSENTES
// en create/update/restore/search -> .optional(). stock_actual y lotes siempre
// presentes (lotes puede ser []).
export const ProductoSchema = z.object({
  id: UUID,
  nombre: z.string(),
  codigo: z.string(),
  cantidad_aviso: z.number(),
  precio_venta: z.number(),
  rubro_id: UUID,
  proveedor_id: UUID,
  unidad_medida: UnidadMedidaEnum,
  activo: z.boolean(),
  vencimiento_preaviso_dias: z.number().optional(),
  stock_actual: z.number(),
  lotes: z.array(LoteSchema),
  rubro: z.object({ id: UUID, nombre: z.string() }).optional(),
  proveedor: z.object({ id: UUID, razon_social: z.string() }).optional(),
  created_at: ISO_DATETIME,
  updated_at: ISO_DATETIME.nullable(),
});

// ===== Proveedor =====
export const ProveedorSchema = z.object({
  id: UUID,
  razon_social: z.string(),
  representante: z.string().nullable(),
  cuit: z.string().nullable(),
  direccion_postal: z.string().nullable(),
  email: z.string().nullable(),
  telefonos: z.array(z.string()).nullable(),
  _count: z.object({ productos: z.number() }).optional(),
  created_at: ISO_DATETIME,
  updated_at: ISO_DATETIME.nullable(),
});

// ===== Rubro =====
export const RubroSchema = z.object({
  id: UUID,
  nombre: z.string(),
  descripcion: z.string().nullable(),
  activo: z.boolean(),
  _count: z.object({ productos: z.number() }).optional(),
});

// ===== Usuario (safe: sin password_hash, con refresh_token_version) =====
export const UsuarioSchema = z.object({
  id: UUID,
  nombre_usuario: z.string(),
  nik_usuario: z.string(),
  email: z.string(),
  telefono: z.string().nullable(),
  rol: RolEnum,
  activo: z.boolean(),
  intentos_fallidos: z.number(),
  bloqueado_hasta: ISO_DATETIME.nullable(),
  refresh_token_version: z.number(),
  created_at: ISO_DATETIME,
  updated_at: ISO_DATETIME.nullable(),
});

// ===== Venta detail (GET /ventas/:id y POST /ventas) =====
export const VentaDetailSchema = z.object({
  id: UUID,
  usuario_id: UUID,
  total: z.number(),
  estado: EstadoVentaEnum,
  cierre_caja_id: UUID.nullable(),
  created_at: ISO_DATETIME,
  usuario: z.object({
    id: UUID,
    nombre_usuario: z.string(),
    nik_usuario: z.string(),
  }),
  detalles_venta: z.array(
    z.object({
      id: UUID,
      venta_id: UUID,
      producto_id: UUID,
      lote_id: UUID.nullable(),
      cantidad: z.number(),
      precio_unitario: z.number(),
      subtotal: z.number(),
      producto: z.object({
        id: UUID,
        nombre: z.string(),
        codigo: z.string(),
      }),
    }),
  ),
});

// ===== Venta list item (flattened) =====
export const VentaListItemSchema = z.object({
  id: UUID,
  usuario_id: UUID,
  usuario_nombre: z.string(),
  total: z.number(),
  estado: EstadoVentaEnum,
  cantidad_items: z.number(),
  created_at: ISO_DATETIME,
});

// ===== Movimiento de caja =====
// usuario: solo { id, nombre_usuario } (sin nik_usuario).
export const MovimientoCajaSchema = z.object({
  id: UUID,
  tipo: TipoMovimientoEnum,
  monto: z.number(),
  descripcion: z.string().nullable(),
  usuario_id: UUID,
  cierre_caja_id: UUID.nullable(),
  created_at: ISO_DATETIME,
  usuario: z.object({
    id: UUID,
    nombre_usuario: z.string(),
  }),
});

// ===== Resumen diario =====
export const ResumenDiaSchema = z.object({
  fecha: z.string(),
  total_ventas: z.number(),
  monto_total: z.number(),
  ingresos_total: z.number(),
  egresos_total: z.number(),
  productos_vendidos: z.array(
    z.object({
      producto_id: UUID,
      nombre: z.string(),
      cantidad_total: z.number(),
      monto_total: z.number(),
    }),
  ),
  ventas_por_usuario: z.array(
    z.object({
      usuario_id: UUID,
      nombre: z.string(),
      cantidad_ventas: z.number(),
      monto_total: z.number(),
    }),
  ),
});

// ===== Resumen de movimientos (GET /ventas/movimientos) =====
export const ResumenMovimientosSchema = z.object({
  ingresos: z.number(),
  egresos: z.number(),
  total: z.number(),
});

// ===== Producto mas vendido =====
// Campo correcto: `veces_vendido` (NO cantidad_total).
export const ProductoMasVendidoSchema = z.object({
  producto_id: UUID,
  veces_vendido: z.number(),
  monto_total: z.number(),
});

// ===== Fila de stock (GET /stock): UNA FILA POR LOTE =====
export const StockItemSchema = z.object({
  id: UUID,
  producto_id: UUID,
  numero_lote: z.string().nullable(),
  cantidad_disponible: z.number(),
  fecha_compra: ISO_DATETIME.nullable(),
  fecha_vencimiento: ISO_DATETIME.nullable(),
  precio_compra: z.number(),
  estado: EstadoLoteEnum,
  created_at: ISO_DATETIME,
  producto: z.object({
    id: UUID,
    nombre: z.string(),
    codigo: z.string(),
    unidad_medida: UnidadMedidaEnum,
    precio_venta: z.number(),
    cantidad_aviso: z.number(),
  }),
  rubro: z.object({ id: UUID, nombre: z.string() }),
  proveedor: z.object({ id: UUID, razon_social: z.string() }),
  estado_vencimiento: z.enum(["vencido", "por_vencer", "ok"]),
  stock_bajo: z.boolean(),
});

// ===== Cierre de caja (list item v detail) =====
export const CierreListItemSchema = z.object({
  id: UUID,
  fecha_apertura: ISO_DATETIME,
  fecha_cierre: ISO_DATETIME.nullable(),
  monto_total: z.number(),
  ingresos_total: z.number(),
  egresos_total: z.number(),
  cantidad_ventas: z.number(),
  usuario_apertura: z.object({ id: UUID, nombre_usuario: z.string() }),
  usuario_cierre: z.object({ id: UUID, nombre_usuario: z.string() }).nullable(),
});

export const CierreDetailSchema = CierreListItemSchema.extend({
  estado: z.string(),
  detalles: z.array(
    z.object({
      id: UUID,
      tipo: z.string(),
      referencia_id: UUID,
      nombre: z.string(),
      cantidad: z.number(),
      monto_total: z.number(),
    }),
  ),
  movimientos: z.array(
    z.object({
      id: UUID,
      tipo: TipoMovimientoEnum,
      monto: z.number(),
      descripcion: z.string().nullable(),
      usuario_id: UUID,
      created_at: ISO_DATETIME,
      usuario: z.object({
        id: UUID,
        nombre_usuario: z.string(),
      }),
    }),
  ),
});

// ===== Respuesta de GET /cierres/:id/ventas (filas aplanadas + totales) =====
export const VentaCierreRespuestaSchema = z.object({
  rows: z.array(
    z.object({
      id_venta: UUID,
      vendedor: z.string(),
      producto: z.string(),
      cantidad: z.number(),
      monto: z.number(),
    }),
  ),
  total_monto: z.number(),
  total_filas: z.number(),
});

// ===== Auth =====
// LoginResponse.user: exactamente { id, nombre_usuario, nik_usuario, email, rol }.
export const LoginResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    accessToken: z.string(),
    user: z.object({
      id: UUID,
      nombre_usuario: z.string(),
      nik_usuario: z.string(),
      email: z.string(),
      rol: RolEnum,
    }),
  }),
});

export const RefreshResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    accessToken: z.string(),
  }),
});

// ===== Historial unificado =====
// referencia_id: clave siempre presente, valor null en la impl actual.
export const FilaHistorialSchema = z.object({
  id: UUID,
  tipo_fila: z.enum(["venta", "movimiento"]),
  created_at: ISO_DATETIME,
  usuario_nombre: z.string(),
  monto: z.number(),
  estado: z.enum(["Venta", "Ingreso", "Egreso"]),
  cantidad_items: z.number().nullable(),
  referencia_id: UUID.nullable(),
});

// ===== Ultimas ventas (GET /ventas/ultimas-ventas) =====
export const UltimaVentaSchema = z.object({
  producto_id: UUID,
  ultima_venta_at: ISO_DATETIME.nullable(),
  ultima_cantidad: z.number().nullable(),
});

// ===== Tipos derivados =====
export type ProductoResponse = z.infer<typeof ProductoSchema>;
export type VentaDetailResponse = z.infer<typeof VentaDetailSchema>;
