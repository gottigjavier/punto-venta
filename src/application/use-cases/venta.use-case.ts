// src/application/use-cases/venta.use-case.ts
// Sale use cases
// createVenta consume stock por LOTE bajo FEFO (fecha_vencimiento ASC, created_at
// ASC, NULLs al final) y SPLITEA una línea en N DetalleVenta (uno por lote), cada
// uno con su lote_id. deleteVenta revierte el stock POR LOTE y rechaza ventas
// pre-migración (lote_id null).
import { ok, err } from "neverthrow";
import { Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma/client.js";
import type { AppResult } from "../../shared/types/result.js";
import {
  notFoundError,
  databaseError,
  validationError,
} from "../../shared/types/result.js";
import type {
  VentaWithDetalles,
  VentaListItem,
  ResumenDia,
  ProductoMasVendido,
} from "../../domain/entities/venta.js";
import type { CreateVentaInput, VentaQueryInput } from "../dto/venta.dto.js";
import { logger } from "../../infrastructure/logging/logger.js";
import { verifyPassword } from "../../infrastructure/auth/password.js";
import { retirarLotesVencidos } from "./stock.use-case.js";
import { ADVISORY_LOCK_CIERRE_CAJA } from "../../infrastructure/database/transactions.js";
import { toNumber, toDecimal } from "../../shared/utils/number.js";
import {
  startOfDay,
  endOfDay,
  limiteHoy,
  toUTC3DateString,
} from "../../shared/utils/date.js";
import {
  encodeCursor,
  decodeCursor,
} from "../../shared/utils/cursor.js";

// Error interno para interrumpir la transacción con stock insuficiente (rollback)
class StockInsuficienteError extends Error {
  disponible: number;
  solicitado: number;
  productoId: string;
  constructor(disponible: number, solicitado: number, productoId: string) {
    super(`Stock insuficiente para producto ${productoId}`);
    this.disponible = disponible;
    this.solicitado = solicitado;
    this.productoId = productoId;
  }
}

// Aborta la eliminación de una venta cuando, dentro de la transacción, se detecta
// que un cerrarCaja concurrente la archivó (o cambió su estado) entre la validación
// externa y el momento del delete. El catch de deleteVenta lo traduce a CONFLICT.
class VentaDeleteConflictError extends Error {
  code: "CONFLICT";
  constructor(message: string) {
    super(message);
    this.code = "CONFLICT";
  }
}

// Create a sale (atomic transaction) — FEFO en cascada sobre lotes
export async function createVenta(
  input: CreateVentaInput,
  usuarioId: string,
): Promise<AppResult<VentaWithDetalles>> {
  try {
    // 1. Verify all products exist Y tomar el precio de venta del CATÁLOGO.
    //    SE2: el precio de cada línea se resuelve desde Producto.precio_venta
    //    (fuente de verdad). El cliente ya no puede fijar el precio unitario
    //    de una venta — eso congelaba en DetalleVenta / cierres cualquier
    //    valor arbitrario del request (0, negativo, precios de otro producto).
    const productIds = input.productos.map((p) => p.producto_id);
    const productos = await prisma.producto.findMany({
      where: { id: { in: productIds } },
      select: { id: true, precio_venta: true },
    });

    if (productos.length !== productIds.length) {
      const foundIds = new Set(productos.map((p) => p.id));
      const missingId = productIds.find((id) => !foundIds.has(id));
      return err(notFoundError("Producto", missingId));
    }

    // Mapa producto→precio de venta del catálogo. Patrón QC5: se conserva
    // Decimal para que el subtotal (cantidad × precio) se calcule sin float;
    // la conversión a number ocurre solo en el borde (respuesta/wire).
    const precioPorProducto = new Map<string, Prisma.Decimal>();
    for (const p of productos) {
      precioPorProducto.set(p.id, toDecimal(p.precio_venta));
    }

    // 2. Execute atomic transaction
    const result = await prisma.$transaction(async (tx) => {
      // CO3 (reporte 26/09): tomar el MISMO advisory lock que cerrarCaja al
      // inicio de la tx. Una venta no puede committear a mitad del cierre con
      // cierre_caja_id NULL (no contada): o entra ANTES del cierre (lo
      // bloqueamos hasta que el cierre commitee) o cae al período NUEVO.
      // Misma constante compartida (ADVISORY_LOCK_CIERRE_CAJA), mismo
      // mecanismo ($executeRaw + pg_advisory_xact_lock), mismo alcance xact
      // (se libera al COMMIT/ROLLBACK).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_CIERRE_CAJA})`;

      // Agrupar líneas por producto_id (una línea puede venir repetida)
      const agrupadas = new Map<string, { cantidad: number }>();
      for (const item of input.productos) {
        const curr = agrupadas.get(item.producto_id) ?? { cantidad: 0 };
        curr.cantidad += item.cantidad;
        agrupadas.set(item.producto_id, curr);
      }

      // Crear venta (total se ajusta al final según subtotales reales)
      const venta = await tx.venta.create({
        data: {
          usuario_id: usuarioId,
          total: 0,
          estado: "completada",
        },
      });

      const inicioHoy = limiteHoy();
      // QC5: el total acumulado corre en Decimal (nunca float).
      let total = new Prisma.Decimal(0);

      // EF5 (reporte 26/09): los splits NO emiten lote.update +
      // detalleVenta.create por iteración (2N round-trips a la DB). Se acumula
      // en memoria y al final de TODOS los productos se aplica todo en 2
      // queries: UN update batch de lotes + UN createMany de detalles.
      const loteUpdates: Array<{ loteId: string; take: number }> = [];
      const detallesData: Array<{
        venta_id: string;
        producto_id: string;
        lote_id: string;
        cantidad: number;
        precio_unitario: number;
        subtotal: number;
      }> = [];

      // (1) lazy pass de vencidos dentro de la transacción
      await retirarLotesVencidos(tx);

      // (2) Bloquear TODOS los lotes de la venta en UNA consulta, con ORDER BY
      // determinístico (producto_id, id). Forzar el lock en orden consistente
      // evita deadlocks entre ventas concurrentes que procesen los mismos
      // productos en distinto orden (T1: P1→P2 / T2: P2→P1).
      // SELECT ... FOR UPDATE: retiene el lock de las filas hasta el COMMIT.
      // Sin esto, dos ventas concurrentes leen el mismo stock (READ COMMITTED),
      // ambas pasan la validación y la segunda descuenta stock ya consumido
      // (race condition TOCTOU). FOR UPDATE serializa el acceso al lote.
      const productoIdsVenta = Array.from(agrupadas.keys());
      const loteSelect = Prisma.sql`
        SELECT id, producto_id, numero_lote, cantidad_disponible,
               fecha_compra, fecha_vencimiento, precio_compra, estado, created_at
        FROM "Lote"
        WHERE producto_id IN (${Prisma.join(
          productoIdsVenta.map((id) => Prisma.sql`${id}::uuid`),
        )})
          AND estado = 'activo'
          AND (fecha_vencimiento IS NULL OR fecha_vencimiento >= ${inicioHoy}::timestamptz)
        ORDER BY producto_id, id
        FOR UPDATE
      `;
      const lotesBloqueados =
        await tx.$queryRaw<
          Array<{
            id: string;
            producto_id: string;
            numero_lote: string | null;
            cantidad_disponible: unknown;
            fecha_compra: Date | null;
            fecha_vencimiento: Date | null;
            precio_compra: unknown;
            estado: string;
            created_at: Date;
          }>
        >(loteSelect);

      // Agrupar lotes bloqueados por producto para el procesamiento FEFO por línea
      const lotesPorProducto = new Map<
        string,
        Array<{
          id: string;
          producto_id: string;
          numero_lote: string | null;
          cantidad_disponible: unknown;
          fecha_compra: Date | null;
          fecha_vencimiento: Date | null;
          precio_compra: unknown;
          estado: string;
          created_at: Date;
        }>
      >();
      for (const l of lotesBloqueados) {
        const arr = lotesPorProducto.get(l.producto_id) ?? [];
        arr.push(l);
        lotesPorProducto.set(l.producto_id, arr);
      }

      for (const [productoId, linea] of agrupadas) {
        // NULLs al final del orden FEFO (manejo en memoria)
        const lotesRaw = lotesPorProducto.get(productoId) ?? [];
        const lotes = [
          ...lotesRaw.filter((l) => l.fecha_vencimiento !== null),
          ...lotesRaw.filter((l) => l.fecha_vencimiento === null),
        ];

        // (3) validar stock suficiente
        const disponible = lotes.reduce(
          (sum, l) => sum + toNumber(l.cantidad_disponible),
          0,
        );
        if (disponible < linea.cantidad) {
          throw new StockInsuficienteError(
            disponible,
            linea.cantidad,
            productoId,
          );
        }

        // (4) descontar en cascada — EF5: el split solo acumula en memoria;
        // el write real (update batch + createMany) se ejecuta al final.
        let resto = linea.cantidad;
        for (const lote of lotes) {
          if (resto <= 0) break;
          const disponibleLote = toNumber(lote.cantidad_disponible);
          if (disponibleLote <= 0) continue; // saltar agotados

          const take = Math.min(disponibleLote, resto);

          // Cada lote se descuenta UNA sola vez (FEFO: un split por lote y
          // break al agotar la línea), así que loteUpdates no repite ids.
          loteUpdates.push({ loteId: lote.id, take });

          // (5) UN DetalleVenta por lote — precio SIEMPRE del catálogo (SE2).
          // QC5: cantidad × precio en Decimal (.times) y redondeo a 2 decimales
          // en Decimal (.toDecimalPlaces(2), equivale al round2 previo); el
          // subtotal se persiste como Decimal y el wire lo entrega como number.
          const precioUnitario =
            precioPorProducto.get(productoId) ?? new Prisma.Decimal(0);
          const subtotal = precioUnitario.times(take).toDecimalPlaces(2);
          detallesData.push({
            venta_id: venta.id,
            producto_id: productoId,
            lote_id: lote.id,
            cantidad: take,
            precio_unitario: precioUnitario.toNumber(),
            subtotal: subtotal.toNumber(),
          });
          total = total.plus(subtotal);
          resto -= take;
        }
      }

      // (6) EF5: aplicar los descuentos de stock de TODOS los splits en UN
      // update (antes: N tx.lote.update dentro del loop — 1 round-trip por
      // lote). No se puede usar un solo updateMany de Prisma con decrement:
      // el monto descontado difiere por lote y el decrement es único por
      // llamada (destino con un solo where para todos). Los lotes ya están
      // lockeados con FOR UPDATE arriba (orden determinístico), así que el
      // update batch no introduce carreras ni deadlocks nuevos. 'agotado' se
      // setea SOLO cuando la cantidad queda en exactamente 0 (misma condición
      // que el update por fila original).
      if (loteUpdates.length > 0) {
        const loteUpdateValues = loteUpdates.map(
          (u) => Prisma.sql`(${u.loteId}::uuid, ${u.take}::numeric)`,
        );
        await tx.$executeRaw(Prisma.sql`
          WITH updates(lote_id, take) AS (
            VALUES ${Prisma.join(loteUpdateValues, ", ")}
          )
          UPDATE "Lote" l SET
            cantidad_disponible = l.cantidad_disponible - u.take,
            estado = CASE
              WHEN l.cantidad_disponible - u.take = 0 THEN 'agotado'::"EstadoLote"
              ELSE l.estado
            END
          FROM updates u
          WHERE l.id = u.lote_id
        `);
      }

      // (7) EF5: UN createMany con todos los detalles (antes: N
      // tx.detalleVenta.create — 1 round-trip por split). createMany es
      // viable en este modelo: DetalleVenta NO tiene created_at y su único
      // @default es el id con dbgenerated (lo genera Postgres, no se incluye
      // en data); las FKs (venta_id, producto_id, lote_id) se pasan como
      // escalares — no hay nested relations.
      if (detallesData.length > 0) {
        await tx.detalleVenta.createMany({ data: detallesData });
      }

      // Fijar el total = Σ subtotales (invariante)
      await tx.venta.update({ where: { id: venta.id }, data: { total } });

      // Fetch complete venta with relations
      const ventaCompleta = await tx.venta.findUnique({
        where: { id: venta.id },
        include: {
          usuario: {
            select: { id: true, nombre_usuario: true, nik_usuario: true },
          },
          detalles_venta: {
            include: {
              producto: {
                select: { id: true, nombre: true, codigo: true },
              },
            },
          },
        },
      });

      return { venta: ventaCompleta };
    });

    if (!result.venta) {
      return err(databaseError("Error al crear venta"));
    }

    const response: VentaWithDetalles = {
      ...result.venta,
      total: toNumber(result.venta.total),
      detalles_venta: result.venta.detalles_venta.map((d) => ({
        ...d,
        cantidad: toNumber(d.cantidad),
        precio_unitario: toNumber(d.precio_unitario),
        subtotal: toNumber(d.subtotal),
      })),
    };

    logger.info(
      { ventaId: response.id, total: response.total, usuarioId },
      "Venta creada exitosamente",
    );
    return ok(response);
  } catch (error) {
    if (error instanceof StockInsuficienteError) {
      return err({
        code: "STOCK_INSUFFICIENT",
        message: `Stock insuficiente para producto ${error.productoId}: disponible ${error.disponible}, solicitado ${error.solicitado}`,
        disponible: error.disponible,
        solicitado: error.solicitado,
      });
    }
    logger.error({ error, input, usuarioId }, "Error al crear venta");
    return err(databaseError("Error al crear venta", error as Error));
  }
}

// Get sale by ID
export async function getVentaById(
  id: string,
): Promise<AppResult<VentaWithDetalles>> {
  try {
    const venta = await prisma.venta.findUnique({
      where: { id },
      include: {
        usuario: {
          select: { id: true, nombre_usuario: true, nik_usuario: true },
        },
        detalles_venta: {
          include: {
            producto: {
              select: { id: true, nombre: true, codigo: true },
            },
          },
        },
      },
    });

    if (!venta) {
      return err(notFoundError("Venta", id));
    }

    const response: VentaWithDetalles = {
      ...venta,
      total: toNumber(venta.total),
      detalles_venta: venta.detalles_venta.map((d) => ({
        ...d,
        cantidad: toNumber(d.cantidad),
        precio_unitario: toNumber(d.precio_unitario),
        subtotal: toNumber(d.subtotal),
      })),
    };

    return ok(response);
  } catch (error) {
    logger.error({ error, id }, "Error al obtener venta");
    return err(databaseError("Error al obtener venta", error as Error));
  }
}

// List sales with pagination and filters
export async function listVentas(query: VentaQueryInput): Promise<
  AppResult<{
    data: VentaListItem[];
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
      usuario_id,
      estado,
      fecha_desde,
      fecha_hasta,
      sort,
      order,
      page,
      limit,
      cierre_caja_id,
      cursor,
    } = query;

    // EF3 (reporte 26/09): keyset pagination como modo ADICIONAL al offset.
    // Si viene `cursor`, se pagina por (created_at, id) en vez de skip/take;
    // si no, el comportamiento offset histórico queda intacto (el client actual
    // usa page/limit y no se toca). El cursor es opaco (base64url) y debe venir
    // con sort=created_at: en cualquier otro sort el rango keyset no coincidiría
    // con el ORDER BY, así que se rechaza en vez de devolver datos incorrectos.
    const keyset = cursor ? decodeCursor(cursor) : null;
    if (cursor && !keyset) {
      return err(validationError("Cursor inválido"));
    }
    if (keyset) {
      if (keyset.createdAt === null) {
        // created_at es NOT NULL en Venta: un cursor con fecha null no puede
        // provenir de una página real de este listado.
        return err(validationError("Cursor inválido"));
      }
      if (sort !== "created_at") {
        return err(
          validationError("El cursor solo es compatible con sort=created_at"),
        );
      }
    }

    let skip: number | undefined = (page - 1) * limit;

    // Build where clause
    const where: Prisma.VentaWhereInput = {};

    if (usuario_id) {
      where.usuario_id = usuario_id;
    }

    if (estado) {
      where.estado = estado;
    }

    if (fecha_desde || fecha_hasta) {
      where.created_at = {};
      if (fecha_desde) {
        (where.created_at as Prisma.DateTimeFilter).gte =
          startOfDay(fecha_desde);
      }
      if (fecha_hasta) {
        (where.created_at as Prisma.DateTimeFilter).lte = endOfDay(fecha_hasta);
      }
    }

    // Filter by cash period: null by default (active period), or explicit cierre_caja_id
    if (cierre_caja_id === undefined) {
      where.cierre_caja_id = null;
    } else {
      where.cierre_caja_id = cierre_caja_id;
    }

    let orderBy:
      | Prisma.VentaOrderByWithRelationInput
      | Prisma.VentaOrderByWithRelationInput[] = { [sort]: order };
    let take = limit;
    if (keyset) {
      // Condición keyset: siguiente página = filas ESTRICTAMENTE posteriores al
      // cursor en (created_at, id) según la dirección. Se combina con los
      // filtros por AND (top-level keys de `where`): el cursor NUNCA saltea un
      // filtro existente (usuario, estado, fechas, cierre_caja_id).
      where.OR =
        order === "desc"
          ? [
              { created_at: { lt: keyset.createdAt } },
              { created_at: keyset.createdAt, id: { lt: keyset.id } },
            ]
          : [
              { created_at: { gt: keyset.createdAt } },
              { created_at: keyset.createdAt, id: { gt: keyset.id } },
            ];
      orderBy = [{ created_at: order }, { id: order }];
      skip = undefined;
      take = limit + 1; // +1 solo para detectar has_more (se recorta después)
    }

    const [ventas, total] = await Promise.all([
      prisma.venta.findMany({
        where,
        include: {
          usuario: {
            select: { nombre_usuario: true },
          },
          _count: {
            select: { detalles_venta: true },
          },
        },
        orderBy,
        skip,
        take,
      }),
      prisma.venta.count({ where }),
    ]);

    // EF3: en modo cursor, take = limit+1; la página real son las primeras
    // `limit` filas y el next_cursor se arma desde la ÚLTIMA fila de la página.
    const hasMore = keyset !== null && ventas.length > limit;
    const pageVentas = hasMore ? ventas.slice(0, limit) : ventas;

    const data: VentaListItem[] = pageVentas.map((v) => ({
      id: v.id,
      usuario_id: v.usuario_id,
      usuario_nombre: v.usuario.nombre_usuario,
      total: toNumber(v.total),
      estado: v.estado,
      cantidad_items: v._count.detalles_venta,
      created_at: v.created_at,
    }));

    const totalPages = Math.ceil(total / limit);
    const last = pageVentas[pageVentas.length - 1];
    const next_cursor =
      keyset !== null && hasMore && last
        ? encodeCursor(last.created_at, last.id)
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
    logger.error({ error, query }, "Error al listar ventas");
    return err(databaseError("Error al listar ventas", error as Error));
  }
}

