// tests/e2e/ventas.spec.ts
// E2E tests for Sales flows
// Section 8.2 - Flujo de ventas
import { test, expect } from '@playwright/test';
import { createApiClient, TEST_USERS } from '../fixtures/test-data.js';
import type { ApiClient, RubroResponse, ProveedorResponse, ProductoResponse } from '../fixtures/test-data.js';

// Helper to setup test data
async function setupTestData(api: ApiClient): Promise<{
  rubroId: string;
  proveedorId: string;
  productoId: string;
}> {
  // Create rubro
  const rubroResult = await api.request<RubroResponse>('POST', '/api/v1/rubros', {
    nombre: `Rubro Venta Test ${Date.now()}`,
    descripcion: 'Rubro para tests de venta',
  });
  expect(rubroResult.status).toBe(201);
  const rubroId = rubroResult.body.data!.id;

  // Create proveedor
  const proveedorResult = await api.request<ProveedorResponse>('POST', '/api/v1/proveedores', {
    razon_social: `Proveedor Venta Test ${Date.now()}`,
    cuit: '30-87654321-0',
    email: 'venta@test.com',
  });
  expect(proveedorResult.status).toBe(201);
  const proveedorId = proveedorResult.body.data!.id;

  // Create product with stock
  const productoResult = await api.request<ProductoResponse>('POST', '/api/v1/productos', {
    nombre: `Producto Venta Test ${Date.now()}`,
    codigo: `VEN-${Date.now()}`,
    cantidad_disponible: 100,
    precio_compra: 150,
    precio_venta: 250,
    rubro_id: rubroId,
    proveedor_id: proveedorId,
    unidad_medida: 'unidad',
  });
  expect(productoResult.status).toBe(201);
  const productoId = productoResult.body.data!.id;

  return { rubroId, proveedorId, productoId };
}

