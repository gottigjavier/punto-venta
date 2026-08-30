// src/__tests__/helpers/prisma-mock.ts
// Prisma client mock for testing
// Tras el split Producto/Lote: el producto es el maestro (sin campos de
// stock/compra) y el Lote concentra cantidad/vencimiento/precio_compra.
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
    lote: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
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
      updateMany: vi.fn(),
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
      deleteMany: vi.fn(),
    },
    cierreCaja: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    movimientoCaja: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
  };
}

// Helper to reset all mocks
export function resetMocks(): void {
  vi.clearAllMocks();
}

// Helper to create mock product — SOLO campos del maestro (sin stock/compra).
// El stock se expone como stock_actual (calculado) y el soft delete como activo.
export function createMockProducto(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: '123e4567-e89b-12d3-a456-426614174000',
    nombre: 'Pan integral',
    codigo: 'PAN-001',
    cantidad_aviso: 0,
    precio_venta: 250,
    rubro_id: '123e4567-e89b-12d3-a456-426614174010',
    proveedor_id: '123e4567-e89b-12d3-a456-426614174011',
    unidad_medida: 'unidad' as const,
    activo: true,
    stock_actual: 45,
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

// Helper to create mock lote — shape RAW de Prisma (lo que devuelve
// lote.findMany/findUnique con include: loteInclude). El use-case (mapLote)
// "sube" rubro/proveedor al nivel superior: el resultado tipado es
// LoteWithRelations con rubro/proveedor sueltos.
export function createMockLote(overrides?: Partial<Record<string, unknown>>) {
  const productoId = '123e4567-e89b-12d3-a456-426614174000';
  return {
    id: '123e4567-e89b-12d3-a456-426614174020',
    producto_id: productoId,
    numero_lote: 'L-001',
    cantidad_disponible: 45,
    fecha_compra: new Date('2024-01-15'),
    fecha_vencimiento: new Date('2024-12-31'),
    precio_compra: 150,
    estado: 'activo' as const,
    created_at: new Date('2024-01-15'),
    producto: {
      id: productoId,
      nombre: 'Pan integral',
      codigo: 'PAN-001',
      unidad_medida: 'unidad' as const,
      precio_venta: 250,
      cantidad_aviso: 0,
      rubro: {
        id: '123e4567-e89b-12d3-a456-426614174010',
        nombre: 'Panadería',
      },
      proveedor: {
        id: '123e4567-e89b-12d3-a456-426614174011',
        razon_social: 'Distribuidora Ejemplo S.A.',
      },
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