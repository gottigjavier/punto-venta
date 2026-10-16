// src/application/use-cases/venta-fefo.test.ts
// Integración: protege el consumo de stock POR LOTE de `createVenta` bajo FEFO
// (fecha_vencimiento ASC → NULLs al final → created_at ASC) contra una Postgres
// REAL, sin mocks.
//
// Por qué existe este archivo: estos 7 casos vivían en
// src/__tests__/application/use-cases/venta.use-case.test.ts y su helper
// buildTx() quedó desactualizado tras los refactors CO3 (advisory lock
// pg_advisory_xact_lock) y EF5 (batch UPDATE de lotes + detalleVenta.createMany),
// de modo que dejaron de ejercitar el código real. Además el orden FEFO solo
// puede verificarse contra la DB: el orden lo decide el ORDER BY del SELECT de
// lotes dentro de la transacción, que un mock reemplaza por un arreglo fijo.
//
// Qué protege:
//   (1) la cascada FEFO y su split en un DetalleVenta por lote;
//   (2) el salto de lotes agotados dentro de la cascada;
//   (3) que el precio SIEMPRE sale del catálogo (SE2), nunca del input;
//   (4) que un lote sin fecha de vencimiento queda AL FINAL del FEFO;
//   (5) que STOCK_INSUFFICIENT no deja ningún efecto (ni venta, ni detalle,
//       ni descuento);
//   (6) que un lote vencido jamás se descuenta;
//   (7) que un lote que queda en 0 pasa a estado 'agotado'.
//
// Necesita una Postgres dev con el esquema migrado y DATABASE_URL apuntando a
// ella (cargada por test/setup.ts desde .env.development). Si la base no está
// disponible, los tests se omiten (mismo contrato que venta/stock/cierre-
// concurrency); con REQUIRE_INTEGRATION_DB=1 el test de prerequisito falla en
// vez de dejar la suite verde en silencio en CI.
import { describe, it, afterAll, afterEach, expect } from "vitest";
import { prisma } from "../../infrastructure/database/prisma/client.js";
import { createVenta } from "./venta.use-case.js";
import { toNumber } from "../../shared/utils/number.js";

// Detectar la disponibilidad de la DB a nivel de módulo (top-level await).
// Vitest evalúa it.skipIf(!dbUp) al registrar el test, ANTES de cualquier
// beforeAll, por lo que la sonda debe ejecutarse aquí y no dentro de beforeAll.
async function pingDb(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (e) {
    console.error(
      "[venta-fefo] ping DB FAILED:",
      e instanceof Error ? e.message : String(e),
    );
    return false;
  }
}
const dbUp = await pingDb();
if (!dbUp) {
  console.warn(
    "[venta-fefo] DB no disponible; tests omitidos. Arranca Postgres (podman compose up -d db) para ejecutarlos.",
  );
}

// CI (TS1): REQUIRE_INTEGRATION_DB=1 — la ausencia de Postgres revienta el job
// en vez de dejar la suite verde en silencio.
const requireIntegrationDb = process.env["REQUIRE_INTEGRATION_DB"] === "1";
const skipIntegration = !dbUp && !requireIntegrationDb;

type EstadoLote = "activo" | "agotado" | "vencido" | "descartado";

interface Fixture {
  usuarioId: string;
  rubroId: string;
  proveedorId: string;
  productoId: string;
}

// Fixtures sembrados y todavía sin limpiar. Se registra el fixture DENTRO de
// crearFixture para que ningún test pueda olvidarse de declararlo: afterEach
// vacía la lista aunque el test falle por aserción.
const fixtures: Fixture[] = [];

/** Offset en días respecto del now() REAL (sin fake timers: I/O de DB real). */
function dias(n: number): Date {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
}

/**
 * Crea el fixture mínimo para una venta: Rubro + Proveedor + Producto (con el
 * precio de catálogo del caso) + Usuario (FK de Venta.usuario_id).
 * Nombres/códigos únicos por fixture para no chocar con los índices únicos.
 */
