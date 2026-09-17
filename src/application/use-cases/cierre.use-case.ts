// src/application/use-cases/cierre.use-case.ts
// Cash closure use cases
import { ok, err } from "neverthrow";
import { Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma/client.js";
import { listVentasCierreConDetalles } from "../../infrastructure/database/repositories/venta.repository.js";
import type { AppResult } from "../../shared/types/result.js";
import { notFoundError, databaseError, validationError } from "../../shared/types/result.js";
import type { ListCierresQueryInput } from "../dto/cierre.dto.js";
import type { VentaCierreQueryInput } from "../dto/venta.dto.js";
import type { VentaCierreRespuesta } from "../../domain/entities/venta.js";
import { logger } from "../../infrastructure/logging/logger.js";
import { toNumber, toDecimal } from "../../shared/utils/number.js";
import {
  encodeCursor,
  decodeCursor,
} from "../../shared/utils/cursor.js";

// Escape CSV field (wrap in quotes if contains comma or quote). Además
// neutraliza la inyección de fórmula (SE5, OWASP CSV Injection): una celda que
// empieza con = + - @ (o tab/CR) puede ejecutarse como fórmula al abrir el CSV
// en Excel/Sheets. Se prefija con comilla simple, sin romper el quoting
// existente. Solo recibe datos no numéricos (tipo, referencia_id, nombre); los
// montos/cantidades van directos, sin pasar por acá.
function escapeCsv(value: string): string {
  // Neutralizar formula injection: prefijar ' los inicios peligrosos (OWASP).
  if (/^[=+\-@\t\r]/.test(value)) {
    value = `'${value}`;
  }

  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// List cash closures with filters and pagination
export async function listCierres(query: ListCierresQueryInput): Promise<
  AppResult<{
    data: Array<{
      id: string;
      fecha_apertura: Date;
      fecha_cierre: Date | null;
      monto_total: number;
      ingresos_total: number;
      egresos_total: number;
      cantidad_ventas: number;
      usuario_apertura: { id: string; nombre_usuario: string };
      usuario_cierre: { id: string; nombre_usuario: string } | null;
    }>;
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
    next_cursor: string | null;
  }>
> {
  try {
    const {
      page,
      limit,
      fecha_desde,
      fecha_hasta,
      vendedor_id,
      producto_id,
      proveedor_id,
      monto_min,
      monto_max,
      sort,
      order,
      cursor,
    } = query;

    // EF3 (reporte 26/09): keyset pagination como modo ADICIONAL al offset.
    // Cursor opaco (base64url) sobre (fecha_cierre, id) — la columna de orden
    // real del listado y la indexada (@@index([fecha_cierre])). Requiere
    // sort=fecha_cierre: en cualquier otro sort el rango keyset no coincidiría
    // con el ORDER BY y se rechaza (nunca se devuelven datos incorrectos).
    const keyset = cursor ? decodeCursor(cursor) : null;
    if (cursor && !keyset) {
      return err(validationError("Cursor inválido"));
    }
    if (keyset && sort !== "fecha_cierre") {
      return err(
        validationError(
          "El cursor solo es compatible con sort=fecha_cierre",
        ),
      );
    }
    let skip: number | undefined = (page - 1) * limit;

    // Build where clause
    const where: Prisma.CierreCajaWhereInput = {};

    // Date filters on fecha_cierre
    if (fecha_desde || fecha_hasta) {
      where.fecha_cierre = {};
      if (fecha_desde) {
        (where.fecha_cierre as Prisma.DateTimeFilter).gte = fecha_desde;
      }
      if (fecha_hasta) {
        (where.fecha_cierre as Prisma.DateTimeFilter).lte = fecha_hasta;
      }
    }

    // Amount filters
    if (monto_min !== undefined || monto_max !== undefined) {
      where.monto_total = {};
      if (monto_min !== undefined) {
        (where.monto_total as Prisma.DecimalFilter).gte = monto_min;
      }
      if (monto_max !== undefined) {
        (where.monto_total as Prisma.DecimalFilter).lte = monto_max;
      }
    }

    // Filter by vendor (detalle tipo vendedor with referencia_id = vendedor_id)
    if (vendedor_id) {
      where.detalles = {
        some: {
          tipo: "vendedor",
          referencia_id: vendedor_id,
        },
      };
    }

    // Filter by product (detalle tipo producto with referencia_id = producto_id)
    if (producto_id) {
      where.detalles = {
        some: {
          tipo: "producto",
          referencia_id: producto_id,
        },
      };
    }

    // Filter by provider (requires join: detalles → producto → proveedor)
    if (proveedor_id) {
      // First get all product IDs for this provider
      const productos = await prisma.producto.findMany({
        where: { proveedor_id },
        select: { id: true },
      });
      const productoIds = productos.map((p) => p.id);

      if (productoIds.length === 0) {
        // No products for this provider, return empty result
        return ok({
          data: [],
          pagination: { page, limit, total: 0, totalPages: 0 },
          next_cursor: null,
        });
      }

      where.detalles = {
        some: {
          tipo: "producto",
          referencia_id: { in: productoIds },
        },
      };
    }

    let orderBy:
      | Prisma.CierreCajaOrderByWithRelationInput
      | Prisma.CierreCajaOrderByWithRelationInput[] = { [sort]: order };
    let take = limit;
    if (keyset) {
      // Condición keyset sobre (fecha_cierre, id). fecha_cierre es nullable:
      // Postgres ordena NULLs FIRST en DESC y NULLS LAST en ASC, así que las
      // condiciones cubren también el bloque de NULLs (un cursor con
      // fecha_cierre null solo puede provenir de ese bloque). Se combina con
      // los filtros por AND (top-level keys de `where`), nunca los saltea.
      if (order === "desc") {
        where.OR =
          keyset.createdAt === null
            ? [
                { fecha_cierre: null, id: { lt: keyset.id } },
                { fecha_cierre: { not: null } },
              ]
            : [
                { fecha_cierre: { lt: keyset.createdAt } },
                { fecha_cierre: keyset.createdAt, id: { lt: keyset.id } },
              ];
      } else {
        where.OR =
          keyset.createdAt === null
            ? [{ fecha_cierre: null, id: { gt: keyset.id } }]
            : [
                { fecha_cierre: { gt: keyset.createdAt } },
                { fecha_cierre: keyset.createdAt, id: { gt: keyset.id } },
                { fecha_cierre: null },
              ];
      }
      orderBy = [{ fecha_cierre: order }, { id: order }];
      skip = undefined;
      take = limit + 1; // +1 solo para detectar has_more (se recorta después)
    }

    const [cierres, total] = await Promise.all([
      prisma.cierreCaja.findMany({
        where,
        include: {
          usuario_apertura: {
            select: { id: true, nombre_usuario: true },
          },
          usuario_cierre: {
            select: { id: true, nombre_usuario: true },
          },
        },
        orderBy,
        skip,
        take,
      }),
      prisma.cierreCaja.count({ where }),
    ]);

    // EF3: en modo cursor, take = limit+1; la página real son las primeras
    // `limit` filas y el next_cursor se arma desde la ÚLTIMA fila de la página.
    const hasMore = keyset !== null && cierres.length > limit;
    const pageCierres = hasMore ? cierres.slice(0, limit) : cierres;

    const data = pageCierres.map((c) => ({
      id: c.id,
      fecha_apertura: c.fecha_apertura,
      fecha_cierre: c.fecha_cierre,
      monto_total: toNumber(c.monto_total),
      ingresos_total: toNumber(c.ingresos_total),
      egresos_total: toNumber(c.egresos_total),
      cantidad_ventas: c.cantidad_ventas,
      usuario_apertura: c.usuario_apertura,
      usuario_cierre: c.usuario_cierre,
    }));

    const totalPages = Math.ceil(total / limit);
    const last = pageCierres[pageCierres.length - 1];
    const next_cursor =
      keyset !== null && hasMore && last
        ? encodeCursor(last.fecha_cierre, last.id)
        : null;

    return ok({
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
      next_cursor,
    });
  } catch (error) {
    logger.error({ error, query }, "Error al listar cierres");
    return err(databaseError("Error al listar cierres", error as Error));
  }
}

// Get cash closure by ID with details
export async function getCierreById(id: string): Promise<
  AppResult<{
    id: string;
    fecha_apertura: Date;
    fecha_cierre: Date | null;
    monto_total: number;
    ingresos_total: number;
    egresos_total: number;
    cantidad_ventas: number;
    estado: string;
    usuario_apertura: { id: string; nombre_usuario: string };
    usuario_cierre: { id: string; nombre_usuario: string } | null;
    detalles: Array<{
      id: string;
      tipo: string;
      referencia_id: string;
      nombre: string;
      cantidad: number;
      monto_total: number;
    }>;
    movimientos: Array<{
      id: string;
      tipo: "ingreso" | "egreso";
      monto: number;
      descripcion: string | null;
      usuario_id: string;
      created_at: Date;
      usuario: { id: string; nombre_usuario: string };
    }>;
  }>
> {
  try {
    const cierre = await prisma.cierreCaja.findUnique({
      where: { id },
      include: {
        detalles: true,
        movimientos: {
          include: {
            usuario: {
              select: { id: true, nombre_usuario: true },
            },
          },
          orderBy: { created_at: "asc" },
        },
        usuario_apertura: {
          select: { id: true, nombre_usuario: true },
        },
        usuario_cierre: {
          select: { id: true, nombre_usuario: true },
        },
      },
    });

    if (!cierre) {
      return err(notFoundError("Cierre de caja no encontrado"));
    }

    return ok({
      id: cierre.id,
      fecha_apertura: cierre.fecha_apertura,
      fecha_cierre: cierre.fecha_cierre,
      monto_total: toNumber(cierre.monto_total),
      ingresos_total: toNumber(cierre.ingresos_total),
      egresos_total: toNumber(cierre.egresos_total),
      cantidad_ventas: cierre.cantidad_ventas,
      estado: cierre.estado as string,
      usuario_apertura: cierre.usuario_apertura,
      usuario_cierre: cierre.usuario_cierre,
      detalles: cierre.detalles.map((d) => ({
        id: d.id,
        tipo: d.tipo,
        referencia_id: d.referencia_id,
        nombre: d.nombre,
        cantidad: toNumber(d.cantidad),
        monto_total: toNumber(d.monto_total),
      })),
      movimientos: cierre.movimientos.map((m) => ({
        id: m.id,
        tipo: m.tipo,
        monto: toNumber(m.monto),
        descripcion: m.descripcion,
        usuario_id: m.usuario_id,
        created_at: m.created_at,
        usuario: m.usuario,
      })),
    });
  } catch (error) {
    logger.error({ error, id }, "Error al obtener cierre");
    return err(databaseError("Error al obtener cierre", error as Error));
  }
}

// Export cash closure details as CSV string
export async function exportCierreCsv(
  id: string,
  limit: number = 10000,
): Promise<
  AppResult<{ csv: string; totalDetalles: number; truncated: boolean }>
> {
  try {
    const cierre = await prisma.cierreCaja.findUnique({
      where: { id },
      include: {
        detalles: true,
      },
    });

    if (!cierre) {
      return err(notFoundError("Cierre de caja no encontrado"));
    }

    const detalles = cierre.detalles;
    const truncated = detalles.length > limit;
    const detallesToExport = truncated ? detalles.slice(0, limit) : detalles;

    // Build CSV
    const header = "tipo,referencia_id,nombre,cantidad,monto_total";
    const rows = detallesToExport.map((d) => {
      return [
        escapeCsv(d.tipo),
        escapeCsv(d.referencia_id),
        escapeCsv(d.nombre),
        d.cantidad.toString(),
        toNumber(d.monto_total).toFixed(2),
      ].join(",");
    });

    let csv = header + "\n" + rows.join("\n");
    if (truncated) {
      csv += `\n...,AVISO: Truncado a ${limit} registros`;
    }

    return ok({
      csv,
      totalDetalles: detalles.length,
      truncated,
    });
  } catch (error) {
    logger.error({ error, id }, "Error al exportar cierre CSV");
    return err(databaseError("Error al exportar cierre CSV", error as Error));
  }
}

// List flattened sales rows for a cash closure with server-side filters
export async function listVentasByCierreConDetalles(
  cierreCajaId: string,
  filters: VentaCierreQueryInput,
): Promise<AppResult<VentaCierreRespuesta>> {
  try {
    // 1. Verify cierre exists
    const cierre = await prisma.cierreCaja.findUnique({
      where: { id: cierreCajaId },
    });

    if (!cierre) {
      return err(notFoundError("Cierre de caja", cierreCajaId));
    }

    // 2. Fetch filtered + ordered flat rows straight from SQL (EF1: ya no se
    // trae todo el cierre para filtrar/ordenar en memoria; el repository
    // aplica WHERE/ORDER BY + includes minimales)
    const filas = await listVentasCierreConDetalles(cierreCajaId, filters);

    // 3. Map repository rows to the response shape (Decimal → number en el borde)
    const rows = filas.map((f) => ({
      id_venta: f.id_venta,
      vendedor: f.vendedor,
      producto: f.producto,
      cantidad: toNumber(f.cantidad),
      monto: toNumber(f.monto),
    }));

    // 4. Totals over the filtered set. QC5: la suma corre en Decimal sobre las
    // filas crudas (f.monto ya es Prisma.Decimal, aún sin convertir) y recién
    // acá, en el borde, se convierte a number para el wire.
    const total_monto = toNumber(
      filas.reduce(
        (sum, f) => sum.plus(toDecimal(f.monto)),
        new Prisma.Decimal(0),
      ),
    );

    return ok({
      rows,
      total_monto,
      total_filas: rows.length,
    });
  } catch (error) {
    logger.error({ error, cierreCajaId }, "Error al listar ventas del cierre");
    return err(
      databaseError("Error al listar ventas del cierre", error as Error),
    );
  }
}
