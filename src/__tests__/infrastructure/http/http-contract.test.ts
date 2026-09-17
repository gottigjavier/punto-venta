// src/__tests__/infrastructure/http/http-contract.test.ts
// TS2 (reporte 26/09): tests de capa HTTP/controller vía fastify.inject.
//
// Cobertura del finding:
//   "no existe ningún fastify.inject; el mapeo errors→HTTP (STOCK_INSUFFICIENT→409,
//    VALIDATION→400, DB→500) no está verificado en la frontera. Regresiones de
//    contrato entre capas pasan la suite."
//
// Estrategia: se registran las rutas REALES (ventaRoutes + stockRoutes, que
// incluyen cierres) sobre un Fastify real con registerSchemas (mismo orden de
// arranque que main.ts), se mockean SOLO los use-cases en la frontera y el JWT
// (para pasar authorize), y se verifica el contrato HTTP: status code, envelope
// {success:false,error:{code,message}} y campos extra (disponible/solicitado en
// STOCK_INSUFFICIENT). Los errores de dominio (sendDomainError) se traducen en
// la frontera; una regresión de ese mapa rompe estos tests.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { ok, err } from "neverthrow";

import { registerSchemas } from "../../../infrastructure/swagger/swagger.js";
import { stockRoutes } from "../../../adapters/http/routes/stock.routes.js";
import { ventaRoutes } from "../../../adapters/http/routes/venta.routes.js";

// ---- Mocks de frontera (vi.hoisted para poder usarlos en las factories) ----
const {
  mockVentaUC,
  mockStockUC,
  mockCierreUC,
  mockMovimientoUC,
  mockHistorialUC,
  mockJwt,
} = vi.hoisted(() => ({
  mockVentaUC: {
    createVenta: vi.fn(),
    getVentaById: vi.fn(),
    listVentas: vi.fn(),
    getResumenDia: vi.fn(),
    getUltimasVentasPorProducto: vi.fn(),
    getMasVendidosPorProducto: vi.fn(),
    deleteVenta: vi.fn(),
    cerrarCaja: vi.fn(),
  },
  mockStockUC: {
    loteList: vi.fn(),
    loteIngreso: vi.fn(),
    searchProductos: vi.fn(),
  },
  mockCierreUC: {
    listCierres: vi.fn(),
    getCierreById: vi.fn(),
    exportCierreCsv: vi.fn(),
    listVentasByCierreConDetalles: vi.fn(),
  },
  mockMovimientoUC: {
    crearMovimiento: vi.fn(),
    listarMovimientos: vi.fn(),
  },
  mockHistorialUC: {
    historialUnificado: vi.fn(),
  },
  mockJwt: {
    verifyAccessToken: vi.fn(),
    generateAccessToken: vi.fn(),
    generateRefreshToken: vi.fn(),
    generateTokenPair: vi.fn(),
    verifyRefreshToken: vi.fn(),
  },
}));

// Los controllers importan estáticamente a los use-cases; el test los reemplaza
// para controlar el Result que llega a la frontera HTTP (contrato use-case → HTTP).
vi.mock("../../../application/use-cases/venta.use-case.js", () => mockVentaUC);
vi.mock("../../../application/use-cases/stock.use-case.js", () => mockStockUC);
vi.mock("../../../application/use-cases/cierre.use-case.js", () => mockCierreUC);
vi.mock(
  "../../../application/use-cases/movimiento-caja.use-case.js",
  () => mockMovimientoUC,
);
vi.mock("../../../application/use-cases/historial.use-case.js", () =>
  mockHistorialUC,
);
// authorize() verifica el Bearer token; con verifyAccessToken mockeado a ok()
// cualquier token pasa y el test ejercita el mapeo del controller.
vi.mock("../../../infrastructure/auth/jwt.js", () => mockJwt);

// ---- Fixtures wire-shape (espejo de los schemas de response.dto.ts) ----
const PRODUCTO_ID = "123e4567-e89b-12d3-a456-426614174000";
const USER_ID = "123e4567-e89b-12d3-a456-426614174002";
const LOTE_ID = "123e4567-e89b-12d3-a456-426614174020";
const VENTA_ID = "223e4567-e89b-12d3-a456-426614174001";
const TOKEN_ADMIN = "token-admin";

const BODY_VENTA_VALIDA = {
  productos: [{ producto_id: PRODUCTO_ID, cantidad: 2 }],
};

// Venta completa según VentaDetailSchema (POST /ventas 201).
const VENTA_MOCK = {
  id: VENTA_ID,
  usuario_id: USER_ID,
  total: 500,
  estado: "completada",
  cierre_caja_id: null,
  created_at: "2026-09-15T14:00:00.000Z",
  usuario: { id: USER_ID, nombre_usuario: "Admin Test", nik_usuario: "admin" },
  detalles_venta: [
    {
      id: "323e4567-e89b-12d3-a456-426614174001",
      venta_id: VENTA_ID,
      producto_id: PRODUCTO_ID,
      lote_id: LOTE_ID,
      cantidad: 2,
      precio_unitario: 250,
      subtotal: 500,
      producto: { id: PRODUCTO_ID, nombre: "Pan integral", codigo: "PAN-001" },
    },
  ],
};