// Get daily sales summary — scoped to the active cash period, not calendar day
export async function getResumenDia(): Promise<AppResult<ResumenDia>> {
  try {
    // EF2 (reporte 26/09): la agregación baja a SQL (COUNT/SUM + GROUP BY) en
    // vez de materializar todas las ventas abiertas con detalle_venta + producto
    // y agregar por Maps en el proceso. Se leen solo agregados sobre el mismo
    // set filtrado (completada + no archivada en un cierre). Cada venta
    // pertenece a un único usuario, así que COUNT/SUM por usuario particionan
    // exactamente el total global del período.
    const [ventasPorUsuario, productosVendidos, movimientos] =
      await Promise.all([
        prisma.$queryRaw<
          Array<{
            usuario_id: string;
            nombre: string;
            cantidad_ventas: number;
            monto_total: unknown;
          }>
        >`
          SELECT v.usuario_id,
                 u.nombre_usuario AS nombre,
                 CAST(COUNT(*) AS INTEGER) AS cantidad_ventas,
                 SUM(v.total) AS monto_total
          FROM "Venta" v
          JOIN "Usuario" u ON u.id = v.usuario_id
          WHERE v.estado = 'completada' AND v.cierre_caja_id IS NULL
          GROUP BY v.usuario_id, u.nombre_usuario
          ORDER BY MAX(v.created_at) DESC, v.usuario_id
        `,
        prisma.$queryRaw<
          Array<{
            producto_id: string;
            nombre: string;
            cantidad_total: unknown;
            monto_total: unknown;
          }>
        >`
          SELECT d.producto_id,
                 p.nombre AS nombre,
                 SUM(d.cantidad) AS cantidad_total,
                 SUM(d.subtotal) AS monto_total
          FROM "DetalleVenta" d
          JOIN "Venta" v ON v.id = d.venta_id
          JOIN "Producto" p ON p.id = d.producto_id
          WHERE v.estado = 'completada' AND v.cierre_caja_id IS NULL
          GROUP BY d.producto_id, p.nombre
          ORDER BY MAX(v.created_at) DESC, d.producto_id
        `,
        prisma.$queryRaw<Array<{ tipo: string; monto_total: unknown }>>`
          SELECT tipo, SUM(monto) AS monto_total
          FROM "MovimientoCaja"
          WHERE cierre_caja_id IS NULL
          GROUP BY tipo
        `,
      ]);

    const total_ventas = ventasPorUsuario.reduce(
      (sum, u) => sum + u.cantidad_ventas,
      0,
    );
    // QC5: los agregados del período se suman en Decimal (los resultados de
    // $queryRaw llegan como string/number/Decimal); la conversión a number
    // ocurre UNA vez en el mapeo final (abajo).
    const monto_ventas = ventasPorUsuario.reduce(
      (sum, u) => sum.plus(toDecimal(u.monto_total)),
      new Prisma.Decimal(0),
    );

    const ingresoRow = movimientos.find((m) => m.tipo === "ingreso");
    const egresoRow = movimientos.find((m) => m.tipo === "egreso");
    const ingresos = ingresoRow
      ? toDecimal(ingresoRow.monto_total)
      : new Prisma.Decimal(0);
    const egresos = egresoRow
      ? toDecimal(egresoRow.monto_total)
      : new Prisma.Decimal(0);

    // Total de caja = ventas + ingresos - egresos (calculado en Decimal, no float)
    const monto_total = monto_ventas.plus(ingresos).minus(egresos);

    // CO4: no existe flujo que cree un CierreCaja con estado 'abierto' — el único
    // insert (cerrarCaja) crea con estado 'cerrado'. El período abierto real se
    // modela con cierre_caja_id IS NULL y no registra fecha_apertura, así que la
    // fecha del resumen queda siempre vacía.
    const fecha = "";

    const response: ResumenDia = {
      fecha,
      total_ventas,
      // QC5 (borde): Decimal → number, una sola vez, al armar la respuesta.
      monto_total: toNumber(monto_total),
      ingresos_total: toNumber(ingresos),
      egresos_total: toNumber(egresos),
      productos_vendidos: productosVendidos.map((p) => ({
        producto_id: p.producto_id,
        nombre: p.nombre,
        cantidad_total: toNumber(p.cantidad_total),
        monto_total: toNumber(p.monto_total),
      })),
      ventas_por_usuario: ventasPorUsuario.map((u) => ({
        usuario_id: u.usuario_id,
        nombre: u.nombre,
        cantidad_ventas: u.cantidad_ventas,
        monto_total: toNumber(u.monto_total),
      })),
    };

    return ok(response);
  } catch (error) {
    logger.error({ error }, "Error al obtener resumen del día");
    return err(
      databaseError("Error al obtener resumen del día", error as Error),
    );
  }
}

