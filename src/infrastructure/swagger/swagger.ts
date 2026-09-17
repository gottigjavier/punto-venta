// src/infrastructure/swagger/swagger.ts
// Swagger/OpenAPI documentation configuration
//
// Los componentes de schema ya NO se escriben a mano: se generan desde los DTOs
// Zod (src/application/dto/*.ts) via `fastify.addSchema` con `z.toJSONSchema`.
// Cada route referencie los componentes por `$ref` (envelope inline + data $ref).
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { env } from "../config/env.js";
// Response/entity shapes (single source of truth del wire)
import {
  PaginationSchema,
  LoteSchema,
  ProductoSchema,
  ProveedorSchema,
  RubroSchema,
  UsuarioSchema,
  VentaDetailSchema,
  VentaListItemSchema,
  MovimientoCajaSchema,
  ResumenDiaSchema,
  ResumenMovimientosSchema,
  ProductoMasVendidoSchema,
  StockItemSchema,
  CierreListItemSchema,
  CierreDetailSchema,
  VentaCierreRespuestaSchema,
  LoginResponseSchema,
  RefreshResponseSchema,
  FilaHistorialSchema,
  UltimaVentaSchema,
} from "../../application/dto/response.dto.js";
// Request DTOs (cuerpo/query — validados por Zod en el handler)
import { LoginRequestSchema } from "../../application/dto/auth.dto.js";
import { CreateUsuarioSchema } from "../../application/dto/usuario.dto.js";
import { CreateProductoSchema } from "../../application/dto/producto.dto.js";
import { CreateProveedorSchema } from "../../application/dto/proveedor.dto.js";
import { CreateRubroSchema } from "../../application/dto/rubro.dto.js";
import {
  CreateVentaSchema,
  DetalleVentaInputSchema,
} from "../../application/dto/venta.dto.js";
import { CrearMovimientoSchema } from "../../application/dto/movimiento.dto.js";
import {
  StockIngresoRequestSchema,
  StockEditRequestSchema,
} from "../../application/dto/stock.dto.js";

// Registra cada schema Zod como componente con `$id` <ComponentName>. El nombre
// del componente coincide con el histórico de swagger (backward compatibility).
const COMPONENT_SCHEMAS: ReadonlyArray<readonly [string, z.ZodType]> = [
  // Entities / responses
  ["Pagination", PaginationSchema],
  ["Lote", LoteSchema],
  ["Producto", ProductoSchema],
  ["Proveedor", ProveedorSchema],
  ["Rubro", RubroSchema],
  ["Usuario", UsuarioSchema],
  ["Venta", VentaDetailSchema],
  ["VentaListItem", VentaListItemSchema],
  ["MovimientoCaja", MovimientoCajaSchema],
  ["ResumenDia", ResumenDiaSchema],
  ["ResumenMovimientos", ResumenMovimientosSchema],
  ["ProductoMasVendido", ProductoMasVendidoSchema],
  ["StockItem", StockItemSchema],
  ["CierreCaja", CierreListItemSchema],
  ["CierreDetail", CierreDetailSchema],
  ["VentaCierreRespuesta", VentaCierreRespuestaSchema],
  ["LoginResponse", LoginResponseSchema],
  ["RefreshResponse", RefreshResponseSchema],
  ["FilaHistorial", FilaHistorialSchema],
  ["UltimaVenta", UltimaVentaSchema],
  // Requests
  ["LoginRequest", LoginRequestSchema],
  ["CreateUsuarioRequest", CreateUsuarioSchema],
  ["CreateProductoRequest", CreateProductoSchema],
  ["CreateProveedorRequest", CreateProveedorSchema],
  ["CreateRubroRequest", CreateRubroSchema],
  ["CreateVentaRequest", CreateVentaSchema],
  ["DetalleVentaInput", DetalleVentaInputSchema],
  ["CrearMovimientoRequest", CrearMovimientoSchema],
  ["StockIngresoRequest", StockIngresoRequestSchema],
  ["StockEditRequest", StockEditRequestSchema],
];