// Resumen diario según ResumenDiaSchema (GET /ventas/resumen/dia 200).
const RESUMEN_MOCK = {
  fecha: "2026-09-15",
  total_ventas: 1,
  monto_total: 500,
  ingresos_total: 0,
  egresos_total: 0,
  productos_vendidos: [
    {
      producto_id: PRODUCTO_ID,
      nombre: "Pan integral",
      cantidad_total: 2,
      monto_total: 500,
    },
  ],
  ventas_por_usuario: [
    {
      usuario_id: USER_ID,
      nombre: "Admin Test",
      cantidad_ventas: 1,
      monto_total: 500,
    },
  ],
};

// Fila de stock según StockItemSchema (GET /stock 200).
const STOCK_ITEM_MOCK = {
  id: LOTE_ID,
  producto_id: PRODUCTO_ID,
  numero_lote: "L-001",
  cantidad_disponible: 45,
  fecha_compra: "2024-01-15T00:00:00.000Z",
  fecha_vencimiento: "2024-12-31T00:00:00.000Z",
  precio_compra: 150,
  estado: "activo",
  created_at: "2024-01-15T00:00:00.000Z",
  producto: {
    id: PRODUCTO_ID,
    nombre: "Pan integral",
    codigo: "PAN-001",
    unidad_medida: "unidad",
    precio_venta: 250,
    cantidad_aviso: 0,
  },
  rubro: { id: "123e4567-e89b-12d3-a456-426614174010", nombre: "Panadería" },
  proveedor: {
    id: "123e4567-e89b-12d3-a456-426614174011",
    razon_social: "Distribuidora Ejemplo S.A.",
  },
  estado_vencimiento: "ok",
  stock_bajo: false,
};

// Lote según LoteSchema (POST /stock/ingreso 201).
const LOTE_MOCK = {
  id: LOTE_ID,
  producto_id: PRODUCTO_ID,
  numero_lote: "L-001",
  cantidad_disponible: 45,
  fecha_compra: "2024-01-15T00:00:00.000Z",
  fecha_vencimiento: null,
  precio_compra: 150,
  estado: "activo",
  created_at: "2024-01-15T00:00:00.000Z",
};

// Resultado de cerrarCaja (inline schema 200 de cierre-caja).
const CIERRE_OK = {
  id: "423e4567-e89b-12d3-a456-426614174001",
  monto_total: 500,
  cantidad_ventas: 1,
  fecha_cierre: "2026-09-15T18:00:00.000Z",
};

// ---- Harness: Fastify con registerSchemas + rutas (mismo orden que main.ts) ----
let app: FastifyInstance;

async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: false });
  registerSchemas(fastify);
  await fastify.register(stockRoutes, { prefix: "/api/v1/stock" });
  await fastify.register(ventaRoutes, { prefix: "/api/v1/ventas" });
  await fastify.ready();
  return fastify;
}

beforeEach(async () => {
  vi.clearAllMocks();
  // Default: usuario admin autenticado (authorize pasa en rutas admin/gerente).
  mockJwt.verifyAccessToken.mockReturnValue(
    ok({ userId: USER_ID, nik_usuario: "admin", rol: "admin" }),
  );
  app = await buildApp();
});

afterEach(async () => {
  await app.close();
});

// Helper de request: status + body parseado.
async function inject(
  method: string,
  url: string,
  opts: { auth?: string | null; payload?: unknown } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = {};
  if (opts.auth !== null) {
    headers["authorization"] = `Bearer ${opts.auth ?? TOKEN_ADMIN}`;
  }
  let payload: string | undefined;
  if (opts.payload !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(opts.payload);
  }
  const res = await app.inject({ method, url, headers, payload });
  return { status: res.statusCode, body: res.json() };
}