// Get last sale date and quantity per product
export async function getUltimasVentasPorProducto(): Promise<
  AppResult<
    Array<{
      producto_id: string;
      ultima_venta_at: string | null;
      ultima_cantidad: number | null;
    }>
  >
> {
  try {
    const detalles = await prisma.$queryRaw<
      Array<{
        producto_id: string;
        ultima_venta_at: Date | null;
        ultima_cantidad: number | null;
      }>
    >`
      SELECT DISTINCT ON (dv.producto_id)
        dv.producto_id,
        v.created_at AS ultima_venta_at,
        dv.cantidad AS ultima_cantidad
      FROM "DetalleVenta" dv
      JOIN "Venta" v ON v.id = dv.venta_id
      WHERE v.estado = 'completada'
      ORDER BY dv.producto_id, v.created_at DESC
    `;

    const result = detalles.map((d) => ({
      producto_id: d.producto_id,
      ultima_venta_at: d.ultima_venta_at
        ? d.ultima_venta_at.toISOString()
        : null,
      ultima_cantidad: d.ultima_cantidad ? toNumber(d.ultima_cantidad) : null,
    }));

    return ok(result);
  } catch (error) {
    logger.error({ error }, "Error al obtener últimas ventas por producto");
    return err(
      databaseError(
        "Error al obtener últimas ventas por producto",
        error as Error,
      ),
    );
  }
}

