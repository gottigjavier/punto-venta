// src/application/use-cases/stock-concurrency.test.ts
// Integración: protege el merge/retry de `loteIngreso` (P2002) contra la carrera
// de dos ingresos que crean el MISMO lote (producto_id, numero_lote,
// fecha_vencimiento) de forma concurrente.
//
// Escenario (TS4, reporte 26/09): dos ingresos concurrentes con la misma
// merge-key. Sin blindaje, ambos leen "no existe" (mergeLoteForUpdate vacío) y
// ambos insertan → dos lotes duplicados (viola el unique index parcial) o un
// P2002 no manejado → pérdida de stock. Con `SELECT ... FOR UPDATE` + retry
// post-P2002 (absorbé al lote consagrado vía merge), exactamente un ingreso
// crea el lote y el otro SUMA cantidad → 1 lote final con la cantidad total, sin
// pérdida.
//
// Necesita una Postgres dev con el esquema migrado y DATABASE_URL apuntando a
// ella (cargada por test/setup.ts desde .env.development). Si la base no está
// disponible, estos tests se omiten (mismo contrato que venta/cierre-concurrency).
import { describe, it, afterAll, expect } from "vitest";
import { prisma } from "../../infrastructure/database/prisma/client.js";
import { loteIngreso } from "./stock.use-case.js";
import { toNumber } from "../../shared/utils/number.js";

// Detectar la disponibilidad de la DB a nivel de módulo (top-level await).
// Vitest evalúa it.skipIf(!dbUp) al registrar el test, ANTES de cualquier beforeAll,
// por lo que la sonda debe ejecutarse aquí y no dentro de beforeAll.
async function pingDb(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (e) {
    console.error(
      "[stock-concurrency] ping DB FAILED:",
      e instanceof Error ? e.message : String(e),
    );
    return false;
  }
}
const dbUp = await pingDb();
if (!dbUp) {
  console.warn(
    "[stock-concurrency] DB no disponible; tests omitidos. Arranca Postgres (podman compose up -d db) para ejecutarlos.",
  );
}

// CI (TS1): REQUIRE_INTEGRATION_DB=1 — la ausencia de Postgres revienta el job
// en vez de dejar la suite verde en silencio.
const requireIntegrationDb = process.env["REQUIRE_INTEGRATION_DB"] === "1";
const skipIntegration = !dbUp && !requireIntegrationDb;

/** Crea un producto de prueba (rubro + proveedor + producto). */
async function createFixture(): Promise<{ productoId: string; proveedorId: string; rubroId: string }> {
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
  return { productoId: producto.id, proveedorId: proveedor.id, rubroId: rubro.id };
}

describe("loteIngreso — merge/retry P2002 en ingreso concurrente", () => {
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
    await prisma.$disconnect();
  });

  it.skipIf(skipIntegration)(
    "2 loteIngreso concurrentes (mismo producto, numero_lote, vencimiento) → 1 lote y cantidad suma sin pérdida",
    async () => {
      const f = await createFixture();
      const numeroLote = `CONC-${Date.now()}`;
      const future = new Date();
      future.setMonth(future.getMonth() + 6);
      const futStr = future.toISOString().split("T")[0]!;

      try {
        const [resA, resB] = await Promise.all([
          loteIngreso({
            producto_id: f.productoId,
            numero_lote: numeroLote,
            cantidad: 10,
            precio_compra: 100,
            fecha_vencimiento: futStr,
          }),
          loteIngreso({
            producto_id: f.productoId,
            numero_lote: numeroLote,
            cantidad: 20,
            precio_compra: 100,
            fecha_vencimiento: futStr,
          }),
        ]);

        // Ambos ingresos triunfan: uno crea, el otro hace merge post-P2002.
        expect(resA.isOk()).toBe(true);
        expect(resB.isOk()).toBe(true);

        // Exactamente UNO creó el lote (esNuevo); el otro absorbió al consagrado.
        const esNuevos = [resA, resB]
          .filter((r) => r.isOk())
          .map((r) => r._unsafeUnwrap().esNuevo);
        expect(esNuevos.filter((e) => e === true)).toHaveLength(1);

        // Invariante central: UN solo lote para la merge-key en disputa.
        const lotes = await prisma.lote.findMany({
          where: { producto_id: f.productoId, numero_lote: numeroLote },
        });
        expect(lotes).toHaveLength(1);

        // Cantidad = SUMA, sin pérdida (10 + 20 = 30).
        expect(toNumber(lotes[0]!.cantidad_disponible)).toBe(30);
        // Ambos ingresos al mismo precio → promedio ponderado = 100.
        expect(toNumber(lotes[0]!.precio_compra)).toBe(100);
      } finally {
        // Cleanup del fixture respetando FKs: Lote → Producto → Proveedor/Rubro.
        await prisma.lote
          .deleteMany({ where: { producto_id: f.productoId } })
          .catch(() => {});
        await prisma.producto
          .delete({ where: { id: f.productoId } })
          .catch(() => {});
        await prisma.proveedor
          .delete({ where: { id: f.proveedorId } })
          .catch(() => {});
        await prisma.rubro.delete({ where: { id: f.rubroId } }).catch(() => {});
      }
    },
  );
});