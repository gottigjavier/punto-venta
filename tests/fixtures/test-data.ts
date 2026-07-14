// tests/fixtures/test-data.ts
// Shared test data and helpers for E2E tests

// ===== Test Users =====
export const TEST_USERS = {
  admin: {
    nik_usuario: 'admin',
    password: 'Admin123!',
    nombre_usuario: 'Administrador Test',
    email: 'admin@test.com',
    rol: 'admin' as const,
  },
  gerente: {
    nik_usuario: 'gerente',
    password: 'Gerente123!',
    nombre_usuario: 'Gerente Test',
    email: 'gerente@test.com',
    rol: 'gerente' as const,
  },
  despachador: {
    nik_usuario: 'despachador',
    password: 'Despachador123!',
    nombre_usuario: 'Despachador Test',
    email: 'despachador@test.com',
    rol: 'despachador' as const,
  },
};

// ===== Test Entities =====
export const TEST_RUBRO = {
  nombre: 'Panadería Test',
  descripcion: 'Rubro de prueba para tests E2E',
};

export const TEST_PROVEEDOR = {
  razon_social: 'Distribuidora Test S.A.',
  representante: 'Juan Test',
  cuit: '20-12345678-9',
  email: 'test@distribuidora.com',
  telefonos: ['11-1234-5678'],
};

export const TEST_PRODUCTO = {
  nombre: 'Pan Integral Test',
  codigo: 'PAN-TEST-001',
  cantidad_disponible: 50,
  precio_compra: 180,
  precio_venta: 250,
  unidad_medida: 'unidad' as const,
};

// ===== API Response Types =====
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    disponible?: number;
    solicitado?: number;
  };
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    nombre_usuario: string;
    nik_usuario: string;
    email: string;
    rol: string;
  };
}

export interface ProductoResponse {
  id: string;
  nombre: string;
  codigo: string;
  cantidad_disponible: number;
  precio_compra: number;
  precio_venta: number;
  rubro_id: string;
  proveedor_id: string;
  unidad_medida: string;
}

export interface RubroResponse {
  id: string;
  nombre: string;
  descripcion?: string;
  activo: boolean;
}

export interface ProveedorResponse {
  id: string;
  razon_social: string;
  representante?: string;
  cuit?: string;
}

// ===== Test Helpers =====
export class ApiClient {
  private baseUrl: string;
  private accessToken: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setToken(token: string): void {
    this.accessToken = token;
  }

  clearToken(): void {
    this.accessToken = null;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }
    return headers;
  }

  async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>
  ): Promise<{ status: number; body: ApiResponse<T> }> {
    const options: RequestInit = {
      method,
      headers: this.getHeaders(),
    };
    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${this.baseUrl}${path}`, options);
    const responseBody = await response.json() as ApiResponse<T>;

    return {
      status: response.status,
      body: responseBody,
    };
  }

  async login(
    nik_usuario: string,
    password: string
  ): Promise<{ status: number; body: ApiResponse<LoginResponse> }> {
    const result = await this.request<LoginResponse>('POST', '/api/v1/auth/login', {
      nik_usuario,
      password,
    });
    if (result.status === 200 && result.body.data) {
      this.setToken(result.body.data.accessToken);
    }
    return result;
  }

  async logout(): Promise<void> {
    await this.request('POST', '/api/v1/auth/logout');
    this.clearToken();
  }
}

// ===== Setup Helpers =====
export function createApiClient(): ApiClient {
  return new ApiClient(process.env.API_URL || 'http://localhost:3001');
}
