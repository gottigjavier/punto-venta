// src/application/use-cases/cierre-concurrency.test.ts
// Integración: protege la interacción caja↔ventas contra el race condition
// TOCTOU entre `cerrarCaja` y `deleteVenta`.
//
// Escenario: una venta completada abierta (cierre_caja_id NULL) es objetivo
// simultáneo de un cierre de caja y de un borrado.
//   - Sin blindaje, `deleteVenta` valida "venta sin cierre" FUERA de la tx, el
//     cierre la archiva, y el delete la borra igual → el reporte del cierre
//     cuenta una venta que ya no existe (venta fantasma).
//   - Con `FOR UPDATE` + re-validación DENTRO de la tx: si el cierre gana la
//     fila, `deleteVenta` ve `cierre_caja_id` asignado y responde CONFLICT; si
//     `deleteVenta` gana, el cierre ya no la ve abierta y no la archiva. Nunca
//     un cierre termina contando una venta eliminada.
//
// Necesita Postgres dev migrada (DATABASE_URL desde test/setup.ts). Sin DB,
// los tests se omiten.
import { describe, it, afterAll, expect } from "vitest";
import { prisma } from "../../infrastructure/database/prisma/client.js";
import { hashPassword } from "../../infrastructure/auth/password.js";
import { cerrarCaja, createVenta, deleteVenta } from "./venta.use-case.js";

async function pingDb(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (e) {
    console.error(
      "[cierre-concurrency] ping DB FAILED:",
      e instanceof Error ? e.message : String(e),
    );
    return false;
  }
}
const dbUp = await pingDb();
if (!dbUp) {
  console.warn(
    "[cierre-concurrency] DB no disponible; tests omitidos. Arranca Postgres (podman compose up -d db) para ejecutarlos.",
  );
}

interface Fixture {
  usuarioId: string;
  password: string;
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
  const password = "caja-segura-123";
  const usuario = await prisma.usuario.create({
    data: {
      nombre_usuario: username,
      nik_usuario: username,
      password_hash: await hashPassword(password),
      email: `${username}@test.local`,
      rol: "gerente",
      activo: true,
    },
  });
  return {
    usuarioId: usuario.id,
    password,
    productoId: producto.id,
    loteId: lote.id,
  };
}

/** Borra un CierreCaja huérfano (los hits del cierre con cantidad_ventas). */
async function deleteCierres(ids: string[]): Promise<void> {
  for (const id of ids) {
    await prisma.cierreCaja.delete({ where: { id } }).catch(() => {});
  }
}

describe("cerrarCaja ↔ deleteVenta — concurrencia", () => {
  const cierresCreados: string[] = [];

  afterAll(async () => {
    await deleteCierres(cierresCreados);
    await prisma.$disconnect();
  });

  it.skipIf(!dbUp)(
    "deleteVenta lateral al cierre aún abierto: si el cierre archiva primero, deleteVenta responde CONFLICT",
    async () => {
      const f = await createFixture();
      try {
        // Venta completada abierta (stock del lote consumido).
        const resVenta = await createVenta(
          {
            productos: [
              { producto_id: f.productoId, cantidad: 2, precio_unitario: 10 },
            ],
          } as never,
          f.usuarioId,
        );
        expect(resVenta.isOk()).toBe(true);
        const ventaId = resVenta._unsafeUnwrap().id;

        // Cierre de caja CONCURRENTE con el borrado: la carrera decide el ganador,
        // pero el invariante es que nunca queda una venta borrada contada por el cierre.
        const [resCierre, resDelete] = await Promise.all([
          cerrarCaja(f.usuarioId, f.password),
          deleteVenta(ventaId),
        ]);

        if (resCierre.isOk()) {
          // El cierre ganó: la venta quedó archivada y el delete no la pudo borrar.
          cierresCreados.push(resCierre._unsafeUnwrap().id);
          const venta = await prisma.venta.findUnique({
            where: { id: ventaId },
          });
          expect(venta).not.toBeNull();
          expect(venta!.cierre_caja_id).not.toBeNull();
          expect(resDelete.isErr()).toBe(true);
          expect(resDelete._unsafeUnwrapErr().code).toBe("CONFLICT");
        } else {
          // El delete ganó: la venta ya no existe y el cierre no la archivó.
          // (el cierre falla con NO_OPEN_SALES o bien ya no cuenta esta venta).
          const venta = await prisma.venta.findUnique({
            where: { id: ventaId },
          });
          expect(venta).toBeNull();
          expect(resDelete.isOk()).toBe(true);
          if (resCierre.isOk()) {
            cierresCreados.push(resCierre._unsafeUnwrap().id);
            // Invariante duro: si el cierre "ganó" tras el delete, NO pudo contar
            // esta venta (el cierre ya se archivó con lo que leyó ANTES del delete;
            // en ese caso el delete no debió triunfar). Este branch es imposible
            // por el lock de fila; si aparece, es un bug de blindaje.
            expect.unreachable(
              "cierre y delete no pueden triunfar ambos sobre la misma venta",
            );
          }
        }
      } finally {
        await deleteCierres(cierresCreados.splice(0));
        await prisma.lote.delete({ where: { id: f.loteId } }).catch(() => {});
        await prisma.producto
          .delete({ where: { id: f.productoId } })
          .catch(() => {});
      }
    },
  );

  it.skipIf(!dbUp)(
    "8 carreras: nunca un cierre cuenta una venta borrada",
    async () => {
      for (let i = 0; i < 8; i++) {
        const f = await createFixture();
        try {
          const resVenta = await createVenta(
            {
              productos: [
                { producto_id: f.productoId, cantidad: 1, precio_unitario: 10 },
              ],
            } as never,
            f.usuarioId,
          );
          expect(resVenta.isOk()).toBe(true);
          const ventaId = resVenta._unsafeUnwrap().id;

          const [resCierre, resDelete] = await Promise.all([
            cerrarCaja(f.usuarioId, f.password),
            deleteVenta(ventaId),
          ]);

          const venta = await prisma.venta.findUnique({
            where: { id: ventaId },
          });

          if (resCierre.isOk()) {
            const cierre = resCierre._unsafeUnwrap();
            cierresCreados.push(cierre.id);
            // Todo lo archivado sigue existiendo.
            if (venta) {
              expect(venta.cierre_caja_id).toBe(cierre.id);
            }
            // Si la venta ya no está, el cierre no pudo contarla.
            if (!venta) {
              expect(resDelete.isOk()).toBe(true);
            }
          }
          if (resDelete.isOk()) {
            expect(venta).toBeNull();
          }

          // Invariante de integridad en rows: jamás una venta contada por un cierre
          // puede haber sido borrada después. Verificamos que el reporte del cierre
          // (cantidad_ventas) coincide con la cantidad real de ventas archivadas por él.
          const cierres = await prisma.cierreCaja.findMany({
            where: { id: { in: cierresCreados } },
          });
          for (const c of cierres) {
            const contadas = await prisma.venta.count({
              where: { cierre_caja_id: c.id },
            });
            expect(contadas).toBe(c.cantidad_ventas);
          }
        } finally {
          await deleteCierres(cierresCreados.splice(0));
          await prisma.lote.delete({ where: { id: f.loteId } }).catch(() => {});
          await prisma.producto
            .delete({ where: { id: f.productoId } })
            .catch(() => {});
        }
      }
    },
    30_000,
  );
});
