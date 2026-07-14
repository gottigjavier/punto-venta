// src/application/use-cases/stock.use-case.ts
// Stock management use cases
import { ok, err } from 'neverthrow';
import { prisma } from '../../infrastructure/database/prisma/client.js';
import type { AppResult } from '../../shared/types/result.js';
import { notFoundError, conflictError, databaseError, validationError } from '../../shared/types/result.js';
import type { Producto, ProductoWithRelations } from '../../domain/entities/producto.js';
import type { StockIngresoInput, StockEditInput, StockQueryInput } from '../dto/stock.dto.js';
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

// Stock item with alerts
interface StockItem extends ProductoWithRelations {
  estado_vencimiento: 'vencido' | 'por_vencer' | 'ok';
  stock_bajo: boolean;
}

// Get stock list with alerts
export async function listStock(
  query: StockQueryInput
): Promise<AppResult<{ data: StockItem[]; pagination: {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
} }>> {
  try {
    const { search, rubro_id, vencimiento_dias, stock_bajo, vencidos, sort, order, page, limit } = query;
    const skip = (page - 1) * limit;
    const now = new Date();
    const futureDate =
      vencimiento_dias !== undefined
        ? new Date(now.getTime() + vencimiento_dias * 24 * 60 * 60 * 1000)
        : null;

    // Build where clause
    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { nombre: { contains: search, mode: 'insensitive' } },
        { codigo: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (rubro_id) {
      where.rubro_id = rubro_id;
    }

    // Filter by stock status
    if (stock_bajo) {
      where.cantidad_disponible = { lt: 10 };
    }

    // Filter by expiration status
    if (vencidos) {
      where.fecha_vencimiento = { lt: now };
    } else if (futureDate) {
      // Products expiring soon (but not yet expired)
      where.AND = [
        { fecha_vencimiento: { gte: now } },
        { fecha_vencimiento: { lte: futureDate } },
      ];
    }

    // Build orderBy
    const orderBy: Record<string, string> = { [sort]: order };

    // Execute query
    const [productos, total] = await Promise.all([
      prisma.producto.findMany({
        where,
        include: {
          rubro: {
            select: { id: true, nombre: true },
          },
          proveedor: {
            select: { id: true, razon_social: true },
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.producto.count({ where }),
    ]);

    // Map to stock items with alerts
    const stockItems: StockItem[] = productos.map((p) => {
      let estado_vencimiento: 'vencido' | 'por_vencer' | 'ok' = 'ok';

      if (p.fecha_vencimiento) {
        const vencimiento = new Date(p.fecha_vencimiento);
        if (vencimiento < now) {
          estado_vencimiento = 'vencido';
        } else if (futureDate && vencimiento <= futureDate) {
          estado_vencimiento = 'por_vencer';
        }
      }

      return {
        ...p,
        cantidad_disponible: toNumber(p.cantidad_disponible),
        cantidad_aviso: toNumber(p.cantidad_aviso),
        precio_compra: toNumber(p.precio_compra),
        precio_venta: toNumber(p.precio_venta),
        estado_vencimiento,
        stock_bajo: toNumber(p.cantidad_disponible) < 10,
      } as StockItem;
    });

    const totalPages = Math.ceil(total / limit);

    return ok({
      data: stockItems,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error) {
    logger.error({ error, query }, 'Error al listar stock');
    return err(databaseError('Error al listar stock', error as Error));
  }
}

// Stock entry (ingreso)
export async function stockIngreso(
  input: StockIngresoInput
): Promise<AppResult<Producto>> {
  try {
    // Check if product with same code and supplier already exists
    const existing = await prisma.producto.findFirst({
      where: {
        codigo: input.codigo,
        proveedor_id: input.proveedor_id,
      },
    });

    if (existing) {
      // Check if ALL fields match
      const allFieldsMatch =
        existing.nombre === input.nombre &&
        toNumber(existing.cantidad_disponible) === input.cantidad &&
        toNumber(existing.precio_compra) === input.precio_compra &&
        toNumber(existing.precio_venta) === input.precio_venta &&
        existing.rubro_id === input.rubro_id &&
        existing.unidad_medida === input.unidad_medida &&
        existing.fecha_compra?.toISOString().split('T')[0] === input.fecha_compra &&
        existing.fecha_vencimiento?.toISOString().split('T')[0] === input.fecha_vencimiento &&
        existing.numero_remesa === input.numero_remesa;

      if (allFieldsMatch) {
        return err(validationError('No se puede guardar: todos los campos coinciden con un producto existente'));
      }

      // If not all fields match, update the existing product
      const updated = await prisma.producto.update({
        where: { id: existing.id },
        data: {
          nombre: input.nombre,
          cantidad_disponible: input.cantidad,
          cantidad_aviso: input.cantidad_aviso,
          precio_compra: input.precio_compra,
          precio_venta: input.precio_venta,
          rubro_id: input.rubro_id,
          fecha_compra: input.fecha_compra ? new Date(input.fecha_compra) : null,
          fecha_vencimiento: input.fecha_vencimiento ? new Date(input.fecha_vencimiento) : null,
          numero_remesa: input.numero_remesa ?? null,
          unidad_medida: input.unidad_medida,
        },
      });

      const result: Producto = {
        ...updated,
        cantidad_disponible: toNumber(updated.cantidad_disponible),
        cantidad_aviso: toNumber(updated.cantidad_aviso),
        precio_compra: toNumber(updated.precio_compra),
        precio_venta: toNumber(updated.precio_venta),
      };

      logger.info({ productoId: updated.id, codigo: updated.codigo }, 'Stock actualizado via ingreso');
      return ok(result);
    }

    // Verify rubro exists
    const rubro = await prisma.rubro.findUnique({
      where: { id: input.rubro_id },
    });

    if (!rubro) {
      return err(notFoundError('Rubro', input.rubro_id));
    }

    // Verify proveedor exists
    const proveedor = await prisma.proveedor.findUnique({
      where: { id: input.proveedor_id },
    });

    if (!proveedor) {
      return err(notFoundError('Proveedor', input.proveedor_id));
    }

    // Create new product
    const producto = await prisma.producto.create({
      data: {
        nombre: input.nombre,
        codigo: input.codigo,
        cantidad_disponible: input.cantidad,
        cantidad_aviso: input.cantidad_aviso,
        precio_compra: input.precio_compra,
        precio_venta: input.precio_venta,
        rubro_id: input.rubro_id,
        proveedor_id: input.proveedor_id,
        fecha_compra: input.fecha_compra ? new Date(input.fecha_compra) : null,
        fecha_vencimiento: input.fecha_vencimiento ? new Date(input.fecha_vencimiento) : null,
        numero_remesa: input.numero_remesa ?? null,
        unidad_medida: input.unidad_medida,
      },
    });

    const result: Producto = {
      ...producto,
      cantidad_disponible: toNumber(producto.cantidad_disponible),
      cantidad_aviso: toNumber(producto.cantidad_aviso),
      precio_compra: toNumber(producto.precio_compra),
      precio_venta: toNumber(producto.precio_venta),
    };

    logger.info({ productoId: producto.id, codigo: producto.codigo }, 'Stock creado via ingreso');
    return ok(result);
  } catch (error) {
    logger.error({ error, input }, 'Error en ingreso de stock');
    return err(databaseError('Error en ingreso de stock', error as Error));
  }
}

// Stock edit (existing product)
export async function stockEdit(
  input: StockEditInput
): Promise<AppResult<Producto>> {
  try {
    const { id, ...data } = input;

    // Check if product exists
    const existing = await prisma.producto.findUnique({
      where: { id },
    });

    if (!existing) {
      return err(notFoundError('Producto', id));
    }

    // If code is being changed, check uniqueness for this supplier
    if (data.codigo) {
      const proveedorId = data.proveedor_id ?? existing.proveedor_id;
      const codeExists = await prisma.producto.findFirst({
        where: {
          codigo: data.codigo,
          proveedor_id: proveedorId,
          id: { not: id },
        },
      });

      if (codeExists) {
        return err(conflictError('Producto', `Código ${data.codigo} ya existe para este proveedor`));
      }
    }

    // Verify rubro exists if changing
    if (data.rubro_id) {
      const rubro = await prisma.rubro.findUnique({
        where: { id: data.rubro_id },
      });

      if (!rubro) {
        return err(notFoundError('Rubro', data.rubro_id));
      }
    }

    // Verify proveedor exists if changing
    if (data.proveedor_id) {
      const proveedor = await prisma.proveedor.findUnique({
        where: { id: data.proveedor_id },
      });

      if (!proveedor) {
        return err(notFoundError('Proveedor', data.proveedor_id));
      }
    }

    // Build update data, converting undefined to null for nullable fields
    const updateData: Record<string, unknown> = {};
    if (data.nombre !== undefined) updateData.nombre = data.nombre;
    if (data.codigo !== undefined) updateData.codigo = data.codigo;
    if (data.cantidad !== undefined) updateData.cantidad_disponible = data.cantidad;
    if (data.cantidad_aviso !== undefined) updateData.cantidad_aviso = data.cantidad_aviso;
    if (data.precio_compra !== undefined) updateData.precio_compra = data.precio_compra;
    if (data.precio_venta !== undefined) updateData.precio_venta = data.precio_venta;
    if (data.rubro_id !== undefined) updateData.rubro_id = data.rubro_id;
    if (data.proveedor_id !== undefined) updateData.proveedor_id = data.proveedor_id;
    if (data.fecha_compra !== undefined) updateData.fecha_compra = data.fecha_compra ? new Date(data.fecha_compra) : null;
    if (data.fecha_vencimiento !== undefined) updateData.fecha_vencimiento = data.fecha_vencimiento ? new Date(data.fecha_vencimiento) : null;
    if (data.numero_remesa !== undefined) updateData.numero_remesa = data.numero_remesa ?? null;
    if (data.unidad_medida !== undefined) updateData.unidad_medida = data.unidad_medida;

    const producto = await prisma.producto.update({
      where: { id },
      data: updateData,
    });

    const result: Producto = {
      ...producto,
      cantidad_disponible: toNumber(producto.cantidad_disponible),
      cantidad_aviso: toNumber(producto.cantidad_aviso),
      precio_compra: toNumber(producto.precio_compra),
      precio_venta: toNumber(producto.precio_venta),
    };

    logger.info({ productoId: producto.id, codigo: producto.codigo }, 'Stock actualizado');
    return ok(result);
  } catch (error) {
    logger.error({ error, id: input.id }, 'Error al editar stock');
    return err(databaseError('Error al editar stock', error as Error));
  }
}

// Search products for autocomplete
export async function searchProductos(
  query: string,
  tipo: 'nombre' | 'codigo' = 'nombre'
): Promise<AppResult<Producto[]>> {
  try {
    const where: Record<string, unknown> = {};

    if (tipo === 'nombre') {
      where.nombre = { contains: query, mode: 'insensitive' };
    } else {
      where.codigo = { contains: query, mode: 'insensitive' };
    }

    const productos = await prisma.producto.findMany({
      where,
      include: {
        rubro: {
          select: { id: true, nombre: true },
        },
        proveedor: {
          select: { id: true, razon_social: true },
        },
      },
      take: 10,
      orderBy: { nombre: 'asc' },
    });

    // Convert Decimal to number
    const data: Producto[] = productos.map((p) => ({
      ...p,
      cantidad_disponible: toNumber(p.cantidad_disponible),
      cantidad_aviso: toNumber(p.cantidad_aviso),
      precio_compra: toNumber(p.precio_compra),
      precio_venta: toNumber(p.precio_venta),
    }));

    return ok(data);
  } catch (error) {
    logger.error({ error, query }, 'Error al buscar productos');
    return err(databaseError('Error al buscar productos', error as Error));
  }
}
