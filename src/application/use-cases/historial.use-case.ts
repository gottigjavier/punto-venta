// src/application/use-cases/historial.use-case.ts
// Historial unificado (ventas + movimientos de caja) del periodo activo
import { ok, err } from 'neverthrow';
import { prisma } from '../../infrastructure/database/prisma/client.js';
import type { AppResult } from '../../shared/types/result.js';
import { databaseError } from '../../shared/types/result.js';
import type { HistorialQueryInput, FilaHistorial } from '../dto/historial.dto.js';
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

function startOfDay(d: string): Date {
  return new Date(`${d}T00:00:00.000Z`);
}

function endOfDay(d: string): Date {
  return new Date(`${d}T23:59:59.999Z`);
}

export async function historialUnificado(
  query: HistorialQueryInput
): Promise<
  AppResult<{
    data: FilaHistorial[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }>
> {
  try {
    const { page, limit, sort, order, fecha_desde, fecha_hasta, usuario_id, tipo_fila } = query;
    const skip = (page - 1) * limit;

    // Only active period (cierre_caja_id = null) + shared filters
    const whereComun: Record<string, unknown> = {
      cierre_caja_id: null,
    };

    if (usuario_id) {
      whereComun.usuario_id = usuario_id;
    }

    if (fecha_desde || fecha_hasta) {
      const rango: Record<string, Date> = {};
      if (fecha_desde) rango.gte = startOfDay(fecha_desde);
      if (fecha_hasta) rango.lte = endOfDay(fecha_hasta);
      whereComun.created_at = rango;
    }

    // Fetch both sources unfiltered by pagination (period volume is bounded),
    // merge in memory for correct global ordering.
    const [ventas, movimientos] = await Promise.all([
      prisma.venta.findMany({
        where: whereComun,
        include: {
          usuario: {
            select: { nombre_usuario: true },
          },
          _count: {
            select: { detalles_venta: true },
          },
        },
      }),
      prisma.movimientoCaja.findMany({
        where: whereComun,
        include: {
          usuario: {
            select: { nombre_usuario: true },
          },
        },
      }),
    ]);

    const filas: FilaHistorial[] = [
      ...ventas.map((v) => ({
        id: v.id,
        tipo_fila: 'venta' as const,
        created_at: v.created_at,
        usuario_nombre: v.usuario.nombre_usuario,
        monto: toNumber(v.total),
        estado: 'Venta' as const,
        cantidad_items: v._count.detalles_venta,
        referencia_id: null,
      })),
      ...movimientos.map((m) => ({
        id: m.id,
        tipo_fila: 'movimiento' as const,
        created_at: m.created_at,
        usuario_nombre: m.usuario.nombre_usuario,
        monto: toNumber(m.monto),
        estado: (m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso') as 'Ingreso' | 'Egreso',
        cantidad_items: null,
        referencia_id: null,
      })),
    ];

    const filtradas = tipo_fila ? filas.filter((f) => f.tipo_fila === tipo_fila) : filas;

    filtradas.sort((a, b) => {
      let cmp = 0;
      if (sort === 'monto') {
        cmp = Math.abs(a.monto) - Math.abs(b.monto);
      } else {
        const da = new Date(a.created_at).getTime();
        const db = new Date(b.created_at).getTime();
        cmp = da - db;
      }
      return order === 'asc' ? cmp : -cmp;
    });

    const total = filtradas.length;
    const totalPages = Math.ceil(total / limit);
    const data = filtradas.slice(skip, skip + limit);

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
    logger.error({ error, query }, 'Error al obtener historial unificado');
    return err(databaseError('Error al obtener historial unificado', error as Error));
  }
}
