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

// Stock
export const stockApi = {
  list: (params?: Record<string, unknown>) =>
    api.get<ApiResponse<unknown[]>>('/stock', { params }),
  ingreso: (data: unknown) => api.post<ApiResponse<unknown>>('/stock/ingreso', data),
  edit: (id: string, data: unknown) =>
    api.put<ApiResponse<unknown>>(`/stock/${id}`, data),
  autocomplete: (query: string, tipo?: string) =>
    api.get<ApiResponse<unknown[]>>('/stock/autocomplete', { params: { query, tipo } }),
};

// Cierres de Caja
export interface CierreListItem {
  id: string;
  fecha_apertura: string;
  fecha_cierre: string | null;
  monto_total: number;
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

export interface CierreDetail {
  id: string;
  fecha_apertura: string;
  fecha_cierre: string | null;
  monto_total: number;
  cantidad_ventas: number;
  estado: string;
  usuario_apertura: { id: string; nombre_usuario: string };
  usuario_cierre: { id: string; nombre_usuario: string } | null;
  detalles: CierreDetalle[];
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
export const ventasApi = {
  resumenDia: () => api.get<ApiResponse<unknown>>('/ventas/resumen/dia'),
  ultimasVentas: () => api.get<ApiResponse<unknown[]>>('/ventas/ultimas-ventas'),
  masVendidos: () => api.get<ApiResponse<unknown[]>>('/ventas/mas-vendidos'),
  list: (params?: Record<string, unknown>) =>
    api.get<ApiResponse<unknown[]>>('/ventas', { params }),
  getById: (id: string) => api.get<ApiResponse<unknown>>(`/ventas/${id}`),
  create: (data: unknown) => api.post<ApiResponse<unknown>>('/ventas', data),
  cerrarCaja: (data: { password: string }) => api.post<ApiResponse<unknown>>('/ventas/cierre-caja', data),
  delete: (id: string) => api.delete<ApiResponse<unknown>>(`/ventas/${id}`),
};
