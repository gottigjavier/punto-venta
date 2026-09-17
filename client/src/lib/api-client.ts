import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import type { Rol, UsuarioSafe } from "./types";
import type {
  Pagination,
  ResumenDia,
  Rubro,
  UltimaVenta,
  VentaWithDetails,
} from "@/features/ventas/types";

const API_BASE = "/api/v1";

// Ruta interna de login. Valor fijo, nunca derivado de entrada de usuario, para
// evitar open-redirect al reenviar tras un 401 / refresh fallido.
export const LOGIN_PATH = "/login";

export function redirectToLogin(): void {
  // Solo se navega a un path interno fijo; jamás se construye el destino desde
  // datos del cliente.
  window.location.assign(LOGIN_PATH);
}

// Access token en memoria (NO persistente). Vive solo mientras la SPA esté
// cargada — mitigación S1: un token robado por XSS ya no queda persistido en
// localStorage. La sesión se restaura al cargar llamando a /auth/refresh con la
// cookie httpOnly del refresh token.
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
  // R4-3: timeout global para que ninguna llamada (incl. la restauración de
  // sesión en el mount) pueda quedar colgada sin límite si el backend no responde.
  timeout: 10000,
});

// Request interceptor: attach JWT desde memoria
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// Response interceptor: handle 401 and refresh
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };
    const url = originalRequest?.url ?? "";

    // No reintentar refresh en los propios endpoints de auth: login 401 por
    // credenciales inválidas, refresh 401 por sesión expirada y logout 401 por
    // sesión ya no válida. Evita bucles y redirecciones espurias.
    const authEndpoint =
      url.includes("/auth/login") ||
      url.includes("/auth/refresh") ||
      url.includes("/auth/logout");

    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !authEndpoint
    ) {
      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { data } = await axios.post<ApiResponse<{ accessToken: string }>>(
          `${API_BASE}/auth/refresh`,
          {},
          { withCredentials: true, timeout: 10000 },
        );
        const newToken: string = data.data.accessToken;
        setAccessToken(newToken);
        processQueue(null, newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch {
        processQueue(error, null);
        setAccessToken(null);
        redirectToLogin();
        return Promise.reject(error);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

// Types
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  pagination?: Pagination;
}

// ===== Tipos canónicos del wire (espejo de src/application/dto/response.dto.ts) ====
// El client NO comparte tipos con el server (no puede importarlos); estos tipos
// se mantienen alineados a mano con los Zod schemas del wire. Convenciones del
// server: Decimal -> number, Timestamptz/Date -> string ISO, columna nullable ->
// `| null`, campo ausente en algunos endpoints -> opcional.
// Los tipos que ya viven en features/ventas/types.ts (Rubro, Pagination,
// ResumenDia, UltimaVenta, VentaWithDetails, ProductSearchResult) se REUTILIZAN
// (import arriba), no se redefinen.

export type UnidadMedida = "unidad" | "kg" | "g" | "l" | "ml";

/** Lote anidado dentro de Producto (plain, sin relaciones). Espejo de LoteSchema. */
export interface LoteResumen {
  id: string;
  producto_id: string;
  numero_lote: string | null;
  cantidad_disponible: number;
  fecha_compra: string | null;
  fecha_vencimiento: string | null;
  precio_compra: number;
  estado: "activo" | "agotado" | "vencido" | "descartado";
  created_at: string;
}

/** Producto completo (list/get/create/update/restore/search/autocomplete). Espejo de ProductoSchema. */
export interface Producto {
  id: string;
  nombre: string;
  codigo: string;
  cantidad_aviso: number;
  precio_venta: number;
  rubro_id: string;
  proveedor_id: string;
  unidad_medida: UnidadMedida;
  activo: boolean;
  vencimiento_preaviso_dias?: number;
  stock_actual: number;
  lotes: LoteResumen[];
  rubro?: { id: string; nombre: string };
  proveedor?: { id: string; razon_social: string };
  created_at: string;
  updated_at: string | null;
}

/** Proveedor. Espejo de ProveedorSchema. */
export interface Proveedor {
  id: string;
  razon_social: string;
  representante: string | null;
  cuit: string | null;
  direccion_postal: string | null;
  email: string | null;
  telefonos: string[] | null;
  _count?: { productos: number };
  created_at: string;
  updated_at: string | null;
}

/**
 * Usuario de gestión (GET /usuarios, CRUD admin). Espejo de UsuarioSchema
 * (sin password_hash). Difiere de `Usuario` de features/ventas/types.ts
 * ({ id, nombre_usuario }), que es solo la forma para filtros.
 */
export interface Usuario {
  id: string;
  nombre_usuario: string;
  nik_usuario: string;
  email: string;
  telefono: string | null;
  rol: Rol;
  activo: boolean;
  intentos_fallidos: number;
  bloqueado_hasta: string | null;
  refresh_token_version: number;
  created_at: string;
  updated_at: string | null;
}

/** Fila de listado de ventas (aplanada). Espejo de VentaListItemSchema. */
export interface VentaListItem {
  id: string;
  usuario_id: string;
  usuario_nombre: string;
  total: number;
  estado: "pendiente" | "completada" | "cancelada";
  cantidad_items: number;
  created_at: string;
}

/** Producto más vendido (GET /ventas/mas-vendidos). Espejo de ProductoMasVendidoSchema. */
export interface ProductoMasVendido {
  producto_id: string;
  veces_vendido: number;
  monto_total: number;
}

/** Data de POST /ventas/cierre-caja (devolución del use-case cerrarCaja). */
export interface CierreCajaResult {
  id: string;
  monto_total: number;
  cantidad_ventas: number;
  fecha_cierre: string;
}

// ===== Payloads (inputs) — espejo de los schemas de validación del server =====
// (producto.dto.ts, proveedor.dto.ts, rubro.dto.ts, usuario.dto.ts,
// stock.dto.ts, venta.dto.ts). Los campos opcionales van `.optional()`: el
// server normaliza '' -> null donde corresponde.

export interface CreateProductoInput {
  nombre: string;
  codigo: string;
  cantidad_aviso?: number;
  precio_venta: number;
  rubro_id: string;
  proveedor_id: string;
  unidad_medida: UnidadMedida;
  vencimiento_preaviso_dias?: number;
}

export type UpdateProductoInput = Partial<CreateProductoInput>;

export interface CreateProveedorInput {
  razon_social: string;
  representante?: string;
  cuit?: string;
  direccion_postal?: string;
  email?: string;
  telefonos?: string[];
}

export type UpdateProveedorInput = Partial<CreateProveedorInput>;

export interface CreateRubroInput {
  nombre: string;
  descripcion?: string;
  activo?: boolean;
}

export type UpdateRubroInput = Partial<CreateRubroInput>;

export interface CreateUsuarioInput {
  nombre_usuario: string;
  nik_usuario: string;
  password: string;
  email: string;
  telefono?: string;
  rol: Rol;
  activo?: boolean;
}

export type UpdateUsuarioInput = Partial<Omit<CreateUsuarioInput, "password">> & {
  password?: string;
};

export interface StockIngresoInput {
  producto_id: string;
  numero_lote?: string | null;
  cantidad: number;
  fecha_compra?: string | null;
  fecha_vencimiento?: string | null;
  precio_compra: number;
  cantidad_aviso?: number;
}

export interface CreateVentaInput {
  productos: Array<{
    producto_id: string;
    cantidad: number;
  }>;
}

// ===== Query params (espejo de los QuerySchemas del server) =====
export interface ProductoQueryParams {
  search?: string;
  rubro_id?: string;
  proveedor_id?: string;
  fecha_desde?: string;
  fecha_hasta?: string;
  sort?: string;
  order?: "asc" | "desc";
  page?: number;
  limit?: number;
  // El server valida 'true'|'false' (enum string); axios serializa boolean a "true".
  activo?: boolean | "true" | "false";
  cursor?: string;
}

export interface ProveedorQueryParams {
  search?: string;
  sort?: string;
  order?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export interface UsuarioQueryParams {
  search?: string;
  rol?: Rol;
  activo?: boolean;
  sort?: string;
  order?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export interface StockQueryParams {
  search?: string;
  rubro_id?: string;
  archivados?: boolean | "true" | "false";
  sort?: string;
  order?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export interface VentaQueryParams {
  search?: string;
  usuario_id?: string;
  estado?: "pendiente" | "completada" | "cancelada";
  cierre_caja_id?: string;
  fecha_desde?: string;
  fecha_hasta?: string;
  sort?: string;
  order?: "asc" | "desc";
  page?: number;
  limit?: number;
  cursor?: string;
}

// Auth
export const authApi = {
  login: (nik_usuario: string, password: string) =>
    api.post<ApiResponse<{ accessToken: string; user: UsuarioSafe }>>(
      "/auth/login",
      { nik_usuario, password },
    ),
  refresh: () =>
    api.post<ApiResponse<{ accessToken: string }>>(
      "/auth/refresh",
      {},
      { withCredentials: true },
    ),
  logout: () => api.post<ApiResponse<{ message: string }>>("/auth/logout"),
  // Bootstrap (primer administrador)
  bootstrapStatus: () =>
    api.get<ApiResponse<{ needsBootstrap: boolean }>>("/auth/bootstrap-status"),
  bootstrap: (data: {
    nombre_usuario: string;
    nik_usuario: string;
    email: string;
    password: string;
    telefono?: string;
  }) =>
    api.post<ApiResponse<{ accessToken: string; user: UsuarioSafe }>>(
      "/auth/bootstrap",
      data,
    ),
};

// Productos
export const productosApi = {
  list: (params?: ProductoQueryParams) =>
    api.get<ApiResponse<Producto[]>>("/productos", { params }),
  getById: (id: string) => api.get<ApiResponse<Producto>>(`/productos/${id}`),
  create: (data: CreateProductoInput) =>
    api.post<ApiResponse<Producto>>("/productos", data),
  update: (id: string, data: UpdateProductoInput) =>
    api.put<ApiResponse<Producto>>(`/productos/${id}`, data),
  delete: (id: string) =>
    api.delete<ApiResponse<{ success: boolean }>>(`/productos/${id}`),
  restore: (id: string) =>
    api.post<ApiResponse<Producto>>(`/productos/${id}/restore`, {}),
  search: (q: string, tipo?: "nombre" | "codigo") =>
    api.get<ApiResponse<Producto[]>>("/productos/search", {
      params: { q, tipo },
    }),
};

// Proveedores
export const proveedoresApi = {
  list: (params?: ProveedorQueryParams) =>
    api.get<ApiResponse<Proveedor[]>>("/proveedores", { params }),
  getById: (id: string) =>
    api.get<ApiResponse<Proveedor>>(`/proveedores/${id}`),
  create: (data: CreateProveedorInput) =>
    api.post<ApiResponse<Proveedor>>("/proveedores", data),
  update: (id: string, data: UpdateProveedorInput) =>
    api.put<ApiResponse<Proveedor>>(`/proveedores/${id}`, data),
  delete: (id: string) =>
    api.delete<ApiResponse<{ message: string }>>(`/proveedores/${id}`),
};

// Rubros
export const rubrosApi = {
  list: () => api.get<ApiResponse<Rubro[]>>("/rubros"),
  getById: (id: string) => api.get<ApiResponse<Rubro>>(`/rubros/${id}`),
  create: (data: CreateRubroInput) =>
    api.post<ApiResponse<Rubro>>("/rubros", data),
  update: (id: string, data: UpdateRubroInput) =>
    api.put<ApiResponse<Rubro>>(`/rubros/${id}`, data),
  delete: (id: string) =>
    api.delete<ApiResponse<{ success: boolean }>>(`/rubros/${id}`),
};

// Usuarios
export const usuariosApi = {
  list: (params?: UsuarioQueryParams) =>
    api.get<ApiResponse<Usuario[]>>("/usuarios", { params }),
  getById: (id: string) => api.get<ApiResponse<Usuario>>(`/usuarios/${id}`),
  create: (data: CreateUsuarioInput) =>
    api.post<ApiResponse<Usuario>>("/usuarios", data),
  update: (id: string, data: UpdateUsuarioInput) =>
    api.put<ApiResponse<Usuario>>(`/usuarios/${id}`, data),
  delete: (id: string) =>
    api.delete<ApiResponse<{ message: string }>>(`/usuarios/${id}`),
};

// Lotes (N° de Lote) — CRUD sobre el modelo Lote (el stock vive en Lote tras el split)
export interface LoteItem {
  id: string;
  producto_id: string;
  numero_lote: string | null;
  cantidad_disponible: number;
  fecha_compra: string | null;
  fecha_vencimiento: string | null;
  precio_compra: number;
  estado: "activo" | "agotado" | "vencido" | "descartado";
  created_at: string;
  producto: {
    id: string;
    nombre: string;
    codigo: string;
    unidad_medida: string;
    precio_venta: number;
    cantidad_aviso: number;
  };
  rubro: { id: string; nombre: string } | null;
  proveedor: { id: string; razon_social: string } | null;
  estado_vencimiento: "vencido" | "por_vencer" | "ok";
  stock_bajo: boolean;
}

// Payload para editar un lote (PUT /lotes/:id) — NUNCA cantidad_disponible
export interface EditarLotePayload {
  numero_lote?: string | null;
  fecha_compra?: string | null;
  fecha_vencimiento?: string | null;
  precio_compra?: number;
}

export const lotesApi = {
  list: (params?: StockQueryParams) =>
    api.get<ApiResponse<LoteItem[]>>("/stock", { params }),
  update: (id: string, data: EditarLotePayload) =>
    api.put<ApiResponse<LoteItem>>(`/lotes/${id}`, data),
  retirar: (id: string) =>
    api.post<ApiResponse<LoteItem>>(`/lotes/${id}/retirar`, {}),
  delete: (id: string) =>
    api.delete<ApiResponse<{ success: boolean }>>(`/lotes/${id}`),
};

// Stock
export const stockApi = {
  list: (params?: StockQueryParams) =>
    api.get<ApiResponse<LoteItem[]>>("/stock", { params }),
  ingreso: (data: StockIngresoInput) =>
    api.post<ApiResponse<LoteItem>>("/stock/ingreso", data),
  autocomplete: (query: string, tipo?: "nombre" | "codigo") =>
    api.get<ApiResponse<Producto[]>>("/stock/autocomplete", {
      params: { query, tipo },
    }),
};

// Producto (lista con stock_actual tras el split)
export interface ProductListItem {
  id: string;
  nombre: string;
  codigo: string;
  precio_venta: number;
  cantidad_aviso: number;
  unidad_medida: string;
  activo: boolean;
  stock_actual: number;
  rubro: { id: string; nombre: string } | null;
  proveedor: { id: string; razon_social: string } | null;
}

// Cierres de Caja
export interface CierreListItem {
  id: string;
  fecha_apertura: string;
  fecha_cierre: string | null;
  monto_total: number;
  ingresos_total: number;
  egresos_total: number;
  cantidad_ventas: number;
  usuario_apertura: { id: string; nombre_usuario: string };
  usuario_cierre: { id: string; nombre_usuario: string } | null;
}

export interface CierreDetalle {
  id: string;
  tipo: string;
  referencia_id: string;
  nombre: string;
  cantidad: number;
  monto_total: number;
}

export interface CierreMovimiento {
  id: string;
  tipo: "ingreso" | "egreso";
  monto: number;
  descripcion: string | null;
  usuario_id: string;
  created_at: string;
  usuario: { id: string; nombre_usuario: string };
}

export interface CierreDetail {
  id: string;
  fecha_apertura: string;
  fecha_cierre: string | null;
  monto_total: number;
  ingresos_total: number;
  egresos_total: number;
  cantidad_ventas: number;
  estado: string;
  usuario_apertura: { id: string; nombre_usuario: string };
  usuario_cierre: { id: string; nombre_usuario: string } | null;
  detalles: CierreDetalle[];
  movimientos: CierreMovimiento[];
}

export interface CierresQueryParams {
  page?: number;
  limit?: number;
  fecha_desde?: string;
  fecha_hasta?: string;
  vendedor_id?: string;
  producto_id?: string;
  proveedor_id?: string;
  monto_min?: number;
  monto_max?: number;
  sort?: "fecha_cierre" | "monto_total" | "cantidad_ventas";
  order?: "asc" | "desc";
}

/** Una fila aplanada de venta del cierre (una por línea de producto) */
export interface VentaCierreFila {
  id_venta: string;
  vendedor: string;
  producto: string;
  cantidad: number;
  monto: number;
}

/** Respuesta del endpoint GET /cierres/:id/ventas */
export interface VentaCierreRespuesta {
  rows: VentaCierreFila[];
  total_monto: number;
  total_filas: number;
}

/** Query params para GET /cierres/:id/ventas */
export interface VentaCierreQueryParams {
  id_venta?: string;
  vendedor?: string;
  producto?: string;
  monto_min?: number;
  monto_max?: number;
  sort?: "cantidad" | "monto" | "id_venta";
  order?: "asc" | "desc";
}

export const cierresApi = {
  list: (params?: CierresQueryParams) =>
    api.get<ApiResponse<CierreListItem[]>>("/ventas/cierres", { params }),
  getById: (id: string) =>
    api.get<ApiResponse<CierreDetail>>(`/ventas/cierres/${id}`),
  exportCsv: (id: string) =>
    api.get(`/ventas/cierres/${id}/csv`, { responseType: "blob" }),
  getVentas: (cierreId: string, params?: VentaCierreQueryParams) =>
    api.get<ApiResponse<VentaCierreRespuesta>>(
      `/ventas/cierres/${cierreId}/ventas`,
      { params },
    ),
};

// Ventas
export interface MovimientoCajaItem {
  id: string;
  tipo: "ingreso" | "egreso";
  monto: number;
  descripcion: string | null;
  usuario_id: string;
  cierre_caja_id: string | null;
  created_at: string;
  usuario?: { id: string; nombre_usuario: string };
}

export interface ResumenMovimientos {
  ingresos: number;
  egresos: number;
  total: number;
}

/** A unified history row (a sale OR a cash movement) from GET /ventas/historial */
export interface FilaHistorial {
  id: string;
  tipo_fila: "venta" | "movimiento";
  created_at: string;
  usuario_nombre: string;
  monto: number;
  estado: "Venta" | "Ingreso" | "Egreso";
  cantidad_items: number | null;
  referencia_id?: string | null;
}

export interface HistorialQueryParams {
  page?: number;
  limit?: number;
  sort?: "created_at" | "monto";
  order?: "asc" | "desc";
  fecha_desde?: string;
  fecha_hasta?: string;
  usuario_id?: string;
  tipo_fila?: "venta" | "movimiento";
}

export const ventasApi = {
  resumenDia: () => api.get<ApiResponse<ResumenDia>>("/ventas/resumen/dia"),
  ultimasVentas: () =>
    api.get<ApiResponse<UltimaVenta[]>>("/ventas/ultimas-ventas"),
  masVendidos: () =>
    api.get<ApiResponse<ProductoMasVendido[]>>("/ventas/mas-vendidos"),
  list: (params?: VentaQueryParams) =>
    api.get<ApiResponse<VentaListItem[]>>("/ventas", { params }),
  historial: (params?: HistorialQueryParams) =>
    api.get<ApiResponse<FilaHistorial[]>>("/ventas/historial", { params }),
  getById: (id: string) =>
    api.get<ApiResponse<VentaWithDetails>>(`/ventas/${id}`),
  create: (data: CreateVentaInput) =>
    api.post<ApiResponse<VentaWithDetails>>("/ventas", data),
  cerrarCaja: (data: { password: string }) =>
    api.post<ApiResponse<CierreCajaResult>>("/ventas/cierre-caja", data),
  delete: (id: string) =>
    api.delete<ApiResponse<{ id: string }>>(`/ventas/${id}`),
};

export interface MovimientoQueryParams {
  sort?: "created_at" | "monto";
  order?: "asc" | "desc";
  page?: number;
  limit?: number;
  cursor?: string;
}

export const movimientosApi = {
  list: (params?: MovimientoQueryParams) =>
    api.get<
      ApiResponse<MovimientoCajaItem[]> & { resumen?: ResumenMovimientos }
    >("/ventas/movimientos", { params }),
  create: (data: {
    tipo: "ingreso" | "egreso";
    monto: number;
    descripcion?: string;
    password: string;
  }) => api.post<ApiResponse<MovimientoCajaItem>>("/ventas/movimientos", data),
};
