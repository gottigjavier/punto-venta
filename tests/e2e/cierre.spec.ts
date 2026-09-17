// tests/e2e/cierre.spec.ts
// E2E tests for Cash closing flow
// TS3 (reporte 26/09): faltaba e2e de cierre de caja.
//   "Playwright es API-solo; sin e2e de UI ni de cierre (...) Sugerencia: al menos
//    un e2e de cerrarCaja (abrir→vender→cerrar→verificar reporte/stock)."
//
// El flujo del sistema no expone un endpoint "abrir caja": el periodo activo es
// implícito (ventas con cierre_caja_id NULL). "Abrir" = primer movimiento del
// periodo (ingreso de stock a lote). Luego: vender → cerrar caja (password) →
// verificar el reporte del cierre (listado, detalle, filas por venta) y que el
// cierre NO toca el stock (solo lo archiva).
import { test, expect } from "@playwright/test";
import { createApiClient, TEST_USERS } from "../fixtures/test-data.js";
import type { ApiClient, RubroResponse, ProveedorResponse, ProductoResponse, LoteResponse } from "../fixtures/test-data.js";

// Helper to setup test data (rubro + proveedor + producto + lote con stock)
async function setupTestData(api: ApiClient): Promise<{
  productoId: string;
  stockInicial: number;
}> {
  const rubroResult = await api.request<RubroResponse>("POST", "/api/v1/rubros", {
    nombre: `Rubro Cierre Test ${Date.now()}`,
    descripcion: "Rubro para tests de cierre de caja",
  });
  expect(rubroResult.status).toBe(201);

  const proveedorResult = await api.request<ProveedorResponse>("POST", "/api/v1/proveedores", {
    razon_social: `Proveedor Cierre Test ${Date.now()}`,
    cuit: `30-${Math.floor(Math.random() * 90000000 + 10000000)}-${Math.floor(Math.random() * 9) + 1}`,
    email: "cierre@test.com",
  });
  expect(proveedorResult.status).toBe(201);

  const productoResult = await api.request<ProductoResponse>("POST", "/api/v1/productos", {
    nombre: `Producto Cierre Test ${Date.now()}`,
    codigo: `CIE-${Date.now()}`,
    precio_venta: 250,
    rubro_id: rubroResult.body.data!.id,
    proveedor_id: proveedorResult.body.data!.id,
    unidad_medida: "unidad",
  });
  expect(productoResult.status).toBe(201);
  const productoId = productoResult.body.data!.id;

  const stockInicial = 100;
  const lote = await api.request<LoteResponse>("POST", "/api/v1/stock/ingreso", {
    producto_id: productoId,
    numero_lote: `LOTE-CIE-${Date.now()}`,
    cantidad: stockInicial,
    precio_compra: 150,
  });
  expect(lote.status).toBe(201);

  return { productoId, stockInicial };
}

