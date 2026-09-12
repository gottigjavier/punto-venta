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
import { retirarLotesVencidos, toUTC3DateString } from "./stock.use-case.js";
import { ADVISORY_LOCK_CIERRE_CAJA } from "../../infrastructure/database/transactions.js";
import { toNumber, round2 } from "../../shared/utils/number.js";

// Helper to build start/end of day
function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

// Medianoche de hoy en UTC (UTC-3) para filtrar lotes NO vencidos
function limiteHoy(): Date {
  const hoyStr = toUTC3DateString(new Date());
  return new Date(`${hoyStr}T00:00:00.000Z`);
}

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
    // 1. Verify all products exist
    const productIds = input.productos.map((p) => p.producto_id);
    const productos = await prisma.producto.findMany({
      where: { id: { in: productIds } },
      select: { id: true },
    });

    if (productos.length !== productIds.length) {
      const foundIds = new Set(productos.map((p) => p.id));
      const missingId = productIds.find((id) => !foundIds.has(id));
      return err(notFoundError("Producto", missingId));
    }

    // 2. Execute atomic transaction
    const result = await prisma.$transaction(async (tx) => {
      // Agrupar líneas por producto_id (una línea puede venir repetida)
      const agrupadas = new Map<
        string,
        { cantidad: number; precio_unitario: number }
      >();
      for (const item of input.productos) {
        const curr = agrupadas.get(item.producto_id) ?? {
          cantidad: 0,
          precio_unitario: item.precio_unitario,
        };
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
      let total = 0;
      const detallesCreados: Array<{ id: string }> = [];

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

        // (4) descontar en cascada
        let resto = linea.cantidad;
        for (const lote of lotes) {
          if (resto <= 0) break;
          const disponibleLote = toNumber(lote.cantidad_disponible);
          if (disponibleLote <= 0) continue; // saltar agotados

          const take = Math.min(disponibleLote, resto);
          const nuevoDisponible = disponibleLote - take;

          await tx.lote.update({
            where: { id: lote.id },
            data: {
              cantidad_disponible: { decrement: take },
              ...(nuevoDisponible === 0 ? { estado: "agotado" } : {}),
            },
          });

          // (5) UN DetalleVenta por lote
          const subtotal = round2(take * linea.precio_unitario);
          const detalle = await tx.detalleVenta.create({
            data: {
              venta_id: venta.id,
              producto_id: productoId,
              lote_id: lote.id,
              cantidad: take,
              precio_unitario: linea.precio_unitario,
              subtotal,
            },
          });
          detallesCreados.push(detalle);
          total += subtotal;
          resto -= take;
        }
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

      return { venta: ventaCompleta, detalles: detallesCreados };
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
    } = query;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Record<string, unknown> = {};

    if (usuario_id) {
      where.usuario_id = usuario_id;
    }

    if (estado) {
      where.estado = estado;
    }

    if (fecha_desde || fecha_hasta) {
      where.created_at = {};
      if (fecha_desde) {
        (where.created_at as Record<string, unknown>).gte =
          startOfDay(fecha_desde);
      }
      if (fecha_hasta) {
        (where.created_at as Record<string, unknown>).lte =
          endOfDay(fecha_hasta);
      }
    }

    // Filter by cash period: null by default (active period), or explicit cierre_caja_id
    if (cierre_caja_id === undefined) {
      where.cierre_caja_id = null;
    } else {
      where.cierre_caja_id = cierre_caja_id;
    }

    const orderBy: Record<string, string> = { [sort]: order };

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
        take: limit,
      }),
      prisma.venta.count({ where }),
    ]);

    const data: VentaListItem[] = ventas.map((v) => ({
      id: v.id,
      usuario_id: v.usuario_id,
      usuario_nombre: v.usuario.nombre_usuario,
      total: toNumber(v.total),
      estado: v.estado,
      cantidad_items: v._count.detalles_venta,
      created_at: v.created_at,
    }));

    const totalPages = Math.ceil(total / limit);

    return ok({
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error) {
    logger.error({ error, query }, "Error al listar ventas");
    return err(databaseError("Error al listar ventas", error as Error));
  }
}

