// src/application/use-cases/movimiento-caja.use-case.ts
// Movimientos de caja (ingresos/egresos) use cases
import { ok, err } from "neverthrow";
import { Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma/client.js";
import type { AppResult } from "../../shared/types/result.js";
import { databaseError, validationError } from "../../shared/types/result.js";
import type { MovimientoCaja } from "../../domain/entities/venta.js";
import type {
  CrearMovimientoInput,
  MovimientoQueryInput,
} from "../dto/movimiento.dto.js";
import { logger } from "../../infrastructure/logging/logger.js";
import { toNumber } from "../../shared/utils/number.js";
import {
  encodeCursor,
  decodeCursor,
} from "../../shared/utils/cursor.js";

// Helper to convert Prisma Decimal to number

// Create a cash movement (ingreso/egreso) in the active period
export async function crearMovimiento(
  input: Omit<CrearMovimientoInput, "password">,
  usuarioId: string,
): Promise<AppResult<MovimientoCaja>> {
  try {
    const monto = toNumber(input.monto);

    if (monto <= 0) {
      return err(validationError("El monto debe ser mayor a 0"));
    }

    const movimiento = await prisma.movimientoCaja.create({
      data: {
        tipo: input.tipo,
        monto,
        descripcion: input.descripcion ?? null,
        usuario_id: usuarioId,
        cierre_caja_id: null, // periodo activo
      },
      include: {
        usuario: {
          select: { id: true, nombre_usuario: true },
        },
      },
    });

    const response: MovimientoCaja = {
      ...movimiento,
      monto: toNumber(movimiento.monto),
      usuario: movimiento.usuario,
    };

    logger.info(
      {
        movimientoId: response.id,
        tipo: response.tipo,
        monto: response.monto,
        usuarioId,
      },
      "Movimiento de caja creado exitosamente",
    );

    return ok(response);
  } catch (error) {
    logger.error(
      { error, input, usuarioId },
      "Error al crear movimiento de caja",
    );
    return err(
      databaseError("Error al crear movimiento de caja", error as Error),
    );
  }
}

// List movements of the active period with pagination
export async function listarMovimientos(query: MovimientoQueryInput): Promise<
  AppResult<{
    data: MovimientoCaja[];
    resumen: {
      ingresos: number;
      egresos: number;
      total: number;
    };
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
    const { sort, order, page, limit, cursor } = query;

    // EF3 (reporte 26/09): keyset pagination como modo ADICIONAL al offset.
    // Cursor opaco (base64url) sobre (created_at, id) — la columna de orden
    // real del listado (created_at NOT NULL) y su índice (@@index([created_at])).
    // Requiere sort=created_at: con sort=monto el rango keyset no coincidiría
    // con el ORDER BY, así que se rechaza en vez de devolver datos incorrectos.
    const keyset = cursor ? decodeCursor(cursor) : null;
    if (cursor && !keyset) {
      return err(validationError("Cursor inválido"));
    }
    if (keyset) {
      if (keyset.createdAt === null) {
        // created_at es NOT NULL en MovimientoCaja: un cursor con fecha null no
        // puede provenir de una página real de este listado.
        return err(validationError("Cursor inválido"));
      }
      if (sort !== "created_at") {
        return err(
          validationError("El cursor solo es compatible con sort=created_at"),
        );
      }
    }
    let skip: number | undefined = (page - 1) * limit;

    // Only active period (cierre_caja_id = null)
    const where: Prisma.MovimientoCajaWhereInput = {
      cierre_caja_id: null,
    };

    let orderBy:
      | Prisma.MovimientoCajaOrderByWithRelationInput
      | Prisma.MovimientoCajaOrderByWithRelationInput[] = { [sort]: order };
    let take = limit;
    if (keyset) {
      // Condición keyset: siguiente página = filas ESTRICTAMENTE posteriores al
      // cursor en (created_at, id) según la dirección. Se combina con el filtro
      // de período activo por AND (nunca lo saltea).
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

    const [movimientos, total] = await Promise.all([
      prisma.movimientoCaja.findMany({
        where,
        include: {
          usuario: {
            select: { id: true, nombre_usuario: true },
          },
        },
        orderBy,
        skip,
        take,
      }),
      prisma.movimientoCaja.count({ where }),
    ]);

    // Fetch all active movements (unpaginated) to compute complete resumen
    const todosActivos = await prisma.movimientoCaja.findMany({
      where: { cierre_caja_id: null },
      select: { tipo: true, monto: true },
    });

    const ingresos = todosActivos
      .filter((m) => m.tipo === "ingreso")
      .reduce((sum, m) => sum + toNumber(m.monto), 0);
    const egresos = todosActivos
      .filter((m) => m.tipo === "egreso")
      .reduce((sum, m) => sum + toNumber(m.monto), 0);

    // EF3: en modo cursor, take = limit+1; la página real son las primeras
    // `limit` filas y el next_cursor se arma desde la ÚLTIMA fila de la página.
    const hasMore = keyset !== null && movimientos.length > limit;
    const pageMovimientos = hasMore ? movimientos.slice(0, limit) : movimientos;

    const data: MovimientoCaja[] = pageMovimientos.map((m) => ({
      ...m,
      monto: toNumber(m.monto),
      usuario: m.usuario,
    }));

    const totalPages = Math.ceil(total / limit);
    const last = pageMovimientos[pageMovimientos.length - 1];
    const next_cursor =
      keyset !== null && hasMore && last
        ? encodeCursor(last.created_at, last.id)
        : null;

    return ok({
      data,
      resumen: {
        ingresos,
        egresos,
        total: ingresos - egresos,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
      next_cursor,
    });
  } catch (error) {
    logger.error({ error, query }, "Error al listar movimientos de caja");
    return err(
      databaseError("Error al listar movimientos de caja", error as Error),
    );
  }
}

// Archivar todos los movimientos del periodo activo dentro de una transacción
// (usado por cerrarCaja). Recibe el client de transacción para operar atómicamente.
export async function archivarMovimientos(
  tx: {
    movimientoCaja: {
      updateMany: (args: {
        where: { cierre_caja_id: string | null };
        data: { cierre_caja_id: string };
      }) => Promise<{ count: number }>;
    };
  },
  cierreCajaId: string,
): Promise<{ count: number }> {
  return tx.movimientoCaja.updateMany({
    where: { cierre_caja_id: null },
    data: { cierre_caja_id: cierreCajaId },
  });
}
