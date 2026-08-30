import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

const API_BASE = '/api/v1';

export const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor: attach JWT
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
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
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { data } = await axios.post(`${API_BASE}/auth/refresh`, {}, { withCredentials: true });
        const newToken: string = data.data.accessToken;
        localStorage.setItem('accessToken', newToken);
        processQueue(null, newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch {
        processQueue(error, null);
        localStorage.removeItem('accessToken');
        window.location.href = '/login';
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
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Auth
export const authApi = {
  login: (nik_usuario: string, password: string) =>
    api.post<ApiResponse<{ accessToken: string; user: unknown }>>('/auth/login', { nik_usuario, password }),
  refresh: () => api.post<ApiResponse<{ accessToken: string }>>('/auth/refresh', {}, { withCredentials: true }),
};

// Productos
export const productosApi = {
  list: (params?: Record<string, unknown>) =>
    api.get<ApiResponse<unknown[]>>('/productos', { params }),
  getById: (id: string) => api.get<ApiResponse<unknown>>(`/productos/${id}`),
  create: (data: unknown) => api.post<ApiResponse<unknown>>('/productos', data),
  update: (id: string, data: unknown) => api.put<ApiResponse<unknown>>(`/productos/${id}`, data),
  delete: (id: string) => api.delete<ApiResponse<unknown>>(`/productos/${id}`),
  search: (q: string, tipo?: string) =>
    api.get<ApiResponse<unknown[]>>('/productos/search', { params: { q, tipo } }),
};

// Proveedores
export const proveedoresApi = {
  list: (params?: Record<string, unknown>) =>
    api.get<ApiResponse<unknown[]>>('/proveedores', { params }),
  getById: (id: string) => api.get<ApiResponse<unknown>>(`/proveedores/${id}`),
  create: (data: unknown) => api.post<ApiResponse<unknown>>('/proveedores', data),
  update: (id: string, data: unknown) => api.put<ApiResponse<unknown>>(`/proveedores/${id}`, data),
  delete: (id: string) => api.delete<ApiResponse<unknown>>(`/proveedores/${id}`),
};

// Rubros
export const rubrosApi = {
  list: () => api.get<ApiResponse<unknown[]>>('/rubros'),
  getById: (id: string) => api.get<ApiResponse<unknown>>(`/rubros/${id}`),
  create: (data: unknown) => api.post<ApiResponse<unknown>>('/rubros', data),
  update: (id: string, data: unknown) => api.put<ApiResponse<unknown>>(`/rubros/${id}`, data),
  delete: (id: string) => api.delete<ApiResponse<unknown>>(`/rubros/${id}`),
};

// Usuarios
export const usuariosApi = {
  list: (params?: Record<string, unknown>) =>
    api.get<ApiResponse<unknown[]>>('/usuarios', { params }),
  getById: (id: string) => api.get<ApiResponse<unknown>>(`/usuarios/${id}`),
  create: (data: unknown) => api.post<ApiResponse<unknown>>('/usuarios', data),
  update: (id: string, data: unknown) => api.put<ApiResponse<unknown>>(`/usuarios/${id}`, data),
  delete: (id: string) => api.delete<ApiResponse<unknown>>(`/usuarios/${id}`),
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
  estado: 'activo' | 'agotado' | 'vencido' | 'descartado';
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
  estado_vencimiento: 'vencido' | 'por_vencer' | 'ok';
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
  list: (params?: Record<string, unknown>) =>
    api.get<ApiResponse<LoteItem[]>>('/stock', { params }),
  update: (id: string, data: EditarLotePayload) =>
    api.put<ApiResponse<LoteItem>>(`/lotes/${id}`, data),
  retirar: (id: string) =>
    api.post<ApiResponse<LoteItem>>(`/lotes/${id}/retirar`, {}),
  delete: (id: string) =>
    api.delete<ApiResponse<{ success: boolean }>>(`/lotes/${id}`),
};

// Stock
export const stockApi = {
  list: (params?: Record<string, unknown>) =>
    api.get<ApiResponse<LoteItem[]>>('/stock', { params }),
  ingreso: (data: unknown) => api.post<ApiResponse<unknown>>('/stock/ingreso', data),
  autocomplete: (query: string, tipo?: string) =>
    api.get<ApiResponse<unknown[]>>('/stock/autocomplete', { params: { query, tipo } }),
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
  tipo: 'ingreso' | 'egreso';
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
  sort?: 'fecha_cierre' | 'monto_total' | 'cantidad_ventas';
  order?: 'asc' | 'desc';
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
  sort?: 'cantidad' | 'monto' | 'id_venta';
  order?: 'asc' | 'desc';
}

export const cierresApi = {
  list: (params?: CierresQueryParams) =>
    api.get<ApiResponse<CierreListItem[]>>('/ventas/cierres', { params }),
  getById: (id: string) =>
    api.get<ApiResponse<CierreDetail>>(`/ventas/cierres/${id}`),
  exportCsv: (id: string) =>
    api.get(`/ventas/cierres/${id}/csv`, { responseType: 'blob' }),
  getVentas: (cierreId: string, params?: VentaCierreQueryParams) =>
    api.get<ApiResponse<VentaCierreRespuesta>>(`/ventas/cierres/${cierreId}/ventas`, { params }),
};

// Ventas
export interface MovimientoCajaItem {
  id: string;
  tipo: 'ingreso' | 'egreso';
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
  tipo_fila: 'venta' | 'movimiento';
  created_at: string;
  usuario_nombre: string;
  monto: number;
  estado: 'Venta' | 'Ingreso' | 'Egreso';
  cantidad_items: number | null;
  referencia_id?: string | null;
}

export interface HistorialQueryParams {
  page?: number;
  limit?: number;
  sort?: 'created_at' | 'monto';
  order?: 'asc' | 'desc';
  fecha_desde?: string;
  fecha_hasta?: string;
  usuario_id?: string;
  tipo_fila?: 'venta' | 'movimiento';
}

export const ventasApi = {
  resumenDia: () => api.get<ApiResponse<unknown>>('/ventas/resumen/dia'),
  ultimasVentas: () => api.get<ApiResponse<unknown[]>>('/ventas/ultimas-ventas'),
  masVendidos: () => api.get<ApiResponse<unknown[]>>('/ventas/mas-vendidos'),
  list: (params?: Record<string, unknown>) =>
    api.get<ApiResponse<unknown[]>>('/ventas', { params }),
  historial: (params?: HistorialQueryParams) =>
    api.get<ApiResponse<FilaHistorial[]>>('/ventas/historial', { params }),
  getById: (id: string) => api.get<ApiResponse<unknown>>(`/ventas/${id}`),
  create: (data: unknown) => api.post<ApiResponse<unknown>>('/ventas', data),
  cerrarCaja: (data: { password: string }) => api.post<ApiResponse<unknown>>('/ventas/cierre-caja', data),
  delete: (id: string) => api.delete<ApiResponse<unknown>>(`/ventas/${id}`),
};

export const movimientosApi = {
  list: (params?: Record<string, unknown>) =>
    api.get<ApiResponse<MovimientoCajaItem[]> & { resumen?: ResumenMovimientos }>(
      '/ventas/movimientos',
      { params },
    ),
  create: (data: {
    tipo: 'ingreso' | 'egreso';
    monto: number;
    descripcion?: string;
    password: string;
  }) => api.post<ApiResponse<MovimientoCajaItem>>('/ventas/movimientos', data),
};