test.describe('Ventas - Flujo completo de ventas', () => {
  let api: ApiClient;

  test.beforeEach(async () => {
    api = createApiClient();
    // Login as admin (full access)
    await api.login(TEST_USERS.admin.nik_usuario, TEST_USERS.admin.password);
  });

  test.afterEach(async () => {
    await api.logout();
  });

  test('Flujo completo: Login → listar productos → crear venta → verificar stock reducido', async () => {
    // 1. Setup test data
    const { productoId } = await setupTestData(api);

    // 2. List products (verify product exists)
    const listResult = await api.request<ProductoResponse[]>('GET', '/api/v1/productos');
    expect(listResult.status).toBe(200);
    expect(listResult.body.success).toBe(true);
    const product = listResult.body.data?.find(
      (p: ProductoResponse) => p.id === productoId
    );
    expect(product).toBeDefined();
    expect(product!.cantidad_disponible).toBe(100);

    // 3. Create sale (buy 10 units at $250 each)
    const saleResult = await api.request('POST', '/api/v1/ventas', {
      productos: [
        {
          producto_id: productoId,
          cantidad: 10,
          precio_unitario: 250,
        },
      ],
    });

    expect(saleResult.status).toBe(201);
    expect(saleResult.body.success).toBe(true);
    expect(saleResult.body.data).toBeDefined();

    const sale = saleResult.body.data as Record<string, unknown>;
    expect(sale.id).toBeDefined();
    expect(sale.estado).toBe('completada');
    expect(Number(sale.total)).toBe(2500); // 10 * 250

    // Verify details
    const detalles = sale.detalles_venta as Array<Record<string, unknown>>;
    expect(detalles).toHaveLength(1);
    expect(Number(detalles[0]!.cantidad)).toBe(10);
    expect(Number(detalles[0]!.precio_unitario)).toBe(250);
    expect(Number(detalles[0]!.subtotal)).toBe(2500);

    // 4. Verify stock was reduced
    const afterSaleProduct = await api.request<ProductoResponse>(
      'GET',
      `/api/v1/productos/${productoId}`
    );
    expect(afterSaleProduct.status).toBe(200);
    expect(afterSaleProduct.body.data!.cantidad_disponible).toBe(90); // 100 - 10 = 90
  });

  test('Venta con stock insuficiente retorna error', async () => {
    // 1. Setup test data
    const { productoId } = await setupTestData(api);

    // 2. Try to sell more than available stock
    const saleResult = await api.request('POST', '/api/v1/ventas', {
      productos: [
        {
          producto_id: productoId,
          cantidad: 200, // Only 100 available
          precio_unitario: 250,
        },
      ],
    });

    expect(saleResult.status).toBe(409);
    expect(saleResult.body.success).toBe(false);
    expect(saleResult.body.error!.code).toBe('STOCK_INSUFFICIENT');
    expect(saleResult.body.error!.disponible).toBe(100);
    expect(saleResult.body.error!.solicitado).toBe(200);

    // Verify stock was NOT reduced
    const afterSaleProduct = await api.request<ProductoResponse>(
      'GET',
      `/api/v1/productos/${productoId}`
    );
    expect(afterSaleProduct.body.data!.cantidad_disponible).toBe(100);
  });

  test('Venta con producto inexistente retorna error', async () => {
    const result = await api.request('POST', '/api/v1/ventas', {
      productos: [
        {
          producto_id: '00000000-0000-0000-0000-000000000000',
          cantidad: 1,
          precio_unitario: 100,
        },
      ],
    });

    expect(result.status).toBe(404);
    expect(result.body.success).toBe(false);
    expect(result.body.error!.code).toBe('NOT_FOUND');
  });

  test('Venta con body inválido retorna error de validación', async () => {
    const result = await api.request('POST', '/api/v1/ventas', {
      productos: [],
    });

    expect(result.status).toBe(400);
    expect(result.body.success).toBe(false);
    expect(result.body.error!.code).toBe('VALIDATION_ERROR');
  });

  test('Venta con cantidad 0 retorna error de validación', async () => {
    const { productoId } = await setupTestData(api);

    const result = await api.request('POST', '/api/v1/ventas', {
      productos: [
        {
          producto_id: productoId,
          cantidad: 0,
          precio_unitario: 250,
        },
      ],
    });

    expect(result.status).toBe(400);
    expect(result.body.success).toBe(false);
  });

  test('Listar ventas con paginación', async () => {
    // Create a sale first
    const { productoId } = await setupTestData(api);
    await api.request('POST', '/api/v1/ventas', {
      productos: [{ producto_id: productoId, cantidad: 1, precio_unitario: 250 }],
    });

    // List sales
    const result = await api.request('GET', '/api/v1/ventas?page=1&limit=10');
    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(result.body.data).toBeDefined();
    expect(Array.isArray(result.body.data)).toBe(true);
    expect(result.body.pagination).toBeDefined();
    expect(result.body.pagination!.page).toBe(1);
    expect(result.body.pagination!.limit).toBe(10);
  });

  test('Obtener venta por ID', async () => {
    // Create a sale first
    const { productoId } = await setupTestData(api);
    const createResult = await api.request('POST', '/api/v1/ventas', {
      productos: [{ producto_id: productoId, cantidad: 5, precio_unitario: 250 }],
    });
    const saleId = (createResult.body.data as Record<string, unknown>).id as string;

    // Get by ID
    const result = await api.request('GET', `/api/v1/ventas/${saleId}`);
    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect((result.body.data as Record<string, unknown>).id).toBe(saleId);
  });

  test('Obtener venta inexistente retorna 404', async () => {
    const result = await api.request(
      'GET',
      '/api/v1/ventas/00000000-0000-0000-0000-000000000000'
    );
    expect(result.status).toBe(404);
    expect(result.body.success).toBe(false);
  });

  test('Resumen diario de ventas', async () => {
    // Create some sales
    const { productoId } = await setupTestData(api);
    await api.request('POST', '/api/v1/ventas', {
      productos: [{ producto_id: productoId, cantidad: 2, precio_unitario: 250 }],
    });

    // Get daily summary
    const result = await api.request('GET', '/api/v1/ventas/resumen/dia');
    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);

    const resumen = result.body.data as Record<string, unknown>;
    expect(resumen.fecha).toBeDefined();
    expect(typeof resumen.total_ventas).toBe('number');
    expect(typeof resumen.monto_total).toBe('number');
    expect(Array.isArray(resumen.productos_vendidos)).toBe(true);
    expect(Array.isArray(resumen.ventas_por_usuario)).toBe(true);
  });

  test('Despachador puede crear venta', async () => {
    // Switch to despachador
    api.clearToken();
    await api.login(TEST_USERS.despachador.nik_usuario, TEST_USERS.despachador.password);

    // Setup: admin creates test data first
    const adminApi = createApiClient();
    await adminApi.login(TEST_USERS.admin.nik_usuario, TEST_USERS.admin.password);
    const { productoId } = await setupTestData(adminApi);
    await adminApi.logout();

    // Despachador creates sale
    const result = await api.request('POST', '/api/v1/ventas', {
      productos: [{ producto_id: productoId, cantidad: 3, precio_unitario: 250 }],
    });
    expect(result.status).toBe(201);
    expect(result.body.success).toBe(true);
  });

  test('Venta con múltiples productos', async () => {
    // Create two products
    const { proveedorId, rubroId } = await setupTestData(api);

    const prod1 = await api.request<ProductoResponse>('POST', '/api/v1/productos', {
      nombre: 'Producto Multi 1',
      codigo: `MULTI-1-${Date.now()}`,
      cantidad_disponible: 50,
      precio_compra: 100,
      precio_venta: 200,
      rubro_id: rubroId,
      proveedor_id: proveedorId,
    });
    const prod2 = await api.request<ProductoResponse>('POST', '/api/v1/productos', {
      nombre: 'Producto Multi 2',
      codigo: `MULTI-2-${Date.now()}`,
      cantidad_disponible: 30,
      precio_compra: 150,
      precio_venta: 300,
      rubro_id: rubroId,
      proveedor_id: proveedorId,
    });

    const id1 = prod1.body.data!.id;
    const id2 = prod2.body.data!.id;

    // Create sale with both products
    const result = await api.request('POST', '/api/v1/ventas', {
      productos: [
        { producto_id: id1, cantidad: 5, precio_unitario: 200 },
        { producto_id: id2, cantidad: 3, precio_unitario: 300 },
      ],
    });

    expect(result.status).toBe(201);
    expect(result.body.success).toBe(true);

    const sale = result.body.data as Record<string, unknown>;
    expect(Number(sale.total)).toBe(1900); // (5*200) + (3*300) = 1000 + 900

    const detalles = sale.detalles_venta as Array<Record<string, unknown>>;
    expect(detalles).toHaveLength(2);

    // Verify stock for both products
    const after1 = await api.request<ProductoResponse>('GET', `/api/v1/productos/${id1}`);
    const after2 = await api.request<ProductoResponse>('GET', `/api/v1/productos/${id2}`);
    expect(after1.body.data!.cantidad_disponible).toBe(45); // 50 - 5
    expect(after2.body.data!.cantidad_disponible).toBe(27); // 30 - 3
  });
});