// Get daily sales summary — scoped to the active cash period, not calendar day
export async function getResumenDia(): Promise<AppResult<ResumenDia>> {
  try {
    // Find the active (open) cash closing — estado 'abierto' means not yet closed
    const cierreActivo = await prisma.cierreCaja.findFirst({
      where: { estado: "abierto" },
      select: { fecha_apertura: true },
    });

    // Get all completed sales not yet archived in a cash closing
    const ventas = await prisma.venta.findMany({
      where: {
        estado: "completada",
        cierre_caja_id: null,
      },
      include: {
        usuario: {
          select: { id: true, nombre_usuario: true },
        },
        detalles_venta: {
          include: {
            producto: {
              select: { id: true, nombre: true },
            },
          },
        },
      },
      orderBy: { created_at: "desc" },
    });

    // Get all cash movements of the active period (not yet archived)
    const movimientos = await prisma.movimientoCaja.findMany({
      where: { cierre_caja_id: null },
      select: { tipo: true, monto: true },
    });

    // Calculate totals
    const total_ventas = ventas.length;
    const monto_ventas = ventas.reduce((sum, v) => sum + toNumber(v.total), 0);

    const ingresos = movimientos
      .filter((m) => m.tipo === "ingreso")
      .reduce((sum, m) => sum + toNumber(m.monto), 0);
    const egresos = movimientos
      .filter((m) => m.tipo === "egreso")
      .reduce((sum, m) => sum + toNumber(m.monto), 0);

    // Total de caja = ventas + ingresos - egresos
    const monto_total = monto_ventas + ingresos - egresos;

    // Aggregate products sold (por producto_id — los detalles split se suman)
    const productoMap = new Map<
      string,
      {
        producto_id: string;
        nombre: string;
        cantidad_total: number;
        monto_total: number;
      }
    >();

    // Aggregate sales by user
    const usuarioMap = new Map<
      string,
      {
        usuario_id: string;
        nombre: string;
        cantidad_ventas: number;
        monto_total: number;
      }
    >();

    for (const venta of ventas) {
      // User aggregation
      const userKey = venta.usuario_id;
      const existingUser = usuarioMap.get(userKey);
      if (existingUser) {
        existingUser.cantidad_ventas += 1;
        existingUser.monto_total += toNumber(venta.total);
      } else {
        usuarioMap.set(userKey, {
          usuario_id: venta.usuario_id,
          nombre: venta.usuario.nombre_usuario,
          cantidad_ventas: 1,
          monto_total: toNumber(venta.total),
        });
      }

      // Product aggregation
      for (const detalle of venta.detalles_venta) {
        const prodKey = detalle.producto_id;
        const existingProd = productoMap.get(prodKey);
        if (existingProd) {
          existingProd.cantidad_total += toNumber(detalle.cantidad);
          existingProd.monto_total += toNumber(detalle.subtotal);
        } else {
          productoMap.set(prodKey, {
            producto_id: detalle.producto_id,
            nombre: detalle.producto.nombre,
            cantidad_total: toNumber(detalle.cantidad),
            monto_total: toNumber(detalle.subtotal),
          });
        }
      }
    }

    // fecha = opening date of active cierre (UTC-3), or empty if no active cierre
    let fecha = "";
    if (cierreActivo?.fecha_apertura) {
      const aperturaLocal = new Date(
        cierreActivo.fecha_apertura.getTime() + 3 * 3600 * 1000,
      );
      fecha = aperturaLocal.toISOString().split("T")[0] ?? "";
    }

    const response: ResumenDia = {
      fecha,
      total_ventas,
      monto_total,
      ingresos_total: ingresos,
      egresos_total: egresos,
      productos_vendidos: Array.from(productoMap.values()),
      ventas_por_usuario: Array.from(usuarioMap.values()),
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
      const loteIds = [
        ...new Set(
          venta.detalles_venta
            .map((d) => d.lote_id)
            .filter((x): x is string => x != null),
        ),
      ];

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
      const detallesRows = await tx.detalleVenta.findMany({
        where: { venta_id: { in: ventaIds } },
        include: {
          producto: { select: { id: true, nombre: true } },
        },
      });
      const usuariosRows = await tx.usuario.findMany({
        where: { id: { in: ventasRows.map((v) => v.usuario_id) } },
        select: { id: true, nombre_usuario: true },
      });
      const usuarioNombre = new Map(
        usuariosRows.map((u) => [u.id, u.nombre_usuario]),
      );
      const detallesPorVenta = new Map<
        string,
        Array<{
          producto_id: string;
          cantidad: unknown;
          subtotal: unknown;
          producto: { id: string; nombre: string };
        }>
      >();
      for (const d of detallesRows) {
        const arr = detallesPorVenta.get(d.venta_id) ?? [];
        arr.push(d);
        detallesPorVenta.set(d.venta_id, arr);
      }

      // Movimientos del período activo. Se archivan por id IN (solo los CONTADOS en
      // el monto): un movimiento insertado a mitad del cierre queda en el período
      // nuevo en vez de archivarse en un cierre que no lo incluyó en el total.
      const movimientosActivos = await tx.movimientoCaja.findMany({
        where: { cierre_caja_id: null },
        select: { id: true, tipo: true, monto: true },
      });

      const montoVentas = ventasRows.reduce(
        (sum, v) => sum + toNumber(v.total),
        0,
      );
      const ingresos = movimientosActivos
        .filter((m) => m.tipo === "ingreso")
        .reduce((sum, m) => sum + toNumber(m.monto), 0);
      const egresos = movimientosActivos
        .filter((m) => m.tipo === "egreso")
        .reduce((sum, m) => sum + toNumber(m.monto), 0);

      // Total de caja = ventas + ingresos - egresos
      const montoTotal = montoVentas + ingresos - egresos;

      // Aggregate by vendor
      const usuarioMap = new Map<
        string,
        {
          usuario_id: string;
          nombre: string;
          cantidad_ventas: number;
          monto_total: number;
        }
      >();

      // Aggregate by product
      const productoMap = new Map<
        string,
        {
          producto_id: string;
          nombre: string;
          cantidad_total: number;
          monto_total: number;
        }
      >();

      for (const venta of ventasRows) {
        const userKey = venta.usuario_id;
        const existingUser = usuarioMap.get(userKey);
        if (existingUser) {
          existingUser.cantidad_ventas += 1;
          existingUser.monto_total += toNumber(venta.total);
        } else {
          usuarioMap.set(userKey, {
            usuario_id: venta.usuario_id,
            nombre: usuarioNombre.get(venta.usuario_id) ?? "",
            cantidad_ventas: 1,
            monto_total: toNumber(venta.total),
          });
        }

        for (const detalle of detallesPorVenta.get(venta.id) ?? []) {
          const prodKey = detalle.producto_id;
          const existingProd = productoMap.get(prodKey);
          if (existingProd) {
            existingProd.cantidad_total += toNumber(detalle.cantidad);
            existingProd.monto_total += toNumber(detalle.subtotal);
          } else {
            productoMap.set(prodKey, {
              producto_id: detalle.producto_id,
              nombre: detalle.producto.nombre,
              cantidad_total: toNumber(detalle.cantidad),
              monto_total: toNumber(detalle.subtotal),
            });
          }
        }
      }

      const detallesVendedor = Array.from(usuarioMap.values()).map((u) => ({
        tipo: "vendedor",
        referencia_id: u.usuario_id,
        nombre: u.nombre,
        cantidad: u.cantidad_ventas,
        monto_total: u.monto_total,
      }));

      const detallesProducto = Array.from(productoMap.values()).map((p) => ({
        tipo: "producto",
        referencia_id: p.producto_id,
        nombre: p.nombre,
        cantidad: p.cantidad_total,
        monto_total: p.monto_total,
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
