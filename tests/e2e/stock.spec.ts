// tests/e2e/stock.spec.ts
// E2E tests for Stock management flows (modelo Lote tras el split Producto/Lote)
// Section 8.2 - Flujo de stock
import { test, expect } from '@playwright/test';
import { createApiClient, TEST_USERS } from '../fixtures/test-data.js';
import type { ApiClient, RubroResponse, ProveedorResponse, ProductoResponse, LoteResponse } from '../fixtures/test-data.js';

// Helper to create prerequisite data (rubro + proveedor + producto)
async function createPrereqData(api: ApiClient): Promise<{
  rubroId: string;
  proveedorId: string;
  productoId: string;
  codigo: string;
}> {
  const rubro = await api.request<RubroResponse>('POST', '/api/v1/rubros', {
    nombre: `Rubro Stock Test ${Date.now()}`,
    descripcion: 'Rubro para tests de stock',
  });
  expect(rubro.status).toBe(201);

  const proveedor = await api.request<ProveedorResponse>('POST', '/api/v1/proveedores', {
    razon_social: `Proveedor Stock Test ${Date.now()}`,
    cuit: `30-${Math.floor(Math.random() * 90000000 + 10000000)}-${Math.floor(Math.random() * 9) + 1}`,
    email: 'stock@test.com',
  });
  expect(proveedor.status).toBe(201);

  const codigo = `PROD-${Date.now()}`;
  const producto = await api.request<ProductoResponse>('POST', '/api/v1/productos', {
    nombre: 'Producto Stock Test',
    codigo,
    precio_venta: 250,
    rubro_id: rubro.body.data!.id,
    proveedor_id: proveedor.body.data!.id,
    unidad_medida: 'unidad',
  });
  expect(producto.status).toBe(201);

  return {
    rubroId: rubro.body.data!.id,
    proveedorId: proveedor.body.data!.id,
    productoId: producto.body.data!.id,
    codigo,
  };
}

