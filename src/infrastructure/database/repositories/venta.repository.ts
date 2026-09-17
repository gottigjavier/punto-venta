// src/infrastructure/database/repositories/venta.repository.ts
// Persistencia de Venta/DetalleVenta. EF1 (reporte 26/09): el filtrado y el
// orden de las filas planas del cierre se resuelven acá en SQL (where/orderBy),
// en vez de materializar todo el cierre y filtrar/ordenar en JS en el use case.
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma/client.js";

// Filtros/orden aceptados por listVentasCierreConDetalles. Forma estructural
// (compatible con VentaCierreQueryInput del use case) para no acoplar
// infrastructure → application.
export interface VentasCierreDetallesFiltros {
  id_venta?: string;
  vendedor?: string;
  producto?: string;
  monto_min?: number;
  monto_max?: number;
  sort: "cantidad" | "monto" | "id_venta";
  order: "asc" | "desc";
}

// Fila plana tal como sale de la DB (una por línea de DetalleVenta).
// cantidad/subtotal conservan Decimal; la conversión a number ocurre en el
// borde (use case), igual que en el resto del proyecto.
export interface VentaCierreFilaConDetalles {
  id_venta: string;
  vendedor: string;
  producto: string;
  cantidad: Prisma.Decimal;
  monto: Prisma.Decimal;
}

// El filtro id_venta busca substring case-insensitive sobre el texto del uuid
// (hoy: toLowerCase + includes en memoria). UuidFilter de Prisma no expone
// contains/startsWith (solo equals/in/lt/gt...), y LIKE/ILIKE directo sobre
// una columna uuid en Postgres falla ("operator does not exist: uuid ~~
// unknown"). Se resuelve el conjunto de id de venta con una subconsulta raw
// acotada al cierre (parámetros bindeados; comodines de LIKE escapados para
// reproducir includes() literal) y el findMany filtrado usa id: { in }.
async function resolverIdsVentaPorTexto(
  cierreCajaId: string,
  needle: string,
): Promise<string[]> {
  const patron = `%${needle.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "Venta"
    WHERE "cierre_caja_id" = ${cierreCajaId}
      AND CAST("id" AS TEXT) ILIKE ${patron}
  `;
  return rows.map((r) => r.id);
}

// Filas planas (venta × línea de venta) de un cierre, filtradas y ordenadas en
// SQL. Sin take/skip a propósito: el contrato del endpoint devuelve todas las
// filas del conjunto filtrado más los totales (total_monto/total_filas se
// calculan sobre ese conjunto, no sobre una página).
export async function listVentasCierreConDetalles(
  cierreCajaId: string,
  filtros: VentasCierreDetallesFiltros,
): Promise<VentaCierreFilaConDetalles[]> {
  const idsVenta = filtros.id_venta
    ? await resolverIdsVentaPorTexto(cierreCajaId, filtros.id_venta)
    : undefined;

  const where = {
    venta: {
      cierre_caja_id: cierreCajaId,
      ...(idsVenta ? { id: { in: idsVenta } } : {}),
      ...(filtros.vendedor
        ? {
            usuario: {
              nombre_usuario: {
                contains: filtros.vendedor,
                mode: "insensitive" as const,
              },
            },
          }
        : {}),
    },
    ...(filtros.producto
      ? {
          producto: {
            nombre: {
              contains: filtros.producto,
              mode: "insensitive" as const,
            },
          },
        }
      : {}),
    ...(filtros.monto_min !== undefined || filtros.monto_max !== undefined
      ? {
          subtotal: {
            ...(filtros.monto_min !== undefined
              ? { gte: filtros.monto_min }
              : {}),
            ...(filtros.monto_max !== undefined
              ? { lte: filtros.monto_max }
              : {}),
          },
        }
      : {}),
  } satisfies Prisma.DetalleVentaWhereInput;

  const orderBy: Prisma.DetalleVentaOrderByWithRelationInput =
    filtros.sort === "id_venta"
      ? { venta: { id: filtros.order } }
      : filtros.sort === "monto"
        ? { subtotal: filtros.order }
        : { cantidad: filtros.order };

  const filas = await prisma.detalleVenta.findMany({
    where,
    orderBy,
    include: {
      venta: {
        select: {
          id: true,
          usuario: { select: { nombre_usuario: true } },
        },
      },
      producto: { select: { nombre: true } },
    },
  });

  return filas.map((d) => ({
    id_venta: d.venta.id,
    vendedor: d.venta.usuario.nombre_usuario,
    producto: d.producto.nombre,
    cantidad: d.cantidad,
    monto: d.subtotal,
  }));
}