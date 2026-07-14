// src/__tests__/helpers/prisma-mock.ts
// Prisma client mock for testing
import { vi } from 'vitest';

// Helper to create a fresh mock Prisma client (use inside vi.hoisted)
export function createMockPrismaClient() {
  return {
    producto: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    proveedor: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    rubro: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    usuario: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
    venta: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    detalleVenta: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
}

// Helper to reset all mocks
export function resetMocks(): void {
  vi.clearAllMocks();
}

// Helper to create mock product
export function createMockProducto(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: '123e4567-e89b-12d3-a456-426614174000',
    nombre: 'Pan integral',
    codigo: 'PAN-001',
    cantidad_disponible: 45,
    precio_compra: 150,
    precio_venta: 250,
    rubro_id: '123e4567-e89b-12d3-a456-426614174010',
    proveedor_id: '123e4567-e89b-12d3-a456-426614174011',
    fecha_compra: new Date('2024-01-15'),
    fecha_vencimiento: new Date('2024-12-31'),
    numero_remesa: 'REM-001',
    unidad_medida: 'unidad',
    created_at: new Date(),
    updated_at: new Date(),
    rubro: {
      id: '123e4567-e89b-12d3-a456-426614174010',
      nombre: 'Panadería',
    },
    proveedor: {
      id: '123e4567-e89b-12d3-a456-426614174011',
      razon_social: 'Distribuidora Ejemplo S.A.',
    },
    ...overrides,
  };
}

// Helper to create mock supplier
export function createMockProveedor(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: '123e4567-e89b-12d3-a456-426614174001',
    razon_social: 'Distribuidora Ejemplo S.A.',
    representante: 'Juan Pérez',
    cuit: '30-71234567-9',
    direccion_postal: 'Av. Corrientes 1234',
    email: 'contacto@ejemplo.com',
    telefonos: ['+5491122223333'],
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

// Helper to create mock rubro
export function createMockRubro(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: '123e4567-e89b-12d3-a456-426614174010',
    nombre: 'Panadería',
    descripcion: 'Productos de panadería',
    activo: true,
    created_at: new Date(),
    updated_at: new Date(),
    _count: {
      productos: 5,
    },
    ...overrides,
  };
}

// Helper to create mock user
export function createMockUsuario(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: '123e4567-e89b-12d3-a456-426614174002',
    nombre_usuario: 'Juan Pérez',
    nik_usuario: 'jperez',
    password_hash: '$2a$12$LJ3m4ys3Lz0QvQvQvQvQvOeXz0QvQvQvQvQvQvQvQvQvQvQvQ',
    email: 'juan@ejemplo.com',
    telefono: '+5491122223333',
    rol: 'despachador',
    activo: true,
    intentos_fallidos: 0,
    bloqueado_hasta: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}
