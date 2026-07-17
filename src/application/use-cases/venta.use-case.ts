// src/application/use-cases/venta.use-case.ts
// Sale use cases
import { ok, err } from 'neverthrow';
import { prisma } from '../../infrastructure/database/prisma/client.js';
import type { AppResult } from '../../shared/types/result.js';
import {
  notFoundError,
  databaseError,
} from '../../shared/types/result.js';
import type {
  VentaWithDetalles,
  VentaListItem,
  ResumenDia,
} from '../../domain/entities/venta.js';
import type { CreateVentaInput, VentaQueryInput } from '../dto/venta.dto.js';
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

// Create a sale (atomic transaction)
export async function createVenta(
  input: CreateVentaInput,
  usuarioId: string
): Promise<AppResult<VentaWithDetalles>> {
  try {
    // 1. Verify all products exist and have sufficient stock
    const productIds = input.productos.map((p) => p.producto_id);
    const productos = await prisma.producto.findMany({
      where: { id: { in: productIds } },
    });

    if (productos.length !== productIds.length) {
      const foundIds = new Set(productos.map((p) => p.id));
      const missingId = productIds.find((id) => !foundIds.has(id));
      return err(notFoundError('Producto', missingId));
    }

    // 2. Build a map for quick lookup and validate stock
    const productoMap = new Map(
      productos.map((p) => [p.id, p])
    );

    for (const item of input.productos) {
      const producto = productoMap.get(item.producto_id);
      if (!producto) {
        return err(notFoundError('Producto', item.producto_id));
      }

      const stockDisponible = toNumber(producto.cantidad_disponible);
      if (stockDisponible < item.cantidad) {
        return err({
          code: 'STOCK_INSUFFICIENT',
          message: `Stock insuficiente para producto ${producto.codigo}`,
          disponible: stockDisponible,
          solicitado: item.cantidad,
        });
      }
    }

    // 3. Calculate total
    const total = input.productos.reduce(
      (sum, item) => sum + item.cantidad * item.precio_unitario,
      0
    );

    // 4. Execute atomic transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create venta
      const venta = await tx.venta.create({
        data: {
          usuario_id: usuarioId,
          total,
          estado: 'completada',
        },
      });

      // Create detalles and update stock
      const detallesPromises = input.productos.map(async (item) => {
        const detalle = await tx.detalleVenta.create({
          data: {
            venta_id: venta.id,
            producto_id: item.producto_id,
            cantidad: item.cantidad,
            precio_unitario: item.precio_unitario,
            subtotal: item.cantidad * item.precio_unitario,
          },
        });

        // Decrement stock
        await tx.producto.update({
          where: { id: item.producto_id },
          data: {
            cantidad_disponible: {
              decrement: item.cantidad,
            },
          },
        });

        return detalle;
      });

      const detalles = await Promise.all(detallesPromises);

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

      return { venta: ventaCompleta, detalles };
    });

    if (!result.venta) {
      return err(databaseError('Error al crear venta'));
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
      'Venta creada exitosamente'
    );
    return ok(response);
  } catch (error) {
    logger.error({ error, input, usuarioId }, 'Error al crear venta');
    return err(databaseError('Error al crear venta', error as Error));
  }
}

// Get sale by ID
export async function getVentaById(
  id: string
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
      return err(notFoundError('Venta', id));
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
    logger.error({ error, id }, 'Error al obtener venta');
    return err(databaseError('Error al obtener venta', error as Error));
  }
}

// List sales with pagination and filters
export async function listVentas(
  query: VentaQueryInput
): Promise<
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
    const { usuario_id, estado, fecha_desde, fecha_hasta, sort, order, page, limit, cierre_caja_id } =
      query;
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
        (where.created_at as Record<string, unknown>).gte = startOfDay(fecha_desde);
      }
      if (fecha_hasta) {
        (where.created_at as Record<string, unknown>).lte = endOfDay(fecha_hasta);
      }
    }

    // Filter by cash period: null by default (active period), or explicit cierre_caja_id
    if (cierre_caja_id !== undefined) {
      where.cierre_caja_id = cierre_caja_id;
    } else {
      where.cierre_caja_id = null;
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
    logger.error({ error, query }, 'Error al listar ventas');
    return err(databaseError('Error al listar ventas', error as Error));
  }
}

// Get daily sales summary
export async function getResumenDia(): Promise<AppResult<ResumenDia>> {
  try {
    const today = new Date();
    const desde = startOfDay(today);
    const hasta = endOfDay(today);

    // Get all completed sales for today that are not yet archived in a cash closing
    const ventas = await prisma.venta.findMany({
      where: {
        estado: 'completada',
        cierre_caja_id: null,
        created_at: {
          gte: desde,
          lte: hasta,
        },
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
      orderBy: { created_at: 'desc' },
    });

    // Calculate totals
    const total_ventas = ventas.length;
    const monto_total = ventas.reduce(
      (sum, v) => sum + toNumber(v.total),
      0
    );

    // Aggregate products sold
    const productoMap = new Map<
      string,
      { producto_id: string; nombre: string; cantidad_total: number; monto_total: number }
    >();

    // Aggregate sales by user
    const usuarioMap = new Map<
      string,
      { usuario_id: string; nombre: string; cantidad_ventas: number; monto_total: number }
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

    const response: ResumenDia = {
      fecha: today.toISOString().split('T')[0] ?? today.toISOString(),
      total_ventas,
      monto_total,
      productos_vendidos: Array.from(productoMap.values()),
      ventas_por_usuario: Array.from(usuarioMap.values()),
    };

    return ok(response);
  } catch (error) {
    logger.error({ error }, 'Error al obtener resumen del día');
    return err(databaseError('Error al obtener resumen del día', error as Error));
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
      ultima_venta_at: d.ultima_venta_at ? d.ultima_venta_at.toISOString() : null,
      ultima_cantidad: d.ultima_cantidad ? toNumber(d.ultima_cantidad) : null,
    }));

    return ok(result);
  } catch (error) {
    logger.error({ error }, 'Error al obtener últimas ventas por producto');
    return err(
      databaseError('Error al obtener últimas ventas por producto', error as Error),
    );
  }
}