test.describe('Stock (Lote) - Flujo de gestión de inventario', () => {
  let api: ApiClient;

  test.beforeEach(async () => {
    api = createApiClient();
    await api.login(TEST_USERS.admin.nik_usuario, TEST_USERS.admin.password);
  });

  test.afterEach(async () => {
    await api.logout();
  });

  test('Ingreso de lote nuevo', async () => {
    const { rubroId, proveedorId, productoId } = await createPrereqData(api);

    const result = await api.request<LoteResponse>('POST', '/api/v1/stock/ingreso', {
      producto_id: productoId,
      numero_lote: `LOTE-${Date.now()}`,
      cantidad: 50,
      precio_compra: 180,
      rubro_id: rubroId,
      proveedor_id: proveedorId,
      unidad_medida: 'unidad',
    });

    expect(result.status).toBe(201);
    expect(result.body.success).toBe(true);
    expect(result.body.data).toBeDefined();
    expect(result.body.data!.numero_lote).toBeDefined();
    expect(result.body.data!.cantidad_disponible).toBe(50);
    expect(result.body.data!.estado).toBe('activo');
    expect(result.body.data!.producto.id).toBe(productoId);
  });

  test('Ingreso a lote existente (mismo producto + N° de Lote + vencimiento) suma stock', async () => {
    const { productoId } = await createPrereqData(api);
    const numeroLote = `LOTE-${Date.now()}`;
    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 6);
    const futureStr = futureDate.toISOString().split('T')[0];

    const first = await api.request<LoteResponse>('POST', '/api/v1/stock/ingreso', {
      producto_id: productoId,
      numero_lote: numeroLote,
      cantidad: 100,
      precio_compra: 100,
      fecha_vencimiento: futureStr,
    });
    expect(first.status).toBe(201);
    const loteId = first.body.data!.id;

    // Mismo producto + N° de Lote + vencimiento → incrementa el existente
    const second = await api.request<LoteResponse>('POST', '/api/v1/stock/ingreso', {
      producto_id: productoId,
      numero_lote: numeroLote,
      cantidad: 50,
      precio_compra: 100,
      fecha_vencimiento: futureStr,
    });

    expect(second.status).toBe(200);
    expect(second.body.data!.id).toBe(loteId); // mismo lote
    expect(second.body.data!.cantidad_disponible).toBe(150);
  });

  test('Mismo N° de Lote con distinto vencimiento crea un lote nuevo', async () => {
    const { productoId } = await createPrereqData(api);
    const numeroLote = `LOTE-${Date.now()}`;

    const v1 = new Date();
    v1.setMonth(v1.getMonth() + 3);
    const v2 = new Date();
    v2.setMonth(v2.getMonth() + 9);

    const first = await api.request<LoteResponse>('POST', '/api/v1/stock/ingreso', {
      producto_id: productoId,
      numero_lote: numeroLote,
      cantidad: 10,
      precio_compra: 100,
      fecha_vencimiento: v1.toISOString().split('T')[0],
    });
    expect(first.status).toBe(201);

    const second = await api.request<LoteResponse>('POST', '/api/v1/stock/ingreso', {
      producto_id: productoId,
      numero_lote: numeroLote,
      cantidad: 20,
      precio_compra: 100,
      fecha_vencimiento: v2.toISOString().split('T')[0],
    });
    expect(second.status).toBe(201);
    expect(second.body.data!.id).not.toBe(first.body.data!.id); // lote distinto
    expect(second.body.data!.numero_lote).toBe(numeroLote);
  });

  test('Ingreso sin producto_id retorna 400', async () => {
    const result = await api.request('POST', '/api/v1/stock/ingreso', {
      numero_lote: 'LOTE-X',
      cantidad: 10,
      precio_compra: 100,
    });
    expect(result.status).toBe(400);
    expect(result.body.success).toBe(false);
    expect(result.body.error!.code).toBe('VALIDATION_ERROR');
  });

  test('Editar lote existente', async () => {
    const { productoId } = await createPrereqData(api);

    const create = await api.request<LoteResponse>('POST', '/api/v1/stock/ingreso', {
      producto_id: productoId,
      numero_lote: `LOTE-${Date.now()}`,
      cantidad: 30,
      precio_compra: 90,
    });
    expect(create.status).toBe(201);
    const loteId = create.body.data!.id;

    const edit = await api.request<LoteResponse>('PUT', `/api/v1/lotes/${loteId}`, {
      numero_lote: 'LOTE-EDIT',
      precio_compra: 120,
    });
    expect(edit.status).toBe(200);
    expect(edit.body.success).toBe(true);
    expect(edit.body.data!.numero_lote).toBe('LOTE-EDIT');
    expect(edit.body.data!.precio_compra).toBe(120);
    // La edición NUNCA toca la cantidad
    expect(edit.body.data!.cantidad_disponible).toBe(30);
  });

  test('Editar lote inexistente retorna 404', async () => {
    const result = await api.request('PUT', '/api/v1/lotes/00000000-0000-0000-0000-000000000000', {
      numero_lote: 'X',
    });
    expect(result.status).toBe(404);
    expect(result.body.success).toBe(false);
  });

  test('Listar stock (fila por lote) con filtros', async () => {
    const { productoId } = await createPrereqData(api);

    await api.request('POST', '/api/v1/stock/ingreso', {
      producto_id: productoId,
      numero_lote: `LOTE-${Date.now()}`,
      cantidad: 50,
      precio_compra: 100,
    });

    const allResult = await api.request('GET', '/api/v1/stock');
    expect(allResult.status).toBe(200);
    expect(allResult.body.success).toBe(true);
    expect(Array.isArray(allResult.body.data)).toBe(true);

    const searchResult = await api.request('GET', `/api/v1/stock?search=${productoId.slice(0, 8)}`);
    expect(searchResult.status).toBe(200);
    expect(searchResult.body.success).toBe(true);
  });

  test('Autocomplete de productos', async () => {
    const { productoId } = await createPrereqData(api);

    const result = await api.request('GET', '/api/v1/stock/autocomplete?query=Producto&tipo=nombre');
    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(Array.isArray(result.body.data)).toBe(true);
  });

  test('Autocomplete con menos de 3 caracteres retorna error', async () => {
    const result = await api.request('GET', '/api/v1/stock/autocomplete?query=ab');
    expect(result.status).toBe(400);
    expect(result.body.success).toBe(false);
  });

  test('Ingreso con producto inexistente retorna 404', async () => {
    const result = await api.request('POST', '/api/v1/stock/ingreso', {
      producto_id: '00000000-0000-0000-0000-000000000000',
      numero_lote: 'LOTE-X',
      cantidad: 10,
      precio_compra: 100,
    });
    expect(result.status).toBe(404);
    expect(result.body.success).toBe(false);
  });

  test('Verificar alertas de vencimiento en stock', async () => {
    const { productoId } = await createPrereqData(api);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    await api.request('POST', '/api/v1/stock/ingreso', {
      producto_id: productoId,
      numero_lote: `VENCE-${Date.now()}`,
      cantidad: 20,
      precio_compra: 100,
      fecha_vencimiento: tomorrow.toISOString().split('T')[0],
    });
    await api.request('POST', '/api/v1/stock/ingreso', {
      producto_id: productoId,
      numero_lote: `VENC-${Date.now()}`,
      cantidad: 10,
      precio_compra: 100,
      fecha_vencimiento: yesterday.toISOString().split('T')[0],
    });

    const result = await api.request('GET', '/api/v1/stock');
    expect(result.status).toBe(200);

    const expiredResult = await api.request('GET', '/api/v1/stock?vencidos=true');
    expect(expiredResult.status).toBe(200);
    expect(Array.isArray(expiredResult.body.data)).toBe(true);

    const expiringResult = await api.request('GET', '/api/v1/stock?vencimiento_dias=30');
    expect(expiringResult.status).toBe(200);
  });

  test('Ingreso de lote con fecha de vencimiento', async () => {
    const { productoId } = await createPrereqData(api);

    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 6);
    const futureDateStr = futureDate.toISOString().split('T')[0];

    const result = await api.request<LoteResponse>('POST', '/api/v1/stock/ingreso', {
      producto_id: productoId,
      numero_lote: `LOTE-${Date.now()}`,
      cantidad: 30,
      precio_compra: 120,
      fecha_compra: new Date().toISOString().split('T')[0],
      fecha_vencimiento: futureDateStr,
      unidad_medida: 'kg',
    });

    expect(result.status).toBe(201);
    expect(result.body.data!.fecha_vencimiento).toBeDefined();
    expect(result.body.data!.numero_lote).toBeDefined();
  });
});