// Delete a completed sale, restoring stock POR LOTE
export async function deleteVenta(
  id: string,
): Promise<AppResult<{ id: string }>> {
  try {
    const venta = await prisma.venta.findUnique({
      where: { id },
      include: { detalles_venta: true },
    });

    if (!venta) {
      return err(notFoundError("Venta", id));
    }

    // Block deletion of archived sales (those linked to a closed cash period)
    if (venta.cierre_caja_id !== null) {
      return err({
        code: "CONFLICT" as const,
        message:
          "Esta venta pertenece a un período cerrado. No se puede eliminar.",
      });
    }

    if (venta.estado !== "completada") {
      return err({
        code: "CONFLICT",
        message: "Solo se pueden eliminar ventas completadas",
      });
    }

    // Rechazar ventas pre-migración (sin trazabilidad por lote)
    if (venta.detalles_venta.some((d) => d.lote_id === null)) {
      return err(
        validationError("Venta pre-migración: no se puede revertir por lote"),
      );
    }

    const hoyStr = toUTC3DateString(new Date());

    await prisma.$transaction(async (tx) => {
      // Re-validación dentro de la transacción (anti-TOCTOU con cerrarCaja): un
      // cierre concurrente pudo archivar esta venta entre la validación externa y
      // este punto. FOR UPDATE retiene el lock de la fila hasta el COMMIT (o hasta
      // que el cierre commitee su updateMany), y si la venta quedó archivada la
      // eliminación se aborta con CONFLICT en vez de borrar una venta ya contada.
      const ventaRows = await tx.$queryRaw<
        Array<{ id: string; cierre_caja_id: string | null; estado: string }>
      >`
        SELECT id, cierre_caja_id, estado
        FROM "Venta"
        WHERE id = ${id}::uuid
        FOR UPDATE
      `;

      if (
        ventaRows.length === 0 ||
        ventaRows[0]!.cierre_caja_id !== null ||
        ventaRows[0]!.estado !== "completada"
      ) {
        throw new VentaDeleteConflictError(
          "Esta venta pertenece a un período cerrado. No se puede eliminar.",
        );
      }

      // CO2 (reporte 26/09): lockear con FOR UPDATE los lote_id afectados al
      // inicio de la restauración, en el MISMO orden determinístico que
      // createVenta (ORDER BY producto_id, id). El chequeo de reactivación
      // (agotado→activo) lee cantidad_disponible bajo lock: un createVenta
      // concurrente no puede descontar el lote entre nuestro INCREMENT y el
      // findUnique, y ambos toman los locks de lote en el mismo orden
      // (se evitan deadlocks nuevos entre deleteVenta y createVenta).
      const loteIds = [
        ...new Set(
          venta.detalles_venta
            .map((d) => d.lote_id)
            .filter((x): x is string => x != null),
        ),
      ];

      if (loteIds.length > 0) {
        await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id
          FROM "Lote"
          WHERE id IN (${Prisma.join(
            loteIds.map((id) => Prisma.sql`${id}::uuid`),
          )})
          ORDER BY producto_id, id
          FOR UPDATE
        `;
      }

      // Restore stock for each detail by lote
      for (const detalle of venta.detalles_venta) {
        if (!detalle.lote_id) continue; // ya validado que no es null
        await tx.lote.update({
          where: { id: detalle.lote_id },
          data: {
            cantidad_disponible: {
              increment: toNumber(detalle.cantidad),
            },
          },
        });
      }

      // Si el lote estaba en 'agotado' y ahora tiene cantidad > 0 → reactivar
      // (a 'activo', o 'vencido' si su fecha de vencimiento ya pasó)
      for (const loteId of loteIds) {
        const lote = await tx.lote.findUnique({ where: { id: loteId } });
        if (!lote) continue;
        const qty = toNumber(lote.cantidad_disponible);
        if (qty > 0 && lote.estado === "agotado") {
          const vencido = lote.fecha_vencimiento
            ? new Date(lote.fecha_vencimiento).toISOString().slice(0, 10) <
              hoyStr
            : false;
          await tx.lote.update({
            where: { id: loteId },
            data: { estado: vencido ? "vencido" : "activo" },
          });
        }
      }

      await tx.detalleVenta.deleteMany({ where: { venta_id: id } });
      await tx.venta.delete({ where: { id } });
    });

    return ok({ id });
  } catch (error) {
    if (error instanceof VentaDeleteConflictError) {
      return err({ code: error.code, message: error.message });
    }
    logger.error({ error, id }, "Error al eliminar venta");
    return err(databaseError("Error al eliminar venta", error as Error));
  }
}

// Close cash period: archive all open completed sales into a CierreCaja
// Blindaje: pg_advisory_xact_lock serializa el cierre global; la lectura de
// ventas/movimientos abiertos se hace DENTRO de la transacción (tras el lock)
// para evitar que dos cierres concurrentes lean el mismo set y lo archiven dos
// veces (doble CierreCaja, doble archivo).
export async function cerrarCaja(
  usuarioCierreId: string,
  password: string,
): Promise<
  AppResult<{
    id: string;
    monto_total: number;
    cantidad_ventas: number;
    fecha_cierre: string;
  }>
> {
  try {
    // Validate password against user's hash (outside tx, no lock needed)
    const usuario = await prisma.usuario.findUnique({
      where: { id: usuarioCierreId },
      select: { password_hash: true },
    });

    if (!usuario) {
      return err({
        code: "UNAUTHORIZED",
        message: "Usuario no encontrado",
      });
    }

    const passwordValid = await verifyPassword(password, usuario.password_hash);
    if (!passwordValid) {
      return err({
        code: "UNAUTHORIZED",
        message: "Contraseña incorrecta",
      });
    }

    const cierre = await prisma.$transaction(async (tx) => {
      // Advisory lock: serializa el cierre de caja global (un solo cierre a la vez).
      // $executeRaw: pg_advisory_xact_lock no devuelve filas; $queryRaw fallaría
      // deserializando el tipo void contra la DB real.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_CIERRE_CAJA})`;

      // Foto estable: las ventas abiertas se bloquean con FOR UPDATE hasta el
      // COMMIT. Con esto el updateMany final archiva exactamente lo leído: un
      // deleteVenta concurrente espera el lock de la fila y, al despertar, su
      // re-validación interna ve cierre_caja_id ya asignado y aborta; nunca se
      // cuenta en el cierre una venta que después se elimina.
      const ventasRows = await tx.$queryRaw<
        Array<{
          id: string;
          usuario_id: string;
          total: unknown;
          created_at: Date;
        }>
      >`
        SELECT id, usuario_id, total, created_at
        FROM "Venta"
        WHERE estado = 'completada' AND cierre_caja_id IS NULL
        ORDER BY created_at ASC
        FOR UPDATE
      `;

      if (ventasRows.length === 0) {
        throw new Error("NO_OPEN_SALES");
      }

      const primeraVenta = ventasRows[0]!;
      const fechaApertura = primeraVenta.created_at;
      const usuarioAperturaId = primeraVenta.usuario_id;
      const fechaCierre = new Date();

      // Datos asociados: las filas de negocio ya están lockeadas (foto estable),
      // las lecturas de apoyo no necesitan lock.
      const ventaIds = ventasRows.map((v) => v.id);
      const idsVenta = Prisma.join(
        ventaIds.map((id) => Prisma.sql`${id}::uuid`),
      );

      // EF2 (reporte 26/09): los agregados del cierre (vendedor × producto) se
      // resuelven en SQL (COUNT/SUM + GROUP BY) sobre la foto lockeada, en vez
      // de materializar detalle_venta + producto y agregar por Maps en el
      // proceso. El set filtrado es idéntico al anterior: detalles de las
      // ventas lockeadas (vía venta_id) con nombre actual de producto.
      const agregadosVendedor = await tx.$queryRaw<
        Array<{
          usuario_id: string;
          nombre: string;
          cantidad_ventas: number;
          monto_total: unknown;
        }>
      >`
        SELECT v.usuario_id,
               COALESCE(u.nombre_usuario, '') AS nombre,
               CAST(COUNT(*) AS INTEGER) AS cantidad_ventas,
               SUM(v.total) AS monto_total
        FROM "Venta" v
        LEFT JOIN "Usuario" u ON u.id = v.usuario_id
        WHERE v.id IN (${idsVenta})
        GROUP BY v.usuario_id, u.nombre_usuario
        ORDER BY MAX(v.created_at) ASC, v.usuario_id
      `;
      const agregadosProducto = await tx.$queryRaw<
        Array<{
          producto_id: string;
          nombre: string;
          cantidad_total: unknown;
          monto_total: unknown;
        }>
      >`
        SELECT d.producto_id,
               p.nombre AS nombre,
               SUM(d.cantidad) AS cantidad_total,
               SUM(d.subtotal) AS monto_total
        FROM "DetalleVenta" d
        JOIN "Producto" p ON p.id = d.producto_id
        WHERE d.venta_id IN (${idsVenta})
        GROUP BY d.producto_id, p.nombre
        ORDER BY MIN(d.id)
      `;

      // Movimientos del período activo. Se archivan por id IN (solo los CONTADOS en
      // el monto): un movimiento insertado a mitad del cierre queda en el período
      // nuevo en vez de archivarse en un cierre que no lo incluyó en el total.
      const movimientosActivos = await tx.movimientoCaja.findMany({
        where: { cierre_caja_id: null },
        select: { id: true, tipo: true, monto: true },
      });

      // QC5: suma en Decimal (los montos de $queryRaw/findMany llegan como
      // string/Decimal), conversión a number solo en el borde de respuesta.
      const montoVentas = ventasRows.reduce(
        (sum, v) => sum.plus(toDecimal(v.total)),
        new Prisma.Decimal(0),
      );
      const ingresos = movimientosActivos
        .filter((m) => m.tipo === "ingreso")
        .reduce(
          (sum, m) => sum.plus(toDecimal(m.monto)),
          new Prisma.Decimal(0),
        );
      const egresos = movimientosActivos
        .filter((m) => m.tipo === "egreso")
        .reduce(
          (sum, m) => sum.plus(toDecimal(m.monto)),
          new Prisma.Decimal(0),
        );

      // Total de caja = ventas + ingresos - egresos (Decimal, sin float)
      const montoTotal = montoVentas.plus(ingresos).minus(egresos);

      const detallesVendedor = agregadosVendedor.map((u) => ({
        tipo: "vendedor",
        referencia_id: u.usuario_id,
        nombre: u.nombre,
        cantidad: u.cantidad_ventas,
        monto_total: toNumber(u.monto_total),
      }));

      const detallesProducto = agregadosProducto.map((p) => ({
        tipo: "producto",
        referencia_id: p.producto_id,
        nombre: p.nombre,
        cantidad: toNumber(p.cantidad_total),
        monto_total: toNumber(p.monto_total),
      }));

      const nuevoCierre = await tx.cierreCaja.create({
        data: {
          fecha_apertura: fechaApertura,
          fecha_cierre: fechaCierre,
          usuario_apertura_id: usuarioAperturaId,
          usuario_cierre_id: usuarioCierreId,
          monto_total: montoTotal,
          ingresos_total: ingresos,
          egresos_total: egresos,
          cantidad_ventas: ventasRows.length,
          estado: "cerrado",
          detalles: {
            create: [...detallesVendedor, ...detallesProducto],
          },
        },
      });

      await tx.venta.updateMany({
        where: {
          id: { in: ventaIds },
        },
        data: {
          cierre_caja_id: nuevoCierre.id,
        },
      });

      // Archivar los movimientos del periodo activo al cerrar la caja (por id: solo
      // los leídos y contados en el monto, nunca un insert concurrente posterior).
      await tx.movimientoCaja.updateMany({
        where: { id: { in: movimientosActivos.map((m) => m.id) } },
        data: { cierre_caja_id: nuevoCierre.id },
      });

      return nuevoCierre;
    });

    logger.info(
      {
        cierreId: cierre.id,
        cantidadVentas: (await prisma.venta.count({
          where: { cierre_caja_id: cierre.id },
        })) as number,
        montoTotal: toNumber(cierre.monto_total),
      },
      "Caja cerrada exitosamente",
    );

    return ok({
      id: cierre.id,
      monto_total: toNumber(cierre.monto_total),
      cantidad_ventas: cierre.cantidad_ventas,
      fecha_cierre: (cierre.fecha_cierre ?? new Date()).toISOString(),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "NO_OPEN_SALES") {
      return err({
        code: "CONFLICT",
        message: "No hay ventas completadas para cerrar",
      });
    }
    logger.error({ error, usuarioCierreId }, "Error al cerrar caja");
    return err(databaseError("Error al cerrar caja", error as Error));
  }
}

// Get total quantity and amount sold per product (all-time, completed sales only)
export async function getMasVendidosPorProducto(): Promise<
  AppResult<ProductoMasVendido[]>
> {
  try {
    const detalles = await prisma.$queryRaw<
      Array<{
        producto_id: string;
        veces_vendido: bigint | number;
        monto_total: bigint | number;
      }>
    >`
      SELECT
        dv.producto_id,
        CAST(COUNT(DISTINCT dv.venta_id) AS INTEGER) AS veces_vendido,
        SUM(dv.subtotal) AS monto_total
      FROM "DetalleVenta" dv
      JOIN "Venta" v ON v.id = dv.venta_id
      WHERE v.estado = 'completada'
      GROUP BY dv.producto_id
      ORDER BY veces_vendido DESC
    `;

    const result: ProductoMasVendido[] = detalles.map((d) => ({
      producto_id: d.producto_id,
      veces_vendido: toNumber(d.veces_vendido),
      monto_total: toNumber(d.monto_total),
    }));

    return ok(result);
  } catch (error) {
    logger.error({ error }, "Error al obtener productos más vendidos");
    return err(
      databaseError("Error al obtener productos más vendidos", error as Error),
    );
  }
}
