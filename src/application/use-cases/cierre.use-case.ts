// src/application/use-cases/cierre.use-case.ts
// Cash closure use cases
import { ok, err } from 'neverthrow';
import { prisma } from '../../infrastructure/database/prisma/client.js';
import type { AppResult } from '../../shared/types/result.js';
import { notFoundError, databaseError } from '../../shared/types/result.js';
import type { ListCierresQueryInput } from '../dto/cierre.dto.js';
import type { VentaCierreQueryInput } from '../dto/venta.dto.js';
import type { VentaCierreRespuesta } from '../../domain/entities/venta.js';
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

// Escape CSV field (wrap in quotes if contains comma or quote)
function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// List cash closures with filters and pagination
export async function listCierres(
  query: ListCierresQueryInput
): Promise<
  AppResult<{
    data: Array<{
      id: string;
      fecha_apertura: Date;
      fecha_cierre: Date | null;
      monto_total: number;
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
    } = query;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Record<string, unknown> = {};

    // Date filters on fecha_cierre
    if (fecha_desde || fecha_hasta) {
      where.fecha_cierre = {};
      if (fecha_desde) {
        (where.fecha_cierre as Record<string, unknown>).gte = fecha_desde;
      }
      if (fecha_hasta) {
        (where.fecha_cierre as Record<string, unknown>).lte = fecha_hasta;
      }
    }

    // Amount filters
    if (monto_min !== undefined || monto_max !== undefined) {
      where.monto_total = {};
      if (monto_min !== undefined) {
        (where.monto_total as Record<string, unknown>).gte = monto_min;
      }
      if (monto_max !== undefined) {
        (where.monto_total as Record<string, unknown>).lte = monto_max;
      }
    }

    // Filter by vendor (detalle tipo vendedor with referencia_id = vendedor_id)
    if (vendedor_id) {
      where.detalles = {
        some: {
          tipo: 'vendedor',
          referencia_id: vendedor_id,
        },
      };
    }

    // Filter by product (detalle tipo producto with referencia_id = producto_id)
    if (producto_id) {
      where.detalles = {
        some: {
          tipo: 'producto',
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
        });
      }

      where.detalles = {
        some: {
          tipo: 'producto',
          referencia_id: { in: productoIds },
        },
      };
    }

    const orderBy: Record<string, string> = { [sort]: order };

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
        take: limit,
      }),
      prisma.cierreCaja.count({ where }),
    ]);

    const data = cierres.map((c) => ({
      id: c.id,
      fecha_apertura: c.fecha_apertura,
      fecha_cierre: c.fecha_cierre,
      monto_total: toNumber(c.monto_total),
      cantidad_ventas: c.cantidad_ventas,
      usuario_apertura: c.usuario_apertura,
      usuario_cierre: c.usuario_cierre,
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
    logger.error({ error, query }, 'Error al listar cierres');
    return err(databaseError('Error al listar cierres', error as Error));
  }
}

// Get cash closure by ID with details
export async function getCierreById(
  id: string
): Promise<
  AppResult<{
    id: string;
    fecha_apertura: Date;
    fecha_cierre: Date | null;
    monto_total: number;
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
  }>
> {
  try {
    const cierre = await prisma.cierreCaja.findUnique({
      where: { id },
      include: {
        detalles: true,
        usuario_apertura: {
          select: { id: true, nombre_usuario: true },
        },
        usuario_cierre: {
          select: { id: true, nombre_usuario: true },
        },
      },
    });

    if (!cierre) {
      return err(notFoundError('Cierre de caja no encontrado'));
    }

    return ok({
      id: cierre.id,
      fecha_apertura: cierre.fecha_apertura,
      fecha_cierre: cierre.fecha_cierre,
      monto_total: toNumber(cierre.monto_total),
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
    });
  } catch (error) {
    logger.error({ error, id }, 'Error al obtener cierre');
    return err(databaseError('Error al obtener cierre', error as Error));
  }
}

// Export cash closure details as CSV string
export async function exportCierreCsv(
  id: string,
  limit: number = 10000
): Promise<AppResult<{ csv: string; totalDetalles: number; truncated: boolean }>> {
  try {
    const cierre = await prisma.cierreCaja.findUnique({
      where: { id },
      include: {
        detalles: true,
      },
    });

    if (!cierre) {
      return err(notFoundError('Cierre de caja no encontrado'));
    }

    const detalles = cierre.detalles;
    const truncated = detalles.length > limit;
    const detallesToExport = truncated ? detalles.slice(0, limit) : detalles;

    // Build CSV
    const header = 'tipo,referencia_id,nombre,cantidad,monto_total';
    const rows = detallesToExport.map((d) => {
      return [
        escapeCsv(d.tipo),
        escapeCsv(d.referencia_id),
        escapeCsv(d.nombre),
        d.cantidad.toString(),
        toNumber(d.monto_total).toFixed(2),
      ].join(',');
    });

    let csv = header + '\n' + rows.join('\n');
    if (truncated) {
      csv += `\n...,AVISO: Truncado a ${limit} registros`;
    }

    return ok({
      csv,
      totalDetalles: detalles.length,
      truncated,
    });
  } catch (error) {
    logger.error({ error, id }, 'Error al exportar cierre CSV');
    return err(databaseError('Error al exportar cierre CSV', error as Error));
  }
}

// List flattened sales rows for a cash closure with server-side filters
export async function listVentasByCierreConDetalles(
  cierreCajaId: string,
  filters: VentaCierreQueryInput
): Promise<AppResult<VentaCierreRespuesta>> {
  try {
    // 1. Verify cierre exists
    const cierre = await prisma.cierreCaja.findUnique({
      where: { id: cierreCajaId },
    });

    if (!cierre) {
      return err(notFoundError('Cierre de caja', cierreCajaId));
    }

    // 2. Fetch all sales for this cierre with details
    const ventas = await prisma.venta.findMany({
      where: { cierre_caja_id: cierreCajaId },
      include: {
        usuario: {
          select: { nombre_usuario: true },
        },
        detalles_venta: {
          include: {
            producto: {
              select: { nombre: true },
            },
          },
        },
      },
    });

    // 3. Flatten: one row per product line per sale
    const rows = ventas.flatMap((v) =>
      v.detalles_venta.map((d) => ({
        id_venta: v.id,
        vendedor: v.usuario.nombre_usuario,
        producto: d.producto.nombre,
        cantidad: toNumber(d.cantidad),
        monto: toNumber(d.subtotal),
      }))
    );

    // 4. Filter in-memory
    let filtered = rows;

    if (filters.id_venta) {
      const needle = filters.id_venta.toLowerCase();
      filtered = filtered.filter((r) =>
        r.id_venta.toLowerCase().includes(needle)
      );
    }

    if (filters.vendedor) {
      const needle = filters.vendedor.toLowerCase();
      filtered = filtered.filter((r) =>
        r.vendedor.toLowerCase().includes(needle)
      );
    }

    if (filters.producto) {
      const needle = filters.producto.toLowerCase();
      filtered = filtered.filter((r) =>
        r.producto.toLowerCase().includes(needle)
      );
    }

    if (filters.monto_min !== undefined) {
      filtered = filtered.filter((r) => r.monto >= filters.monto_min!);
    }

    if (filters.monto_max !== undefined) {
      filtered = filtered.filter((r) => r.monto <= filters.monto_max!);
    }

    // 5. Sort in-memory
    filtered.sort((a, b) => {
      const dir = filters.order === 'asc' ? 1 : -1;
      if (filters.sort === 'id_venta') {
        return a.id_venta.localeCompare(b.id_venta) * dir;
      }
      const valA = a[filters.sort];
      const valB = b[filters.sort];
      return (valA - valB) * dir;
    });

    // 6. Calculate totals
    const total_monto = filtered.reduce((sum, f) => sum + f.monto, 0);

    return ok({
      rows: filtered,
      total_monto,
      total_filas: filtered.length,
    });
  } catch (error) {
    logger.error({ error, cierreCajaId }, 'Error al listar ventas del cierre');
    return err(databaseError('Error al listar ventas del cierre', error as Error));
  }
}
