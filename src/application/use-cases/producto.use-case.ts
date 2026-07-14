// src/application/use-cases/producto.use-case.ts
// Product use cases
import { ok, err } from 'neverthrow';
import { prisma } from '../../infrastructure/database/prisma/client.js';
import type { AppResult } from '../../shared/types/result.js';
import { notFoundError, conflictError, databaseError } from '../../shared/types/result.js';
import type { Producto, ProductoWithRelations } from '../../domain/entities/producto.js';
import type {
  CreateProductoInput,
  UpdateProductoInput,
  ProductoQueryInput,
} from '../dto/producto.dto.js';
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

// Get product by ID
export async function getProductoById(
  id: string
): Promise<AppResult<ProductoWithRelations>> {
  try {
    const producto = await prisma.producto.findUnique({
      where: { id },
      include: {
        rubro: {
          select: { id: true, nombre: true },
        },
        proveedor: {
          select: { id: true, razon_social: true },
        },
      },
    });

    if (!producto) {
      return err(notFoundError('Producto', id));
    }

    // Convert Decimal to number
    const result: ProductoWithRelations = {
      ...producto,
      cantidad_disponible: toNumber(producto.cantidad_disponible),
      cantidad_aviso: toNumber(producto.cantidad_aviso),
      precio_compra: toNumber(producto.precio_compra),
      precio_venta: toNumber(producto.precio_venta),
    };

    return ok(result);
  } catch (error) {
    logger.error({ error, id }, 'Error al obtener producto');
    return err(databaseError('Error al obtener producto', error as Error));
  }
}

// List products with pagination and filters
export async function listProductos(
  query: ProductoQueryInput
): Promise<AppResult<{ data: ProductoWithRelations[]; pagination: {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
} }>> {
  try {
    const { search, rubro_id, proveedor_id, fecha_desde, fecha_hasta, sort, order, page, limit } = query;
    const skip = (page - 1) * limit;

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

    if (proveedor_id) {
      where.proveedor_id = proveedor_id;
    }

    if (fecha_desde || fecha_hasta) {
      where.created_at = {};
      if (fecha_desde) {
        (where.created_at as Record<string, unknown>).gte = fecha_desde;
      }
      if (fecha_hasta) {
        (where.created_at as Record<string, unknown>).lte = fecha_hasta;
      }
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

    // Convert Decimal to number
    const data: ProductoWithRelations[] = productos.map((p) => ({
      ...p,
      cantidad_disponible: toNumber(p.cantidad_disponible),
      cantidad_aviso: toNumber(p.cantidad_aviso),
      precio_compra: toNumber(p.precio_compra),
      precio_venta: toNumber(p.precio_venta),
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
    logger.error({ error, query }, 'Error al listar productos');
    return err(databaseError('Error al listar productos', error as Error));
  }
}

// Create product
export async function createProducto(
  input: CreateProductoInput
): Promise<AppResult<Producto>> {
  try {
    // Check if code already exists for this supplier
    const existing = await prisma.producto.findFirst({
      where: {
        codigo: input.codigo,
        proveedor_id: input.proveedor_id,
      },
    });

    if (existing) {
      return err(conflictError('Producto', `Código ${input.codigo} ya existe para este proveedor`));
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

    const producto = await prisma.producto.create({
      data: {
        nombre: input.nombre,
        codigo: input.codigo,
        cantidad_disponible: input.cantidad_disponible,
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

    logger.info({ productoId: producto.id, codigo: producto.codigo }, 'Producto creado');
    return ok(result);
  } catch (error) {
    logger.error({ error, input }, 'Error al crear producto');
    return err(databaseError('Error al crear producto', error as Error));
  }
}

// Update product
export async function updateProducto(
  input: UpdateProductoInput
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
    if (data.cantidad_disponible !== undefined) updateData.cantidad_disponible = data.cantidad_disponible;
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

    logger.info({ productoId: producto.id, codigo: producto.codigo }, 'Producto actualizado');
    return ok(result);
  } catch (error) {
    logger.error({ error, id: input.id }, 'Error al actualizar producto');
    return err(databaseError('Error al actualizar producto', error as Error));
  }
}

// Delete product
export async function deleteProducto(
  id: string
): Promise<AppResult<{ success: boolean }>> {
  try {
    const existing = await prisma.producto.findUnique({
      where: { id },
      include: {
        _count: {
          select: { detalles_venta: true },
        },
      },
    });

    if (!existing) {
      return err(notFoundError('Producto', id));
    }

    // Check if product has sales
    if (existing._count.detalles_venta > 0) {
      return err({
        code: 'VALIDATION_ERROR',
        message: 'No se puede eliminar producto con ventas asociadas',
      });
    }

    await prisma.producto.delete({
      where: { id },
    });

    logger.info({ productoId: id, codigo: existing.codigo }, 'Producto eliminado');
    return ok({ success: true });
  } catch (error) {
    logger.error({ error, id }, 'Error al eliminar producto');
    return err(databaseError('Error al eliminar producto', error as Error));
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
