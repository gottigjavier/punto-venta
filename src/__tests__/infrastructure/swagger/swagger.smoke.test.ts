// Smoke test del documento Swagger/OpenAPI generado desde los DTOs Zod.
//
// Cobertura (logra el finding R3-NoSwaggerTests y detecta la clase de bug
// R3-UndefRefs / R3-MissingStockRefs):
//   - `registerSwagger` registra los 30 componentes sin lanzar (arranque).
//   - El documento final (paths + components) NO contiene ningún `$ref` que
//     no resuelva a un componente registrado en `components.schemas`.
//   - Los nombres de componente históricos esperados están presentes -> el
//     contrato Swagger que consumen los clientes no se rompe silenciosamente.
import Fastify, { type FastifyInstance } from "fastify";
import { describe, it, expect, afterEach } from "vitest";

import { registerSwagger } from "../../../infrastructure/swagger/swagger.js";
import { authRoutes } from "../../../adapters/http/routes/auth.routes.js";
import { healthRoutes } from "../../../adapters/http/routes/health.routes.js";
import { productoRoutes } from "../../../adapters/http/routes/producto.routes.js";
import { proveedorRoutes } from "../../../adapters/http/routes/proveedor.routes.js";
import { rubroRoutes } from "../../../adapters/http/routes/rubro.routes.js";
import { usuarioRoutes } from "../../../adapters/http/routes/usuario.routes.js";
import { stockRoutes } from "../../../adapters/http/routes/stock.routes.js";
import { loteRoutes } from "../../../adapters/http/routes/lotes.routes.js";
import { ventaRoutes } from "../../../adapters/http/routes/venta.routes.js";

// Componentes esperados (nombres registrados en COMPONENT_SCHEMAS de swagger.ts).
const EXPECTED_COMPONENTS = [
  "Pagination",
  "Lote",
  "Producto",
  "Proveedor",
  "Rubro",
  "Usuario",
  "Venta",
  "VentaListItem",
  "MovimientoCaja",
  "ResumenDia",
  "ResumenMovimientos",
  "ProductoMasVendido",
  "StockItem",
  "CierreCaja",
  "CierreDetail",
  "VentaCierreRespuesta",
  "LoginResponse",
  "RefreshResponse",
  "FilaHistorial",
  "UltimaVenta",
  "LoginRequest",
  "CreateUsuarioRequest",
  "CreateProductoRequest",
  "CreateProveedorRequest",
  "CreateRubroRequest",
  "CreateVentaRequest",
  "DetalleVentaInput",
  "CrearMovimientoRequest",
  "StockIngresoRequest",
  "StockEditRequest",
];

/** Recorre recursivamente el doc y devuelve todos los valores `$ref`. */
function collectRefs(node: unknown, refs: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const item of node) collectRefs(item, refs);
    return refs;
  }
  if (node !== null && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (typeof obj.$ref === "string") refs.push(obj.$ref as string);
    for (const value of Object.values(obj)) collectRefs(value, refs);
  }
  return refs;
}

const instances: FastifyInstance[] = [];

afterEach(async () => {
  for (const instance of instances.splice(0)) {
    try {
      await instance.close();
    } catch {
      // teardown best-effort: no debería impedir el juicio del resto del test
    }
  }
});

describe("Smoke test: Swagger/OpenAPI generado desde los DTOs Zod", () => {
  it("registra todos los componentes y rutas sin lanzar, y el doc no tiene $ref rotos", async () => {
    const fastify = Fastify({ logger: false });
    instances.push(fastify);

    // Mismo orden de arranque que main.ts: swagger ANTES de las rutas.
    await registerSwagger(fastify);

    await fastify.register(healthRoutes);
    await fastify.register(authRoutes, { prefix: "/api/v1/auth" });
    await fastify.register(productoRoutes, { prefix: "/api/v1/productos" });
    await fastify.register(proveedorRoutes, { prefix: "/api/v1/proveedores" });
    await fastify.register(rubroRoutes, { prefix: "/api/v1/rubros" });
    await fastify.register(usuarioRoutes, { prefix: "/api/v1/usuarios" });
    await fastify.register(stockRoutes, { prefix: "/api/v1/stock" });
    await fastify.register(loteRoutes, { prefix: "/api/v1/lotes" });
    await fastify.register(ventaRoutes, { prefix: "/api/v1/ventas" });

    await fastify.ready();

    const doc = (
      fastify as unknown as { swagger: () => Record<string, unknown> }
    ).swagger();

    // 1) Estructura mínima de la doc.
    expect(doc.openapi).toBe("3.0.0");
    expect(typeof doc.paths).toBe("object");
    const pathCount = Object.keys(doc.paths as Record<string, unknown>).length;
    expect(pathCount).toBeGreaterThan(0);

    // 2) Los componentes históricos están todos registrados.
    const schemas =
      (doc.components as { schemas?: Record<string, unknown> })?.schemas ?? {};
    const registeredNames = Object.keys(schemas);
    for (const expected of EXPECTED_COMPONENTS) {
      expect(registeredNames).toContain(expected);
    }

    // 3) Ningún $ref del documento apunta a un componente inexistente.
    const allRefs = collectRefs(doc);
    expect(allRefs.length).toBeGreaterThan(0);
    for (const ref of allRefs) {
      const match = /^#\/components\/schemas\/(.+)$/.exec(ref);
      if (!match) continue; // refs externos (o a otros nodos) no aplican acá
      expect(registeredNames).toContain(match[1]);
    }
  });
});