describe("TS2 — Contrato HTTP: mapeo errors→status en la frontera (ventas/stock/cierres)", () => {
  describe("POST /api/v1/ventas (createVenta)", () => {
    it("STOCK_INSUFFICIENT → 409 con disponible/solicitado en el body", async () => {
      mockVentaUC.createVenta.mockResolvedValue(
        err({
          code: "STOCK_INSUFFICIENT",
          message: `Stock insuficiente para producto ${PRODUCTO_ID}: disponible 5, solicitado 10`,
          disponible: 5,
          solicitado: 10,
        }),
      );

      const { status, body } = await inject("POST", "/api/v1/ventas", {
        payload: { productos: [{ producto_id: PRODUCTO_ID, cantidad: 10 }] },
      });

      expect(status).toBe(409);
      expect(body.success).toBe(false);
      expect(body.error).toMatchObject({
        code: "STOCK_INSUFFICIENT",
        disponible: 5,
        solicitado: 10,
      });
    });

    it("DATABASE_ERROR → 500", async () => {
      mockVentaUC.createVenta.mockResolvedValue(
        err({ code: "DATABASE_ERROR", message: "Error al crear venta" }),
      );

      const { status, body } = await inject("POST", "/api/v1/ventas", {
        payload: BODY_VENTA_VALIDA,
      });

      expect(status).toBe(500);
      expect(body.success).toBe(false);
      expect(body.error).toMatchObject({ code: "DATABASE_ERROR" });
    });

    it("NOT_FOUND (producto inexistente) → 404", async () => {
      mockVentaUC.createVenta.mockResolvedValue(
        err({ code: "NOT_FOUND", message: "Producto no encontrado" }),
      );

      const { status, body } = await inject("POST", "/api/v1/ventas", {
        payload: BODY_VENTA_VALIDA,
      });

      expect(status).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error).toMatchObject({ code: "NOT_FOUND" });
    });

    it("body inválido (productos vacío) → 400 VALIDATION_ERROR sin llamar al use-case", async () => {
      const { status, body } = await inject("POST", "/api/v1/ventas", {
        payload: { productos: [] },
      });

      expect(status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toMatchObject({
        code: "VALIDATION_ERROR",
        message: "Datos de entrada inválidos",
      });
      expect(mockVentaUC.createVenta).not.toHaveBeenCalled();
    });

    it("sin token → 401 UNAUTHORIZED (autorización en la frontera)", async () => {
      const { status, body } = await inject("POST", "/api/v1/ventas", {
        payload: BODY_VENTA_VALIDA,
        auth: null,
      });

      expect(status).toBe(401);
      expect(body.success).toBe(false);
      expect(body.error).toMatchObject({ code: "UNAUTHORIZED" });
      expect(mockJwt.verifyAccessToken).not.toHaveBeenCalled();
    });

    it("éxito → 201 con el envelope y datos de venta", async () => {
      mockVentaUC.createVenta.mockResolvedValue(ok(VENTA_MOCK));

      const { status, body } = await inject("POST", "/api/v1/ventas", {
        payload: BODY_VENTA_VALIDA,
      });

      expect(status).toBe(201);
      expect(body.success).toBe(true);
      expect((body.data as Record<string, unknown>).id).toBe(VENTA_ID);
      // El use-case recibe el input parseado + el userId del token.
      expect(mockVentaUC.createVenta).toHaveBeenCalledWith(
        { productos: [{ producto_id: PRODUCTO_ID, cantidad: 2 }] },
        USER_ID,
      );
    });
  });

  describe("GET /api/v1/ventas/resumen/dia (getResumenDia)", () => {
    it("éxito → 200 con el resumen", async () => {
      mockVentaUC.getResumenDia.mockResolvedValue(ok(RESUMEN_MOCK));

      const { status, body } = await inject(
        "GET",
        "/api/v1/ventas/resumen/dia",
      );

      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toMatchObject({ total_ventas: 1, monto_total: 500 });
    });

    it("DATABASE_ERROR → 500", async () => {
      mockVentaUC.getResumenDia.mockResolvedValue(
        err({ code: "DATABASE_ERROR", message: "Error al obtener resumen" }),
      );

      const { status, body } = await inject(
        "GET",
        "/api/v1/ventas/resumen/dia",
      );

      expect(status).toBe(500);
      expect(body.success).toBe(false);
      expect(body.error).toMatchObject({ code: "DATABASE_ERROR" });
    });

    it("rol sin permiso (despachador) → 403 FORBIDDEN y el use-case NO se llama", async () => {
      mockJwt.verifyAccessToken.mockReturnValue(
        ok({ userId: USER_ID, nik_usuario: "despachador", rol: "despachador" }),
      );

      const { status, body } = await inject(
        "GET",
        "/api/v1/ventas/resumen/dia",
      );

      expect(status).toBe(403);
      expect(body.success).toBe(false);
      expect(body.error).toMatchObject({ code: "FORBIDDEN" });
      expect(mockVentaUC.getResumenDia).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/v1/ventas/cierre-caja (cerrarCaja)", () => {
    it("CONFLICT (no hay ventas para cerrar) → 409", async () => {
      mockVentaUC.cerrarCaja.mockResolvedValue(
        err({
          code: "CONFLICT",
          message: "No hay ventas completadas para cerrar",
        }),
      );

      const { status, body } = await inject("POST", "/api/v1/ventas/cierre-caja", {
        payload: { password: "P@ss123" },
      });

      expect(status).toBe(409);
      expect(body.success).toBe(false);
      expect(body.error).toMatchObject({ code: "CONFLICT" });
    });

    it("UNAUTHORIZED (password incorrecta) → 401", async () => {
      mockVentaUC.cerrarCaja.mockResolvedValue(
        err({ code: "UNAUTHORIZED", message: "Contraseña incorrecta" }),
      );

      const { status, body } = await inject("POST", "/api/v1/ventas/cierre-caja", {
        payload: { password: "wrong" },
      });

      expect(status).toBe(401);
      expect(body.success).toBe(false);
      expect(body.error).toMatchObject({ code: "UNAUTHORIZED" });
    });

    it("password vacío → 400 VALIDATION_ERROR sin llamar al use-case", async () => {
      const { status, body } = await inject("POST", "/api/v1/ventas/cierre-caja", {
        payload: { password: "" },
      });

      expect(status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toMatchObject({ code: "VALIDATION_ERROR" });
      expect(mockVentaUC.cerrarCaja).not.toHaveBeenCalled();
    });

    it("éxito → 200 con datos del cierre", async () => {
      mockVentaUC.cerrarCaja.mockResolvedValue(ok(CIERRE_OK));

      const { status, body } = await inject("POST", "/api/v1/ventas/cierre-caja", {
        payload: { password: "P@ss123" },
      });

      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toMatchObject({
        id: CIERRE_OK.id,
        monto_total: 500,
        cantidad_ventas: 1,
      });
    });
  });

  describe("GET /api/v1/stock (loteList)", () => {
    it("éxito → 200 con data (fila por lote) + pagination", async () => {
      mockStockUC.loteList.mockResolvedValue(
        ok({
          data: [STOCK_ITEM_MOCK],
          pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        }),
      );

      const { status, body } = await inject("GET", "/api/v1/stock");

      expect(status).toBe(200);
      expect(body.success).toBe(true);
      const data = body.data as Array<Record<string, unknown>>;
      expect(data).toHaveLength(1);
      expect(data[0]).toMatchObject({ id: LOTE_ID, cantidad_disponible: 45 });
      expect(body.pagination).toMatchObject({ page: 1, total: 1 });
    });

    it("DATABASE_ERROR → 500", async () => {
      mockStockUC.loteList.mockResolvedValue(
        err({ code: "DATABASE_ERROR", message: "Error al listar stock" }),
      );

      const { status, body } = await inject("GET", "/api/v1/stock");

      expect(status).toBe(500);
      expect(body.success).toBe(false);
      expect(body.error).toMatchObject({ code: "DATABASE_ERROR" });
    });

    it("query inválida (archivados=xyz) → 400 VALIDATION_ERROR", async () => {
      const { status, body } = await inject(
        "GET",
        "/api/v1/stock?archivados=xyz",
      );

      expect(status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toMatchObject({
        code: "VALIDATION_ERROR",
        message: "Parámetros de consulta inválidos",
      });
      expect(mockStockUC.loteList).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/v1/stock/ingreso (loteIngreso)", () => {
    it("producto inexistente (NOT_FOUND) → 404", async () => {
      mockStockUC.loteIngreso.mockResolvedValue(
        err({ code: "NOT_FOUND", message: "Producto no encontrado" }),
      );

      const { status, body } = await inject("POST", "/api/v1/stock/ingreso", {
        payload: {
          producto_id: PRODUCTO_ID,
          numero_lote: "L-001",
          cantidad: 10,
          precio_compra: 100,
        },
      });

      expect(status).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error).toMatchObject({ code: "NOT_FOUND" });
    });

    it("lote nuevo (esNuevo) → 201", async () => {
      mockStockUC.loteIngreso.mockResolvedValue(
        ok({ lote: LOTE_MOCK, esNuevo: true }),
      );

      const { status, body } = await inject("POST", "/api/v1/stock/ingreso", {
        payload: {
          producto_id: PRODUCTO_ID,
          numero_lote: "L-001",
          cantidad: 10,
          precio_compra: 100,
        },
      });

      expect(status).toBe(201);
      expect(body.success).toBe(true);
      expect((body.data as Record<string, unknown>).id).toBe(LOTE_ID);
    });

    it("merge a lote existente (esNuevo=false) → 200", async () => {
      mockStockUC.loteIngreso.mockResolvedValue(
        ok({
          lote: { ...LOTE_MOCK, cantidad_disponible: 55 },
          esNuevo: false,
        }),
      );

      const { status, body } = await inject("POST", "/api/v1/stock/ingreso", {
        payload: {
          producto_id: PRODUCTO_ID,
          numero_lote: "L-001",
          cantidad: 10,
          precio_compra: 100,
        },
      });

      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect((body.data as Record<string, unknown>).cantidad_disponible).toBe(
        55,
      );
    });
  });
});