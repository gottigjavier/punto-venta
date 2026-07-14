// tests/e2e/stock.spec.ts
// E2E tests for Stock management flows
// Section 8.2 - Flujo de stock
import { test, expect } from '@playwright/test';
import { createApiClient, TEST_USERS } from '../fixtures/test-data.js';
import type { ApiClient, RubroResponse, ProveedorResponse, ProductoResponse } from '../fixtures/test-data.js';

// Helper to create prerequisite data
async function createPrereqData(api: ApiClient): Promise<{
  rubroId: string;
  proveedorId: string;
}> {
  const rubro = await api.request<RubroResponse>('POST', '/api/v1/rubros', {
    nombre: `Rubro Stock Test ${Date.now()}`,
    descripcion: 'Rubro para tests de stock',
  });
  expect(rubro.status).toBe(201);

  const proveedor = await api.request<ProveedorResponse>('POST', '/api/v1/proveedores', {
    razon_social: `Proveedor Stock Test ${Date.now()}`,
    cuit: '30-11111111-1',
    email: 'stock@test.com',
  });
  expect(proveedor.status).toBe(201);

  return { rubroId: rubro.body.data!.id, proveedorId: proveedor.body.data!.id };
}

test.describe('Stock - Flujo de gestión de inventario', () => {
  let api: ApiClient;

  test.beforeEach(async () => {
    api = createApiClient();
    await api.login(TEST_USERS.admin.nik_usuario, TEST_USERS.admin.password);
  });

  test.afterEach(async () => {
    await api.logout();
  });

  test('Ingreso de producto nuevo', async () => {
    const { rubroId, proveedorId } = await createPrereqData(api);

    const result = await api.request<ProductoResponse>('POST', '/api/v1/stock/ingreso', {
      nombre: 'Pan Ingreso Test',
      codigo: `ING-${Date.now()}`,
      cantidad: 50,
      precio_compra: 180,
      precio_venta: 250,
      rubro_id: rubroId,
      proveedor_id: proveedorId,
      unidad_medida: 'unidad',
    });

    expect(result.status).toBe(201);
    expect(result.body.success).toBe(true);
    expect(result.body.data).toBeDefined();
    expect(result.body.data!.nombre).toBe('Pan Ingreso Test');
    expect(result.body.data!.cantidad_disponible).toBe(50);
    expect(result.body.data!.precio_venta).toBe(250);
    expect(result.body.data!.rubro_id).toBe(rubroId);
    expect(result.body.data!.proveedor_id).toBe(proveedorId);
  });

  test('Ingreso de producto existente con cambios actualiza stock', async () => {
    const { rubroId, proveedorId } = await createPrereqData(api);

    // First ingreso
    const first = await api.request<ProductoResponse>('POST', '/api/v1/stock/ingreso', {
      nombre: 'Leche Test',
      codigo: `LEC-${Date.now()}`,
      cantidad: 100,
      precio_compra: 100,
      precio_venta: 150,
      rubro_id: rubroId,
      proveedor_id: proveedorId,
    });
    expect(first.status).toBe(201);
    const productoId = first.body.data!.id;

    // Second ingreso with same code/proveedor but different quantity
    const second = await api.request<ProductoResponse>('POST', '/api/v1/stock/ingreso', {
      nombre: 'Leche Test',
      codigo: first.body.data!.codigo,
      cantidad: 150, // Changed from 100 to 150
      precio_compra: 100,
      precio_venta: 150,
      rubro_id: rubroId,
      proveedor_id: proveedorId,
    });

    expect(second.status).toBe(200);
    expect(second.body.data!.id).toBe(productoId); // Same product updated
    expect(second.body.data!.cantidad_disponible).toBe(150);
  });

  test('Ingreso con todos los campos iguales retorna error', async () => {
    const { rubroId, proveedorId } = await createPrereqData(api);
    const code = `DUP-${Date.now()}`;

    const first = await api.request<ProductoResponse>('POST', '/api/v1/stock/ingreso', {
      nombre: 'Producto Duplicado',
      codigo: code,
      cantidad: 100,
      precio_compra: 100,
      precio_venta: 150,
      rubro_id: rubroId,
      proveedor_id: proveedorId,
    });
    expect(first.status).toBe(201);

    // Same exact data
    const second = await api.request('POST', '/api/v1/stock/ingreso', {
      nombre: 'Producto Duplicado',
      codigo: code,
      cantidad: 100,
      precio_compra: 100,
      precio_venta: 150,
      rubro_id: rubroId,
      proveedor_id: proveedorId,
    });

    expect(second.status).toBe(400);
    expect(second.body.success).toBe(false);
    expect(second.body.error!.code).toBe('VALIDATION_ERROR');
  });

  test('Editar producto existente', async () => {
    const { rubroId, proveedorId } = await createPrereqData(api);

    // Create product
    const createResult = await api.request<ProductoResponse>('POST', '/api/v1/productos', {
      nombre: 'Producto Edit Test',
      codigo: `EDIT-${Date.now()}`,
      cantidad_disponible: 50,
      precio_compra: 100,
      precio_venta: 200,
      rubro_id: rubroId,
      proveedor_id: proveedorId,
    });
    expect(createResult.status).toBe(201);
    const productoId = createResult.body.data!.id;

    // Edit product
    const editResult = await api.request<ProductoResponse>('PUT', `/api/v1/stock/${productoId}`, {
      nombre: 'Producto Editado',
      precio_venta: 250,
      cantidad: 75,
    });

    expect(editResult.status).toBe(200);
    expect(editResult.body.success).toBe(true);
    expect(editResult.body.data!.nombre).toBe('Producto Editado');
    expect(editResult.body.data!.precio_venta).toBe(250);
    expect(editResult.body.data!.cantidad_disponible).toBe(75);
    // Non-updated fields should remain
    expect(editResult.body.data!.precio_compra).toBe(100);
  });

  test('Editar producto inexistente retorna 404', async () => {
    const result = await api.request('PUT', '/api/v1/stock/00000000-0000-0000-0000-000000000000', {
      nombre: 'No existe',
    });

    expect(result.status).toBe(404);
    expect(result.body.success).toBe(false);
  });

  test('Listar stock con filtros', async () => {
    const { rubroId, proveedorId } = await createPrereqData(api);

    // Create products
    await api.request('POST', '/api/v1/productos', {
      nombre: 'Stock List 1',
      codigo: `SL1-${Date.now()}`,
      cantidad_disponible: 50,
      precio_compra: 100,
      precio_venta: 200,
      rubro_id: rubroId,
      proveedor_id: proveedorId,
    });

    await api.request('POST', '/api/v1/productos', {
      nombre: 'Stock List 2',
      codigo: `SL2-${Date.now()}`,
      cantidad_disponible: 5,
      precio_compra: 100,
      precio_venta: 200,
      rubro_id: rubroId,
      proveedor_id: proveedorId,
    });

    // List all stock
    const allResult = await api.request('GET', '/api/v1/stock');
    expect(allResult.status).toBe(200);
    expect(allResult.body.success).toBe(true);
    expect(Array.isArray(allResult.body.data)).toBe(true);

    // Filter by stock bajo
    const lowStockResult = await api.request('GET', '/api/v1/stock?stock_bajo=true');
    expect(lowStockResult.status).toBe(200);
    expect(lowStockResult.body.success).toBe(true);

    // Filter by search
    const searchResult = await api.request('GET', '/api/v1/stock?search=Stock List');
    expect(searchResult.status).toBe(200);
    expect(searchResult.body.success).toBe(true);
  });

  test('Autocomplete de productos', async () => {
    const { rubroId, proveedorId } = await createPrereqData(api);

    await api.request('POST', '/api/v1/productos', {
      nombre: 'Autocomplete Test Product',
      codigo: `AUTO-${Date.now()}`,
      cantidad_disponible: 10,
      precio_compra: 50,
      precio_venta: 100,
      rubro_id: rubroId,
      proveedor_id: proveedorId,
    });

    // Search
    const result = await api.request('GET', '/api/v1/stock/autocomplete?query=Autocomplete&tipo=nombre');
    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(Array.isArray(result.body.data)).toBe(true);
    expect(result.body.data!.length).toBeGreaterThan(0);
  });

  test('Autocomplete con menos de 3 caracteres retorna error', async () => {
    const result = await api.request('GET', '/api/v1/stock/autocomplete?query=ab');
    expect(result.status).toBe(400);
    expect(result.body.success).toBe(false);
  });

  test('Ingreso con rubro inexistente retorna error', async () => {
    const { proveedorId } = await createPrereqData(api);

    const result = await api.request('POST', '/api/v1/stock/ingreso', {
      nombre: 'Test',
      codigo: `TEST-${Date.now()}`,
      cantidad: 10,
      precio_compra: 100,
      precio_venta: 200,
      rubro_id: '00000000-0000-0000-0000-000000000000',
      proveedor_id: proveedorId,
    });

    expect(result.status).toBe(404);
    expect(result.body.success).toBe(false);
  });

  test('Ingreso con proveedor inexistente retorna error', async () => {
    const { rubroId } = await createPrereqData(api);

    const result = await api.request('POST', '/api/v1/stock/ingreso', {
      nombre: 'Test',
      codigo: `TEST-${Date.now()}`,
      cantidad: 10,
      precio_compra: 100,
      precio_venta: 200,
      rubro_id: rubroId,
      proveedor_id: '00000000-0000-0000-0000-000000000000',
    });

    expect(result.status).toBe(404);
    expect(result.body.success).toBe(false);
  });

  test('Verificar alertas de vencimiento en stock', async () => {
    const { rubroId, proveedorId } = await createPrereqData(api);

    // Create product with near expiration (tomorrow)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    await api.request('POST', '/api/v1/productos', {
      nombre: 'Producto Por Vencer',
      codigo: `VENCE-${Date.now()}`,
      cantidad_disponible: 20,
      precio_compra: 100,
      precio_venta: 200,
      rubro_id: rubroId,
      proveedor_id: proveedorId,
      fecha_vencimiento: tomorrowStr,
    });

    // Create product that already expired
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    await api.request('POST', '/api/v1/productos', {
      nombre: 'Producto Vencido',
      codigo: `VENC-${Date.now()}`,
      cantidad_disponible: 10,
      precio_compra: 100,
      precio_venta: 200,
      rubro_id: rubroId,
      proveedor_id: proveedorId,
      fecha_vencimiento: yesterdayStr,
    });

    // List stock - should show expiration alerts
    const result = await api.request('GET', '/api/v1/stock');
    expect(result.status).toBe(200);

    // Filter expired
    const expiredResult = await api.request('GET', '/api/v1/stock?vencidos=true');
    expect(expiredResult.status).toBe(200);
    expect(Array.isArray(expiredResult.body.data)).toBe(true);

    // Filter expiring soon
    const expiringResult = await api.request('GET', '/api/v1/stock?vencimiento_dias=30');
    expect(expiringResult.status).toBe(200);
  });

  test('Ingreso de producto con fecha de vencimiento', async () => {
    const { rubroId, proveedorId } = await createPrereqData(api);

    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 6);
    const futureDateStr = futureDate.toISOString().split('T')[0];

    const result = await api.request<ProductoResponse>('POST', '/api/v1/stock/ingreso', {
      nombre: 'Producto con Vto',
      codigo: `VTO-${Date.now()}`,
      cantidad: 30,
      precio_compra: 120,
      precio_venta: 200,
      rubro_id: rubroId,
      proveedor_id: proveedorId,
      fecha_compra: new Date().toISOString().split('T')[0],
      fecha_vencimiento: futureDateStr,
      numero_remesa: `REM-${Date.now()}`,
      unidad_medida: 'kg',
    });

    expect(result.status).toBe(201);
    expect(result.body.data!.fecha_vencimiento).toBeDefined();
    expect(result.body.data!.unidad_medida).toBe('kg');
  });
});