async function crearFixture(precioVenta: number): Promise<Fixture> {
  const sfx = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const rubro = await prisma.rubro.create({
    data: { nombre: `RUBRO_${sfx}`, activo: true },
  });
  const proveedor = await prisma.proveedor.create({
    data: { razon_social: `PROV_${sfx}` },
  });
  const producto = await prisma.producto.create({
    data: {
      nombre: `PROD_${sfx}`,
      codigo: `COD_${sfx}`,
      precio_venta: precioVenta,
      rubro_id: rubro.id,
      proveedor_id: proveedor.id,
      unidad_medida: "unidad",
      cantidad_aviso: 0,
      activo: true,
      vencimiento_preaviso_dias: 30,
    },
  });
  const username = `user_${sfx}`;
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

  const fixture: Fixture = {
    usuarioId: usuario.id,
    rubroId: rubro.id,
    proveedorId: proveedor.id,
    productoId: producto.id,
  };
  fixtures.push(fixture);
  return fixture;
}

/**
 * Siembra un Lote. `id` y `creadoEn` solo se pasan cuando el caso necesita
 * controlar el orden (FEFO por fecha o desempate por created_at / por id).
 */
async function crearLote(
  productoId: string,
  datos: {
    id?: string;
    cantidad: number;
    /** null = lote sin vencimiento (va al final del FEFO). */
    fechaVencimiento: Date | null;
    estado?: EstadoLote;
    creadoEn?: Date;
  },
): Promise<string> {
  const lote = await prisma.lote.create({
    data: {
      ...(datos.id === undefined ? {} : { id: datos.id }),
      producto_id: productoId,
      numero_lote: null,
      cantidad_disponible: datos.cantidad,
      fecha_compra: new Date(),
      fecha_vencimiento: datos.fechaVencimiento,
      precio_compra: 5,
      estado: datos.estado ?? "activo",
      ...(datos.creadoEn === undefined ? {} : { created_at: datos.creadoEn }),
    },
    select: { id: true },
  });
  return lote.id;
}

/** Estado REAL de un lote en la DB, ya convertido para asertar. */
async function releerLote(
  id: string,
): Promise<{ id: string; cantidad: number; estado: string }> {
  const lote = await prisma.lote.findUnique({ where: { id } });
  if (!lote) throw new Error(`El lote ${id} no existe en la DB`);
  return {
    id: lote.id,
    cantidad: toNumber(lote.cantidad_disponible),
    estado: lote.estado,
  };
}

/** Filas REALES de detalle_venta de una venta (una por lote spliteado). */
async function detallesDe(ventaId: string) {
  return prisma.detalleVenta.findMany({ where: { venta_id: ventaId } });
}

/** Venta REAL existente en la DB (falla el test si no quedó creada). */
async function releerVenta(ventaId: string) {
  const venta = await prisma.venta.findUnique({ where: { id: ventaId } });
  if (!venta) throw new Error(`La venta ${ventaId} no existe en la DB`);
  return venta;
}

/**
 * Limpieza respetando las FK: DetalleVenta → Venta → Lote → Producto →
 * Proveedor/Rubro → Usuario. Cada paso es best-effort: la limpieza nunca
 * debe enmascarar el resultado real del test.
 */
async function limpiar(f: Fixture): Promise<void> {
  await prisma.detalleVenta
    .deleteMany({ where: { producto_id: f.productoId } })
    .catch(() => {});
  const ventas = await prisma.venta
    .findMany({ where: { usuario_id: f.usuarioId }, select: { id: true } })
    .catch(() => [] as Array<{ id: string }>);
  if (ventas.length > 0) {
    const ids = ventas.map((v) => v.id);
    await prisma.detalleVenta
      .deleteMany({ where: { venta_id: { in: ids } } })
      .catch(() => {});
    await prisma.venta
      .deleteMany({ where: { id: { in: ids } } })
      .catch(() => {});
  }
  await prisma.lote
    .deleteMany({ where: { producto_id: f.productoId } })
    .catch(() => {});
  await prisma.producto.delete({ where: { id: f.productoId } }).catch(() => {});
  await prisma.proveedor.delete({ where: { id: f.proveedorId } }).catch(() => {});
  await prisma.rubro.delete({ where: { id: f.rubroId } }).catch(() => {});
  await prisma.usuario.delete({ where: { id: f.usuarioId } }).catch(() => {});
}