// Delete a completed sale, restoring stock
export async function deleteVenta(
  id: string
): Promise<AppResult<{ id: string }>> {
  try {
    const venta = await prisma.venta.findUnique({
      where: { id },
      include: { detalles_venta: true },
    });

    if (!venta) {
      return err(notFoundError('Venta', id));
    }

    // Block deletion of archived sales (those linked to a closed cash period)
    if (venta.cierre_caja_id !== null) {
      return err({
        code: 'CONFLICT' as const,
        message: 'Esta venta pertenece a un período cerrado. No se puede eliminar.',
      });
    }

    if (venta.estado !== 'completada') {
      return err({
        code: 'CONFLICT',
        message: 'Solo se pueden eliminar ventas completadas',
      });
    }

    await prisma.$transaction(async (tx) => {
      // Restore stock for each detail
      for (const detalle of venta.detalles_venta) {
        await tx.producto.update({
          where: { id: detalle.producto_id },
          data: {
            cantidad_disponible: {
              increment: toNumber(detalle.cantidad),
            },
          },
        });
      }

      await tx.detalleVenta.deleteMany({ where: { venta_id: id } });
      await tx.venta.delete({ where: { id } });
    });

    return ok({ id });
  } catch (error) {
    logger.error({ error, id }, 'Error al eliminar venta');
    return err(databaseError('Error al eliminar venta', error as Error));
  }
}

// Close cash period: archive all open completed sales into a CierreCaja
export async function cerrarCaja(
  usuarioCierreId: string
): Promise<AppResult<{ id: string; monto_total: number; cantidad_ventas: number; fecha_cierre: string }>> {
  try {
    // Only completed sales not yet archived
    const ventasAbiertas = await prisma.venta.findMany({
      where: {
        estado: 'completada',
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
      orderBy: { created_at: 'asc' },
    });

    if (ventasAbiertas.length === 0) {
      return err({
        code: 'CONFLICT',
        message: 'No hay ventas completadas para cerrar',
      });
    }

    const primeraVenta = ventasAbiertas[0];
    if (!primeraVenta) {
      return err({
        code: 'CONFLICT',
        message: 'No hay ventas completadas para cerrar',
      });
    }
    const fechaApertura = primeraVenta.created_at;
    const usuarioAperturaId = primeraVenta.usuario_id;
    const fechaCierre = new Date();

    const montoTotal = ventasAbiertas.reduce(
      (sum, v) => sum + toNumber(v.total),
      0
    );

    // Aggregate by vendor
    const usuarioMap = new Map<
      string,
      { usuario_id: string; nombre: string; cantidad_ventas: number; monto_total: number }
    >();

    // Aggregate by product
    const productoMap = new Map<
      string,
      { producto_id: string; nombre: string; cantidad_total: number; monto_total: number }
    >();

    for (const venta of ventasAbiertas) {
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

    const detallesVendedor = Array.from(usuarioMap.values()).map((u) => ({
      tipo: 'vendedor',
      referencia_id: u.usuario_id,
      nombre: u.nombre,
      cantidad: u.cantidad_ventas,
      monto_total: u.monto_total,
    }));

    const detallesProducto = Array.from(productoMap.values()).map((p) => ({
      tipo: 'producto',
      referencia_id: p.producto_id,
      nombre: p.nombre,
      cantidad: p.cantidad_total,
      monto_total: p.monto_total,
    }));

    const cierre = await prisma.$transaction(async (tx) => {
      const nuevoCierre = await tx.cierreCaja.create({
        data: {
          fecha_apertura: fechaApertura,
          fecha_cierre: fechaCierre,
          usuario_apertura_id: usuarioAperturaId,
          usuario_cierre_id: usuarioCierreId,
          monto_total: montoTotal,
          cantidad_ventas: ventasAbiertas.length,
          estado: 'cerrado',
          detalles: {
            create: [...detallesVendedor, ...detallesProducto],
          },
        },
      });

      await tx.venta.updateMany({
        where: {
          id: { in: ventasAbiertas.map((v) => v.id) },
        },
        data: {
          cierre_caja_id: nuevoCierre.id,
        },
      });

      return nuevoCierre;
    });

    logger.info(
      { cierreId: cierre.id, cantidadVentas: ventasAbiertas.length, montoTotal },
      'Caja cerrada exitosamente'
    );

    return ok({
      id: cierre.id,
      monto_total: toNumber(cierre.monto_total),
      cantidad_ventas: cierre.cantidad_ventas,
      fecha_cierre: (cierre.fecha_cierre ?? fechaCierre).toISOString(),
    });
  } catch (error) {
    logger.error({ error, usuarioCierreId }, 'Error al cerrar caja');
    return err(databaseError('Error al cerrar caja', error as Error));
  }
}