test.describe("Cierre de caja - Flujo completo", () => {
  let api: ApiClient;

  test.beforeEach(async () => {
    api = createApiClient();
    await api.login(TEST_USERS.admin.nik_usuario, TEST_USERS.admin.password);
  });

  test.afterEach(async () => {
    await api.logout();
  });

  test("Abrir → vender → cerrar → verificar reporte y stock", async () => {
    // 1. "Abrir" el periodo: ingreso de stock a lote (primer movimiento).
    const { productoId, stockInicial } = await setupTestData(api);

    // 2. Vender 10 unidades ($250 c/u desde catálogo).
    const saleResult = await api.request("POST", "/api/v1/ventas", {
      productos: [{ producto_id: productoId, cantidad: 10, precio_unitario: 250 }],
    });
    expect(saleResult.status).toBe(201);
    const saleId = (saleResult.body.data as Record<string, unknown>).id as string;

    // Stock reducido tras la venta (100 - 10 = 90).
    const afterSale = await api.request<ProductoResponse>("GET", `/api/v1/productos/${productoId}`);
    expect(afterSale.body.data!.stock_actual).toBe(stockInicial - 10);

    // 3. Cerrar la caja con el password del usuario logueado (admin).
    const closeResult = await api.request("POST", "/api/v1/ventas/cierre-caja", {
      password: TEST_USERS.admin.password,
    });
    expect(closeResult.status).toBe(200);
    expect(closeResult.body.success).toBe(true);
    const cierre = closeResult.body.data as Record<string, unknown>;
    expect(cierre.id).toBeDefined();
    expect(typeof cierre.monto_total).toBe("number");
    expect(typeof cierre.cantidad_ventas).toBe("number");

    // 4. Verificar el reporte del cierre: aparece en el listado.
    const listResult = await api.request("GET", "/api/v1/ventas/cierres");
    expect(listResult.status).toBe(200);
    expect(listResult.body.success).toBe(true);
    const cierres = listResult.body.data as Array<Record<string, unknown>>;
    const encontrado = cierres.find((c) => c.id === cierre.id);
    expect(encontrado).toBeDefined();

    // 5. Verificar el detalle del cierre.
    const detailResult = await api.request("GET", `/api/v1/ventas/cierres/${cierre.id}`);
    expect(detailResult.status).toBe(200);
    const detail = detailResult.body.data as Record<string, unknown>;
    expect(Number(detail.cantidad_ventas)).toBeGreaterThanOrEqual(1);
    const detalles = detail.detalles as Array<Record<string, unknown>>;
    expect(Array.isArray(detalles)).toBe(true);
    // El cierre archiva la venta: en el drill-down por venta aparece nuestra venta.
    const ventasResult = await api.request("GET", `/api/v1/ventas/cierres/${cierre.id}/ventas`);
    expect(ventasResult.status).toBe(200);
    const ventasData = ventasResult.body.data as Record<string, unknown>;
    const rows = ventasData.rows as Array<Record<string, unknown>>;
    expect(rows.some((r) => r.id_venta === saleId)).toBe(true);

    // 6. El cierre NO toca el stock: solo archiva las ventas del periodo.
    const afterClose = await api.request<ProductoResponse>("GET", `/api/v1/productos/${productoId}`);
    expect(afterClose.body.data!.stock_actual).toBe(stockInicial - 10);
  });

  test("Cerrar dos veces seguidas: la segunda retorna 409 CONFLICT (sin ventas abiertas)", async () => {
    const { productoId } = await setupTestData(api);
    await api.request("POST", "/api/v1/ventas", {
      productos: [{ producto_id: productoId, cantidad: 1, precio_unitario: 250 }],
    });

    const first = await api.request("POST", "/api/v1/ventas/cierre-caja", {
      password: TEST_USERS.admin.password,
    });
    expect(first.status).toBe(200);

    // Segundo cierre: ya no hay ventas completadas abiertas → CONFLICT.
    const second = await api.request("POST", "/api/v1/ventas/cierre-caja", {
      password: TEST_USERS.admin.password,
    });
    expect(second.status).toBe(409);
    expect(second.body.success).toBe(false);
    expect(second.body.error!.code).toBe("CONFLICT");
  });

  test("Password incorrecto al cerrar caja retorna 401", async () => {
    const { productoId } = await setupTestData(api);
    await api.request("POST", "/api/v1/ventas", {
      productos: [{ producto_id: productoId, cantidad: 1, precio_unitario: 250 }],
    });

    const result = await api.request("POST", "/api/v1/ventas/cierre-caja", {
      password: "password-incorrecta",
    });
    expect(result.status).toBe(401);
    expect(result.body.success).toBe(false);
    expect(result.body.error!.code).toBe("UNAUTHORIZED");

    // Limpieza: la venta quedó abierta (el cierre falló). Cerrar con el password
    // correcto deja la DB sin ventas abiertas (determinismo para re-runs).
    const cleanupClose = await api.request("POST", "/api/v1/ventas/cierre-caja", {
      password: TEST_USERS.admin.password,
    });
    expect(cleanupClose.status).toBe(200);
  });
});