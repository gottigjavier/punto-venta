// src/application/use-cases/movimiento-caja.use-case.ts
// Movimientos de caja (ingresos/egresos) use cases
import { ok, err } from 'neverthrow';
import { prisma } from '../../infrastructure/database/prisma/client.js';
import type { AppResult } from '../../shared/types/result.js';
import { databaseError, validationError } from '../../shared/types/result.js';
import type { MovimientoCaja } from '../../domain/entities/venta.js';
import type { CrearMovimientoInput, MovimientoQueryInput } from '../dto/movimiento.dto.js';
import { logger } from '../../infrastructure/logging/logger.js';

// Helper to convert Prisma Decimal to number
function toNumber(val: unknown): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return parseFloat(val);
  if (val && typeof val === 'object' && 'toNumber' in val) {
    return (val as { toNumber: () => number }).toNumber();
  }
  return 0;
}

// Create a cash movement (ingreso/egreso) in the active period
export async function crearMovimiento(
  input: Omit<CrearMovimientoInput, 'password'>,
  usuarioId: string
): Promise<AppResult<MovimientoCaja>> {
  try {
    const monto = toNumber(input.monto);

    if (monto <= 0) {
      return err(validationError('El monto debe ser mayor a 0'));
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
      { movimientoId: response.id, tipo: response.tipo, monto: response.monto, usuarioId },
      'Movimiento de caja creado exitosamente'
    );

    return ok(response);
  } catch (error) {
    logger.error({ error, input, usuarioId }, 'Error al crear movimiento de caja');
    return err(databaseError('Error al crear movimiento de caja', error as Error));
  }
}

// List movements of the active period with pagination
export async function listarMovimientos(
  query: MovimientoQueryInput
): Promise<
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
  }>
> {
  try {
    const { sort, order, page, limit } = query;
    const skip = (page - 1) * limit;

    // Only active period (cierre_caja_id = null)
    const where: Record<string, unknown> = {
      cierre_caja_id: null,
    };

    const orderBy: Record<string, string> = { [sort]: order };

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
        take: limit,
      }),
      prisma.movimientoCaja.count({ where }),
    ]);

    // Fetch all active movements (unpaginated) to compute complete resumen
    const todosActivos = await prisma.movimientoCaja.findMany({
      where: { cierre_caja_id: null },
      select: { tipo: true, monto: true },
    });

    const ingresos = todosActivos
      .filter((m) => m.tipo === 'ingreso')
      .reduce((sum, m) => sum + toNumber(m.monto), 0);
    const egresos = todosActivos
      .filter((m) => m.tipo === 'egreso')
      .reduce((sum, m) => sum + toNumber(m.monto), 0);

    const data: MovimientoCaja[] = movimientos.map((m) => ({
      ...m,
      monto: toNumber(m.monto),
      usuario: m.usuario,
    }));

    const totalPages = Math.ceil(total / limit);

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
    });
  } catch (error) {
    logger.error({ error, query }, 'Error al listar movimientos de caja');
    return err(databaseError('Error al listar movimientos de caja', error as Error));
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
  cierreCajaId: string
): Promise<{ count: number }> {
  return tx.movimientoCaja.updateMany({
    where: { cierre_caja_id: null },
    data: { cierre_caja_id: cierreCajaId },
  });
}