describe("createVenta — FEFO sobre lotes (integración con Postgres)", () => {
  // Prerequisito: en CI (REQUIRE_INTEGRATION_DB=1) la DB debe estar disponible.
  if (requireIntegrationDb) {
    it("[prereq] Postgres disponible para integración", () => {
      expect(
        dbUp,
        "REQUIRE_INTEGRATION_DB=1 pero no hay Postgres. El job de CI debe levantar la DB o este test revienta.",
      ).toBe(true);
    });
  }

  afterEach(async () => {
    const pendientes = fixtures.splice(0, fixtures.length);
    for (const f of pendientes) {
      await limpiar(f);
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it.skipIf(skipIntegration)(
    "FEFO: consume L2(7) luego L3(3), L1 intacto; 2 detalles con lote_id; total=500",
    { timeout: 15000 },
    async () => {
      const f = await crearFixture(50);

      // IDs EXPLICITOS: hacen determinista la diferencia entre el orden FEFO
      // correcto (L2 → L3 → L1) y el orden lexicográfico por id
      // (L1 → L3 → L2, verificado contra la DB). Hoy `createVenta` ordena con
      // `ORDER BY producto_id, id` (venta.use-case.ts:161) y `id` es un UUID
      // v4 → orden ALEATORIO, no FEFO: este test FALLA SIEMPRE y no por azar.
      // Con el fix (ORDER BY producto_id, fecha_vencimiento ASC NULLS LAST,
      // created_at ASC, id ASC) pasa SIEMPRE. Sin ids explícitos sería flaky.
      const l1Id = "fef00001-0000-4000-8000-000000000001"; // vence EL ULTIMO
      const l3Id = "fef00001-0000-4000-8000-000000000002";
      const l2Id = "fef00001-0000-4000-8000-000000000003"; // vence PRIMERO

      // L2 y L3 vencen el MISMO día (empate en fecha) → el desempate FEFO es
      // created_at ASC: L2 se creó 5 s antes que L3, así que L2 va primero.
      const creadoBase = new Date(Date.now() - 60_000);
      await crearLote(f.productoId, {
        id: l1Id,
        cantidad: 5,
        fechaVencimiento: dias(3),
        creadoEn: creadoBase,
      });
      await crearLote(f.productoId, {
        id: l3Id,
        cantidad: 3,
        fechaVencimiento: dias(1),
        creadoEn: new Date(creadoBase.getTime() + 5_000),
      });
      await crearLote(f.productoId, {
        id: l2Id,
        cantidad: 7,
        fechaVencimiento: dias(1),
        creadoEn: creadoBase,
      });

      const result = await createVenta(
        { productos: [{ producto_id: f.productoId, cantidad: 10 }] },
        f.usuarioId,
      );
      expect(result.isOk()).toBe(true);
      if (!result.isOk()) return;

      // (1) FEFO: se consumen solo L2 (vence primero) y L3; L1, que vence
      // después, queda INTACTO. Un DetalleVenta por lote, con su lote_id.
      const porLote: Record<string, number> = {};
      for (const d of await detallesDe(result.value.id)) {
        porLote[d.lote_id ?? "(null)"] = toNumber(d.cantidad);
      }
      expect(porLote).toEqual({ [l2Id]: 7, [l3Id]: 3 });

      // (2) Estado REAL de los tres lotes en la DB.
      expect(await releerLote(l1Id)).toEqual({
        id: l1Id,
        cantidad: 5,
        estado: "activo",
      });
      expect(await releerLote(l2Id)).toEqual({
        id: l2Id,
        cantidad: 0,
        estado: "agotado",
      });
      expect(await releerLote(l3Id)).toEqual({
        id: l3Id,
        cantidad: 0,
        estado: "agotado",
      });

      // (3) total = 7*50 + 3*50 = 500 y precio SIEMPRE del catálogo (SE2).
      expect(toNumber((await releerVenta(result.value.id)).total)).toBe(500);
      for (const d of await detallesDe(result.value.id)) {
        expect(toNumber(d.precio_unitario)).toBe(50);
      }
    },
  );

  it.skipIf(skipIntegration)(
    "cascada saltando lote agotado (L1 agotado, L4 qty4 → solo L4)",
    { timeout: 15000 },
    async () => {
      const f = await crearFixture(50);
      // El SELECT de lotes filtra `estado = 'activo'`; para que un lote
      // agotado llegue al `continue` de la cascada tiene que estar todavía en
      // 'activo' con cantidad 0 (estado real alcanzable). Con estado='agotado'
      // lo excluiría la query y no se ejercitaría la cascada.
      const l1Id = await crearLote(f.productoId, {
        cantidad: 0,
        fechaVencimiento: dias(1),
      });
      const l4Id = await crearLote(f.productoId, {
        cantidad: 4,
        fechaVencimiento: dias(3),
      });

      const result = await createVenta(
        { productos: [{ producto_id: f.productoId, cantidad: 3 }] },
        f.usuarioId,
      );
      expect(result.isOk()).toBe(true);
      if (!result.isOk()) return;

      const filas = await detallesDe(result.value.id);
      expect(filas).toHaveLength(1);
      expect(filas[0]?.lote_id).toBe(l4Id);
      expect(toNumber(filas[0]?.cantidad)).toBe(3);
      expect(toNumber(filas[0]?.subtotal)).toBe(150);

      // L1 (agotado) ni se mueve; L4 absorbe los 3 y queda en 1.
      expect(await releerLote(l1Id)).toEqual({
        id: l1Id,
        cantidad: 0,
        estado: "activo",
      });
      expect(await releerLote(l4Id)).toEqual({
        id: l4Id,
        cantidad: 1,
        estado: "activo",
      });
      expect(toNumber((await releerVenta(result.value.id)).total)).toBe(150);
    },
  );

  it.skipIf(skipIntegration)(
    "SE2: usa SIEMPRE el precio del catálogo; el cliente no puede fijar el precio",
    { timeout: 15000 },
    async () => {
      // Catálogo: precio_venta = 100 (fuente de verdad).
      const f = await crearFixture(100);
      const loteId = await crearLote(f.productoId, {
        cantidad: 4,
        fechaVencimiento: dias(3),
      });

      // El DTO de línea no acepta precio_unitario; se lo mandamos igual para
      // demostrar que el use-case lo IGNORA y resuelve el precio desde
      // Producto.precio_venta (SE2). Se infiere en una variable aparte a
      // propósito: el tipo del input no contempla ese campo.
      const input = {
        productos: [
          { producto_id: f.productoId, cantidad: 3, precio_unitario: 1 },
        ],
      };

      const result = await createVenta(input, f.usuarioId);
      expect(result.isOk()).toBe(true);
      if (!result.isOk()) return;

      const filas = await detallesDe(result.value.id);
      expect(filas).toHaveLength(1);
      expect(filas[0]?.lote_id).toBe(loteId);
      expect(toNumber(filas[0]?.precio_unitario)).toBe(100); // catálogo, no 1
      expect(toNumber(filas[0]?.subtotal)).toBe(300); // 3 * 100
      expect(toNumber((await releerVenta(result.value.id)).total)).toBe(300);
      expect(await releerLote(loteId)).toEqual({
        id: loteId,
        cantidad: 1,
        estado: "activo",
      });
    },
  );

  it.skipIf(skipIntegration)(
    "lote venc NULL va al final del FEFO",
    { timeout: 15000 },
    async () => {
      const f = await crearFixture(50);
      const l6Id = await crearLote(f.productoId, {
        cantidad: 3,
        fechaVencimiento: dias(1),
      });
      const l5Id = await crearLote(f.productoId, {
        cantidad: 5,
        fechaVencimiento: null,
      });

      const result = await createVenta(
        { productos: [{ producto_id: f.productoId, cantidad: 4 }] },
        f.usuarioId,
      );
      expect(result.isOk()).toBe(true);
      if (!result.isOk()) return;

      // El orden del SELECT no importa acá: el use-case separa los lotes SIN
      // fecha de vencimiento y los pone al final, así que L6 (con fecha) se
      // agota primero y L5 (NULL) entra solo a cubrir el resto.
      const porLote: Record<string, number> = {};
      for (const d of await detallesDe(result.value.id)) {
        porLote[d.lote_id ?? "(null)"] = toNumber(d.cantidad);
      }
      expect(porLote).toEqual({ [l6Id]: 3, [l5Id]: 1 });

      expect(await releerLote(l6Id)).toEqual({
        id: l6Id,
        cantidad: 0,
        estado: "agotado",
      });
      expect(await releerLote(l5Id)).toEqual({
        id: l5Id,
        cantidad: 4,
        estado: "activo",
      });
      expect(toNumber((await releerVenta(result.value.id)).total)).toBe(200);
    },
  );

  it.skipIf(skipIntegration)(
    "STOCK_INSUFFICIENT: disponible < solicitado → no crea venta ni descuenta",
    { timeout: 15000 },
    async () => {
      const f = await crearFixture(50);
      const loteId = await crearLote(f.productoId, {
        cantidad: 3,
        fechaVencimiento: dias(3),
      });

      const result = await createVenta(
        { productos: [{ producto_id: f.productoId, cantidad: 10 }] },
        f.usuarioId,
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe("STOCK_INSUFFICIENT");
        if (result.error.code === "STOCK_INSUFFICIENT") {
          expect(result.error.disponible).toBe(3);
          expect(result.error.solicitado).toBe(10);
        }
      }

      // Rollback completo: NO existe la venta ni ningún detalle...
      expect(await prisma.venta.count({ where: { usuario_id: f.usuarioId } })).toBe(0);
      expect(
        await prisma.detalleVenta.count({ where: { producto_id: f.productoId } }),
      ).toBe(0);
      // ...y NINGÚN cantidad_disponible ni estado de lote cambió.
      expect(await releerLote(loteId)).toEqual({
        id: loteId,
        cantidad: 3,
        estado: "activo",
      });
    },
  );

  it.skipIf(skipIntegration)(
    "lote vencido jamás se descuenta",
    { timeout: 15000 },
    async () => {
      const f = await crearFixture(50);
      // LV: ya estaba 'vencido' → lo descarta el filtro estado='activo'.
      const lvId = await crearLote(f.productoId, {
        cantidad: 8,
        fechaVencimiento: dias(-3),
        estado: "vencido",
      });
      // LV2: ya venció pero todavía está 'activo' → lo descarta la ventana de
      // fechas del SELECT (y de paso el lazy pass lo retira a 'vencido').
      const lv2Id = await crearLote(f.productoId, {
        cantidad: 6,
        fechaVencimiento: dias(-3),
        estado: "activo",
      });
      // LA: vigente → único que puede consumirse.
      const laId = await crearLote(f.productoId, {
        cantidad: 2,
        fechaVencimiento: dias(30),
        estado: "activo",
      });

      const result = await createVenta(
        { productos: [{ producto_id: f.productoId, cantidad: 2 }] },
        f.usuarioId,
      );
      expect(result.isOk()).toBe(true);
      if (!result.isOk()) return;

      const filas = await detallesDe(result.value.id);
      expect(filas).toHaveLength(1);
      expect(filas[0]?.lote_id).toBe(laId);
      expect(toNumber(filas[0]?.cantidad)).toBe(2);

      // Invariante del caso: los vencidos NO se descuentan. (El estado final de
      // LV2 lo decide el lazy pass; acá solo se protege que su cantidad no
      // cambie, que es lo que exige este caso.)
      expect(await releerLote(lvId)).toEqual({
        id: lvId,
        cantidad: 8,
        estado: "vencido",
      });
      expect((await releerLote(lv2Id)).cantidad).toBe(6);
      expect(await releerLote(laId)).toEqual({
        id: laId,
        cantidad: 0,
        estado: "agotado",
      });
    },
  );

  it.skipIf(skipIntegration)(
    "lote a 0 → estado agotado",
    { timeout: 15000 },
    async () => {
      const f = await crearFixture(50);
      const loteId = await crearLote(f.productoId, {
        cantidad: 2,
        fechaVencimiento: dias(3),
      });

      const result = await createVenta(
        { productos: [{ producto_id: f.productoId, cantidad: 2 }] },
        f.usuarioId,
      );
      expect(result.isOk()).toBe(true);
      if (!result.isOk()) return;

      const filas = await detallesDe(result.value.id);
      expect(filas).toHaveLength(1);
      expect(toNumber(filas[0]?.cantidad)).toBe(2);
      expect(toNumber(filas[0]?.precio_unitario)).toBe(50);
      expect(toNumber(filas[0]?.subtotal)).toBe(100);

      // Queda exactamente en 0 → el batch UPDATE lo pasa a 'agotado'.
      expect(await releerLote(loteId)).toEqual({
        id: loteId,
        cantidad: 0,
        estado: "agotado",
      });
      expect(toNumber((await releerVenta(result.value.id)).total)).toBe(100);
    },
  );
});