// Repara los matices que diferencian JSON Schema (salida de Zod) de lo que el
// serializador/validador de Fastify acepta en modo OpenAPI 3.0:
// - `exclusiveMinimum: true` + `minimum: n` (estilo draft-04, emitido por
//   `z.number().positive()` / `.min()`) -> `exclusiveMinimum: n` (draft-06).
// Mutación in-place, recursiva, de nodos JSON Schema.
function normalizeOpenApi(node: unknown): void {
  if (node === null || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  for (const [minKey, exclKey] of [
    ["minimum", "exclusiveMinimum"],
    ["maximum", "exclusiveMaximum"],
  ] as const) {
    if (obj[exclKey] === true && typeof obj[minKey] === "number") {
      obj[exclKey] = obj[minKey];
      delete obj[minKey];
    }
  }
  for (const value of Object.values(obj)) {
    if (Array.isArray(value)) value.forEach(normalizeOpenApi);
    else if (value && typeof value === "object") normalizeOpenApi(value);
  }
}

// Registra los componentes Zod como shared schemas de Fastify (`$id` = nombre de
// cada componente). Los routes referencian esos `$id` por `$ref` (ej. `$ref:
// "LoginResponse"`), de modo que DEBE ejecutarse en TODOS los entornos (incluido
// producción), independientemente de que la documentación Swagger se exponga o no.
export function registerSchemas(fastify: FastifyInstance): void {
  for (const [$id, schema] of COMPONENT_SCHEMAS) {
    // Idempotente: si el `$id` ya está registrado (porque main llamó a
    // registerSchemas y luego registerSwagger vuelve a llamarlo), no lo
    // re-agrega, evitando FST_ERR_SCH_ALREADY_PRESENT en dev (donde ambos
    // corren). Fastify 5 no expone hasSchema(); getSchema() devuelve undefined
    // si el `$id` aún no está registrado.
    if (fastify.getSchema($id)) continue;
    const converted = z.toJSONSchema(schema, {
      target: "openapi-3.0",
    });
    normalizeOpenApi(converted);
    fastify.addSchema({
      $id,
      ...converted,
    });
  }
}

export async function registerSwagger(fastify: FastifyInstance): Promise<void> {
  // Registrar los componentes como shared schemas de Fastify (`$id` = nombre).
  // Deben registrarse ANTES de que el plugin swagger serialice la doc. La
  // función es idempotente: si registerSchemas() ya se ejecutó (prod), aquí solo
  // re-registra los mismos $id (Fastify los reemplaza por el mismo contenido).
  registerSchemas(fastify);

  // Register Swagger generator
  await fastify.register(swagger, {
    // Nombra los `$ref` por el `$id` del componente (no `def-N`), para que las
    // rutas emitan `#/components/schemas/<ComponentName>`.
    refResolver: {
      buildLocalReference: (json: { $id?: string }) => json.$id || "def",
    },
    openapi: {
      openapi: "3.0.0",
      info: {
        title: "Punto de Venta API",
        description:
          "API REST para sistema de punto de venta.\n\n" +
          "## Autenticación\n" +
          "Todos los endpoints protegidos requieren un Bearer Token en el header `Authorization`.\n\n" +
          "### Obtener token\n" +
          '```POST /api/v1/auth/login``` con `{ "nik_usuario": "...", "password": "..." }`\n\n' +
          "### Usar token\n" +
          "```Authorization: Bearer <token>```\n\n" +
          "## Roles\n" +
          "| Rol | Permisos |\n" +
          "|-----|----------|\n" +
          "| admin | CRUD completo en todos los módulos |\n" +
          "| gerente | CRUD en productos, proveedores, rubros, stock, ventas |\n" +
          "| despachador | Lectura de productos, creación de ventas, lectura de stock |",
        version: "2.0.0",
        contact: {
          name: "Equipo de Desarrollo",
        },
        license: {
          name: "ISC",
        },
      },
      servers: [
        {
          url: `http://localhost:${env.API_PORT}`,
          description: "Servidor de desarrollo",
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
            description:
              "Token JWT de acceso. Obtenerlo con POST /api/v1/auth/login",
          },
        },
        // schemas: se generan desde los DTOs Zod (ver COMPONENT_SCHEMAS arriba).
      },
      tags: [
        { name: "Health", description: "Health checks del servidor" },
        { name: "Auth", description: "Autenticación y autorización" },
        { name: "Usuarios", description: "Gestión de usuarios (solo admin)" },
        { name: "Productos", description: "CRUD de productos" },
        { name: "Proveedores", description: "Gestión de proveedores" },
        { name: "Rubros", description: "Gestión de rubros/categorías" },
        { name: "Ventas", description: "Módulo de ventas y despacho" },
        { name: "Stock", description: "Gestión de inventario y stock" },
      ],
    },
  });

  // Register Swagger UI
  await fastify.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true,
      filter: true,
      showExtensions: true,
      showCommonExtensions: true,
      tryItOutEnabled: true,
    },
    uiHooks: {
      onRequest: (_request, _reply, next) => {
        next();
      },
    },
    staticCSP: true,
  });
}
