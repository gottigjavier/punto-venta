// src/application/use-cases/venta-concurrency.test.ts
// Integración: protege a createVenta contra el race condition TOCTOU de doble
// descuento concurrente de stock.
//
// Escenario (del pedido): stock = 100 en un solo lote.
//   - Ventana A pide 60, Ventana B pide 50 al mismo tiempo.
//   - Sin blindaje, ambas leen stock=100, ambas pasan la validación y B descuenta
//     sobre stock ya consumido → stock final negativo (-10) y DOS ventas exitosas.
//   - Con `SELECT ... FOR UPDATE` (serializa el acceso al lote), exactamente una
//     venta triunfa y la otra falla con STOCK_INSUFFICIENT → stock final >= 0.
//
// Necesita una Postgres dev con el esquema migrado y DATABASE_URL apuntando a ella
// (cargada por test/setup.ts desde .env.development). Si la base no está disponible,
// estos tests se omiten (no rompen suites CI sin DB).
import { describe, it, afterAll, expect } from "vitest";
import { prisma } from "../../infrastructure/database/prisma/client.js";
import { createVenta } from "./venta.use-case.js";

// Convierte Decimal/DTOs de Prisma a number para las afirmaciones del test.
function toNumber(val: unknown): number {
  if (typeof val === "number") return val;
  if (typeof val === "string") return parseFloat(val);
  if (val && typeof val === "object" && "toNumber" in val) {
    return (val as { toNumber: () => number }).toNumber();
  }
  return 0;
}

// Detectar la disponibilidad de la DB a nivel de módulo (top-level await).
// Vitest evalúa it.skipIf(!dbUp) al registrar el test, ANTES de cualquier beforeAll,
// por lo que la sonda debe ejecutarse aquí y no dentro de beforeAll.
async function pingDb(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (e) {
    console.error(
      "[venta-concurrency] ping DB FAILED:",
      e instanceof Error ? e.message : String(e),
    );
    return false;
  }
}
const dbUp = await pingDb();
if (!dbUp) {
  console.warn(
    "[venta-concurrency] DB no disponible; tests omitidos. Arranca Postgres (podman compose up -d db) para ejecutarlos.",
  );
}

// CI (TS1): cuando REQUIRE_INTEGRATION_DB=1, la ausencia de Postgres NO debe
// dejar la suite verde en silencio. Un test de prerequisito explícito falla si
// la DB no está disponible, garantizando que el job de integración en CI corre
// los invariantes de concurrencia o revienta.
const requireIntegrationDb = process.env["REQUIRE_INTEGRATION_DB"] === "1";
const skipIntegration = !dbUp && !requireIntegrationDb;

// Roll de usuario requerido por la FK de Venta. Usuario de prueba.
interface Fixture {
  usuarioId: string;
  productoId: string;
  loteId: string;
}

async function createFixture(): Promise<Fixture> {
  const rubro = await prisma.rubro.create({
    data: {
      nombre: `RUBRO_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      activo: true,
    },
  });
  const proveedor = await prisma.proveedor.create({
    data: {
      razon_social: `PROV_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    },
  });
  const producto = await prisma.producto.create({
    data: {
      nombre: `PROD_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      codigo: `COD_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      precio_venta: 10,
      rubro_id: rubro.id,
      proveedor_id: proveedor.id,
      unidad_medida: "unidad",
      cantidad_aviso: 0,
      activo: true,
      vencimiento_preaviso_dias: 30,
    },
  });
  // Stock inicial = 100, sin vencimiento para no ser afectado por el lazy retire.
  const lote = await prisma.lote.create({
    data: {
      producto_id: producto.id,
      numero_lote: null,
      cantidad_disponible: 100,
      fecha_compra: new Date(),
      fecha_vencimiento: null,
      precio_compra: 5,
      estado: "activo",
    },
  });
  const username = `user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const usuario = await prisma.usuario.create({
    data: {
      nombre_usuario: username,
      nik_usuario: username,
      password_hash: "x",
      email: `${username}@test.local`,
      rol: "despachador",
      activo: true,
    },
  });
  return { usuarioId: usuario.id, productoId: producto.id, loteId: lote.id };
}

describe("createVenta — concurrencia de stock", () => {
  // Prerequisito: en CI (REQUIRE_INTEGRATION_DB=1) la DB debe estar disponible.
  if (requireIntegrationDb) {
    it("[prereq] Postgres disponible para integración", () => {
      expect(
        dbUp,
        "REQUIRE_INTEGRATION_DB=1 pero no hay Postgres. El job de CI debe levantar la DB o este test revienta.",
      ).toBe(true);
    });
  }

  afterAll(async () => {
    // Cleanup global (si algunos fixtures quedaron huérfanos en bars de tests con DB).
    await prisma.$disconnect();
  });

  it.skipIf(skipIntegration)(
    "rechaza la segunda venta concurrente y nunca deja stock negativo",
    async () => {
      const f = await createFixture();
      try {
        const casoA: CreateVentaLike = {
          productos: [{ producto_id: f.productoId, cantidad: 60 }],
        };
        const casoB: CreateVentaLike = {
          productos: [{ producto_id: f.productoId, cantidad: 50 }],
        };

        // Lanzar ambas ventas concurrentemente. Una debe serializarse por FOR UPDATE.
        const [resA, resB] = await Promise.all([
          createVenta(casoA as never, f.usuarioId),
          createVenta(casoB as never, f.usuarioId),
        ]);

        const okCount = [resA, resB].filter((r) => r.isOk()).length;
        const insuficientCount = [resA, resB].filter(
          (r) =>
            r.isErr() &&
            (r.error as { code?: string }).code === "STOCK_INSUFFICIENT",
        ).length;

        // Invariante central: NUNCA pueden triunfar dos ventas sobre el mismo stock.
        expect(okCount).toBe(1);
        expect(insuficientCount).toBe(1);

        // Releer el lote: el stock final debe ser >= 0 y consistente con la venta ganadora.
        const lote = await prisma.lote.findUnique({ where: { id: f.loteId } });
        expect(lote).not.toBeNull();
        const stockFinal = lote ? toNumber(lote.cantidad_disponible) : -1;
        expect(stockFinal).toBeGreaterThanOrEqual(0);

        // El stock consumido = 100 - final debe ser exactamente 60 o 50 (la ganadora),
        // no una suma incoherente. Verifica que no hubo sobreventa.
        expect([40, 50]).toContain(stockFinal);
      } finally {
        // Cleanup del fixture respetando FKs: DetalleVenta → Venta → Lote → Producto.
        await prisma.detalleVenta
          .deleteMany({ where: { lote_id: f.loteId } })
          .catch(() => {});
        const ventas = await prisma.venta
          .findMany({
            where: { usuario_id: f.usuarioId },
            select: { id: true },
          })
          .catch(() => [] as Array<{ id: string }>);
        if (ventas.length) {
          await prisma.detalleVenta
            .deleteMany({
              where: { venta_id: { in: ventas.map((v) => v.id) } },
            })
            .catch(() => {});
          await prisma.venta
            .deleteMany({ where: { id: { in: ventas.map((v) => v.id) } } })
            .catch(() => {});
        }
        await prisma.lote.delete({ where: { id: f.loteId } }).catch(() => {});
        await prisma.producto
          .delete({ where: { id: f.productoId } })
          .catch(() => {});
      }
    },
  );
});

// Tipo mínimo del input para no depender del schema zod en el test de concurrencia.
// SE2: el precio NO viaja en el input (el server lo toma del catálogo).
interface CreateVentaLike {
  productos: Array<{
    producto_id: string;
    cantidad: number;
  }>;
}
