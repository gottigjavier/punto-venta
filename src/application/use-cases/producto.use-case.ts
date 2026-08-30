// src/application/use-cases/producto.use-case.ts
// Product use cases
// Tras el split Producto/Lote: el producto es el maestro (información general,
// activo, cantidad_aviso). El stock se calcula (stock_actual = SUM de lotes
// activos NO vencidos) tras un lazy pass de vencidos. deleteProducto pasa a
// SOFT DELETE (activo=false).
import { ok, err } from 'neverthrow';
import { Prisma, Producto as PrismaProducto } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma/client.js';
import type { AppResult } from '../../shared/types/result.js';
import { notFoundError, conflictError, conflictRestaurableError, databaseError, validationError } from '../../shared/types/result.js';
import type { Producto, ProductoWithRelations } from '../../domain/entities/producto.js';
import type { Lote } from '../../domain/entities/lote.js';
import type {
  CreateProductoInput,
  UpdateProductoInput,
  ProductoQueryInput,
} from '../dto/producto.dto.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { retirarLotesVencidos, toUTC3DateString } from './stock.use-case.js';

// Helper to convert Prisma Decimal to number
function toNumber(val: unknown): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return parseFloat(val);
  if (val && typeof val === 'object' && 'toNumber' in val) {
    return (val as { toNumber: () => number }).toNumber();
  }
  return 0;
}

// Midnoches UTC del día (UTC-3) para filtrar lotes NO vencidos
function limiteVencidos(): Date {
  const hoyStr = toUTC3DateString(new Date());
  return new Date(hoyStr + 'T00:00:00.000Z');
}

// Incluye relaciones del producto
const productoInclude = {
  rubro: {
    select: { id: true, nombre: true },
  },
  proveedor: {
    select: { id: true, razon_social: true },
  },
} satisfies Prisma.ProductoInclude;

// Convierte un producto crudo (Prisma) a Producto tipado, agregando
// stock_actual = SUM(lotes activos NO vencidos) y los lotes vigentes.
type SumaPorProducto = Map<string, number>;

async function calcularStockPorProducto(ids: string[]): Promise<SumaPorProducto> {
  if (ids.length === 0) return new Map();
  const limite = limiteVencidos();
  const lotes = await prisma.lote.findMany({
    where: {
      producto_id: { in: ids },
      estado: 'activo',
      OR: [
        { fecha_vencimiento: null },
        { fecha_vencimiento: { gte: limite } },
      ],
    },
    select: { producto_id: true, cantidad_disponible: true },
  });

  return lotes.reduce<SumaPorProducto>((acc, l) => {
    acc.set(l.producto_id, (acc.get(l.producto_id) ?? 0) + toNumber(l.cantidad_disponible));
    return acc;
  }, new Map());
}

// Lee los lotes vigentes (activos NO vencidos) de varios productos como Lote[]
async function lotesVigentesDe(ids: string[]): Promise<Lote[]> {
  if (ids.length === 0) return [];
  const limite = limiteVencidos();
  const lotes = await prisma.lote.findMany({
    where: {
      producto_id: { in: ids },
      estado: 'activo',
      OR: [
        { fecha_vencimiento: null },
        { fecha_vencimiento: { gte: limite } },
      ],
    },
  });

  return lotes.map((l) => ({
    ...l,
    cantidad_disponible: toNumber(l.cantidad_disponible),
    precio_compra: toNumber(l.precio_compra),
    estado: l.estado as Lote['estado'],
  }));
}

// Get product by ID (con stock_actual calculado)
export async function getProductoById(
  id: string
): Promise<AppResult<ProductoWithRelations>> {
  try {
    await retirarLotesVencidos();

    const producto = await prisma.producto.findUnique({
      where: { id },
      include: productoInclude,
    });

    if (!producto) {
      return err(notFoundError('Producto', id));
    }

    const sumas = await calcularStockPorProducto([id]);
    const lotes = await lotesVigentesDe([id]);

    const result: ProductoWithRelations = {
      ...producto,
      cantidad_aviso: toNumber(producto.cantidad_aviso),
      precio_venta: toNumber(producto.precio_venta),
      unidad_medida: producto.unidad_medida as ProductoWithRelations['unidad_medida'],
      vencimiento_preaviso_dias: producto.vencimiento_preaviso_dias ?? undefined,
      stock_actual: sumas.get(id) ?? 0,
      lotes,
    };

    return ok(result);
  } catch (error) {
    logger.error({ error, id }, 'Error al obtener producto');
    return err(databaseError('Error al obtener producto', error as Error));
  }
}

// List products with pagination and filters (excluye inactivos por default)
export async function listProductos(
  query: ProductoQueryInput
): Promise<AppResult<{ data: ProductoWithRelations[]; pagination: {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
} }>> {
  try {
    await retirarLotesVencidos();

    const { search, rubro_id, proveedor_id, fecha_desde, fecha_hasta, sort, order, page, limit, activo } = query;
    const skip = (page - 1) * limit;

    // Build where clause — default activo=true (cero regresión); si activo se pasa, úsalo
    const where: Prisma.ProductoWhereInput = {};
    if (activo !== undefined) {
      where.activo = activo === 'true';
    } else {
      where.activo = true;
    }

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
        (where.created_at as Prisma.DateTimeFilter).gte = fecha_desde;
      }
      if (fecha_hasta) {
        (where.created_at as Prisma.DateTimeFilter).lte = fecha_hasta;
      }
    }

    // Build orderBy
    const orderBy: Prisma.ProductoOrderByWithRelationInput = { [sort]: order };

    // Execute query
    const [productos, total] = await Promise.all([
      prisma.producto.findMany({
        where,
        include: productoInclude,
        orderBy,
        skip,
        take: limit,
      }),
      prisma.producto.count({ where }),
    ]);

    const sumas = await calcularStockPorProducto(productos.map((p) => p.id));
    const lotes = await lotesVigentesDe(productos.map((p) => p.id));
    const lotesPorProducto = new Map<string, Lote[]>();
    for (const l of lotes) {
      const arr = lotesPorProducto.get(l.producto_id) ?? [];
      arr.push(l);
      lotesPorProducto.set(l.producto_id, arr);
    }

    // Convert Decimal to number
    const data: ProductoWithRelations[] = productos.map((p) => ({
      ...p,
      cantidad_aviso: toNumber(p.cantidad_aviso),
      precio_venta: toNumber(p.precio_venta),
      unidad_medida: p.unidad_medida as ProductoWithRelations['unidad_medida'],
      vencimiento_preaviso_dias: p.vencimiento_preaviso_dias ?? undefined,
      stock_actual: sumas.get(p.id) ?? 0,
      lotes: lotesPorProducto.get(p.id) ?? [],
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

// Detección compartida de conflicto de unicidad (codigo, proveedor_id) para
// create/update/P2002: distingue el caso "inactivo sin lotes activos" (restaurable)
// del CONFLICT normal (activo, o inactivo con stock heredado). Solo consulta
// lote.findFirst en el path de conflicto con producto inactivo — el happy path
// sigue con una sola query.
type ConflictoCodigo =
  | { tipo: 'libre' }
  | { tipo: 'activo'; producto: PrismaProducto }
  | { tipo: 'inactivo_sin_stock'; producto: PrismaProducto }
  | { tipo: 'inactivo_con_stock'; producto: PrismaProducto };

async function detectarConflictoCodigo(
  codigo: string,
  proveedorId: string,
  excluirId?: string
): Promise<ConflictoCodigo> {
  const existing = await prisma.producto.findFirst({
    where: { codigo, proveedor_id: proveedorId, ...(excluirId ? { id: { not: excluirId } } : {}) },
  });
  if (!existing) return { tipo: 'libre' };
  if (existing.activo) return { tipo: 'activo', producto: existing };
  const loteActivo = await prisma.lote.findFirst({
    where: { producto_id: existing.id, estado: 'activo' },
    select: { id: true },
  });
  return loteActivo
    ? { tipo: 'inactivo_con_stock', producto: existing }
    : { tipo: 'inactivo_sin_stock', producto: existing };
}

// Create product (sin datos de stock/compra — esos van al lote)
export async function createProducto(
  input: CreateProductoInput
): Promise<AppResult<Producto>> {
  try {
    // Check if code already exists for this supplier (mensaje amistoso antes del P2002)
    const conflicto = await detectarConflictoCodigo(input.codigo, input.proveedor_id);

    if (conflicto.tipo !== 'libre') {
      // RF-05: inactivo sin lotes activos → payload diferenciado (sugiere restauración)
      if (conflicto.tipo === 'inactivo_sin_stock') {
        return err(
          conflictRestaurableError('Producto', {
            producto_id: conflicto.producto.id,
            message: `Ya existe un producto inactivo con el código ${input.codigo} para este proveedor`,
          })
        );
      }
      // RF-06/RF-07: activo o inactivo con stock heredado → CONFLICT normal (byte-idéntico)
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
        cantidad_aviso: input.cantidad_aviso ?? 0,
        precio_venta: input.precio_venta,
        rubro_id: input.rubro_id,
        proveedor_id: input.proveedor_id,
        unidad_medida: input.unidad_medida,
        vencimiento_preaviso_dias: input.vencimiento_preaviso_dias ?? 30,
        activo: true,
      },
    });

    const result: Producto = {
      ...producto,
      cantidad_aviso: toNumber(producto.cantidad_aviso),
      precio_venta: toNumber(producto.precio_venta),
      unidad_medida: producto.unidad_medida as Producto['unidad_medida'],
      vencimiento_preaviso_dias: producto.vencimiento_preaviso_dias ?? undefined,
      stock_actual: 0,
      lotes: [],
    };

    logger.info({ productoId: producto.id, codigo: producto.codigo }, 'Producto creado');
    return ok(result);
  } catch (error) {
    // Red de seguridad: unique compuesto (codigo, proveedor_id) en DB.
    // Race condition: el findFirst no detectó pero la DB sí — re-chequeo para
    // no perder el caso restaurable; si ya no existe → 409 genérico de siempre.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const conflicto = await detectarConflictoCodigo(input.codigo, input.proveedor_id);
      if (conflicto.tipo === 'inactivo_sin_stock') {
        return err(
          conflictRestaurableError('Producto', {
            producto_id: conflicto.producto.id,
            message: `Ya existe un producto inactivo con el código ${input.codigo} para este proveedor`,
          })
        );
      }
      return err(conflictError('Producto', `Código ${input.codigo} ya existe para este proveedor`));
    }
    logger.error({ error, input }, 'Error al crear producto');
    return err(databaseError('Error al crear producto', error as Error));
  }
}

// Update product (solo campos del maestro; NO crea lotes)
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
      const conflicto = await detectarConflictoCodigo(data.codigo, proveedorId, id);

      if (conflicto.tipo !== 'libre') {
        // RF-08 (espejo de RF-05): inactivo sin lotes activos → restaurable
        if (conflicto.tipo === 'inactivo_sin_stock') {
          return err(
            conflictRestaurableError('Producto', {
              producto_id: conflicto.producto.id,
              message: `Ya existe un producto inactivo con el código ${data.codigo} para este proveedor`,
            })
          );
        }
        // RF-08: activo o inactivo con stock heredado → CONFLICT normal
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

    // Build update data (solo campos del maestro)
    const updateData: Prisma.ProductoUncheckedUpdateInput = {};
    if (data.nombre !== undefined) updateData.nombre = data.nombre;
    if (data.codigo !== undefined) updateData.codigo = data.codigo;
    if (data.cantidad_aviso !== undefined) updateData.cantidad_aviso = data.cantidad_aviso;
    if (data.precio_venta !== undefined) updateData.precio_venta = data.precio_venta;
    if (data.rubro_id !== undefined) updateData.rubro_id = data.rubro_id;
    if (data.proveedor_id !== undefined) updateData.proveedor_id = data.proveedor_id;
    if (data.unidad_medida !== undefined) updateData.unidad_medida = data.unidad_medida;
    if (data.vencimiento_preaviso_dias !== undefined) updateData.vencimiento_preaviso_dias = data.vencimiento_preaviso_dias;

    const producto = await prisma.producto.update({
      where: { id },
      data: updateData,
    });

    const sumas = await calcularStockPorProducto([id]);
    const lotes = await lotesVigentesDe([id]);

    const result: Producto = {
      ...producto,
      cantidad_aviso: toNumber(producto.cantidad_aviso),
      precio_venta: toNumber(producto.precio_venta),
      unidad_medida: producto.unidad_medida as Producto['unidad_medida'],
      vencimiento_preaviso_dias: producto.vencimiento_preaviso_dias ?? undefined,
      stock_actual: sumas.get(id) ?? 0,
      lotes,
    };

    logger.info({ productoId: producto.id, codigo: producto.codigo }, 'Producto actualizado');
    return ok(result);
  } catch (error) {
    // Red de seguridad: unique compuesto (codigo, proveedor_id) en DB.
    // Race condition: re-chequeo para no perder el caso restaurable; si no se
    // pueden derivar codigo+proveedor del payload, 409 genérico de siempre.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const codigo = typeof input.codigo === 'string' ? input.codigo : '';
      const proveedorId = typeof input.proveedor_id === 'string' ? input.proveedor_id : '';
      if (codigo && proveedorId) {
        const conflicto = await detectarConflictoCodigo(codigo, proveedorId, input.id);
        if (conflicto.tipo === 'inactivo_sin_stock') {
          return err(
            conflictRestaurableError('Producto', {
              producto_id: conflicto.producto.id,
              message: `Ya existe un producto inactivo con el código ${codigo} para este proveedor`,
            })
          );
        }
      }
      return err(conflictError('Producto', `Código ya existe para este proveedor`));
    }
    logger.error({ error, id: input.id }, 'Error al actualizar producto');
    return err(databaseError('Error al actualizar producto', error as Error));
  }
}

// Delete product → SOFT DELETE (activo=false). Permitido con historial de ventas;
// bloqueado si el producto tiene al menos un lote activo.
export async function deleteProducto(
  id: string
): Promise<AppResult<{ success: boolean }>> {
  try {
    const existing = await prisma.producto.findUnique({
      where: { id },
    });

    if (!existing) {
      return err(notFoundError('Producto', id));
    }

    // Bloqueado si hay stock activo sin retirar
    const loteActivo = await prisma.lote.findFirst({
      where: {
        producto_id: id,
        estado: 'activo',
      },
      select: { id: true },
    });

    if (loteActivo) {
      return err(validationError('El producto tiene stock activo: retirar o agotar lotes primero'));
    }

    await prisma.producto.update({
      where: { id },
      data: { activo: false },
    });

    logger.info({ productoId: id, codigo: existing.codigo }, 'Producto dado de baja (soft delete)');
    return ok({ success: true });
  } catch (error) {
    logger.error({ error, id }, 'Error al dar de baja producto');
    return err(databaseError('Error al dar de baja producto', error as Error));
  }
}

// Restore product → espejo inverso del soft delete (activo=true).
// Idempotente: si ya está activo → 200 no-op sin tocar DB. Bloqueado (VALIDATION_ERROR)
// si el producto tiene al menos un lote activo (mismo criterio y mensaje que deleteProducto).
export async function restoreProducto(id: string): Promise<AppResult<Producto>> {
  try {
    const existing = await prisma.producto.findUnique({
      where: { id },
    });

    if (!existing) {
      return err(notFoundError('Producto', id));
    }

    // Idempotencia: ya activo → 200 no-op. NO se toca DB; se calcula el stock
    // actual para devolver el Producto completo (mismo armado que updateProducto).
    if (existing.activo) {
      const sumas = await calcularStockPorProducto([id]);
      const lotes = await lotesVigentesDe([id]);

      const result: Producto = {
        ...existing,
        cantidad_aviso: toNumber(existing.cantidad_aviso),
        precio_venta: toNumber(existing.precio_venta),
        unidad_medida: existing.unidad_medida as Producto['unidad_medida'],
        vencimiento_preaviso_dias: existing.vencimiento_preaviso_dias ?? undefined,
        stock_actual: sumas.get(id) ?? 0,
        lotes,
      };

      return ok(result);
    }

    // Bloqueado si hay stock activo sin retirar
    const loteActivo = await prisma.lote.findFirst({
      where: {
        producto_id: id,
        estado: 'activo',
      },
      select: { id: true },
    });

    if (loteActivo) {
      return err(validationError('El producto tiene stock activo: retirar o agotar lotes primero'));
    }

    const producto = await prisma.producto.update({
      where: { id },
      data: { activo: true },
    });

    const sumas = await calcularStockPorProducto([id]);
    const lotes = await lotesVigentesDe([id]);

    const result: Producto = {
      ...producto,
      cantidad_aviso: toNumber(producto.cantidad_aviso),
      precio_venta: toNumber(producto.precio_venta),
      unidad_medida: producto.unidad_medida as Producto['unidad_medida'],
      vencimiento_preaviso_dias: producto.vencimiento_preaviso_dias ?? undefined,
      stock_actual: sumas.get(id) ?? 0,
      lotes,
    };

    logger.info({ productoId: producto.id, codigo: producto.codigo }, 'Producto restaurado');
    return ok(result);
  } catch (error) {
    logger.error({ error, id }, 'Error al restaurar producto');
    return err(databaseError('Error al restaurar producto', error as Error));
  }
}

// Search products for autocomplete (solo activos, con stock_actual)
export async function searchProductos(
  query: string,
  tipo: 'nombre' | 'codigo' = 'nombre'
): Promise<AppResult<Producto[]>> {
  try {
    await retirarLotesVencidos();

    const where: Prisma.ProductoWhereInput = { activo: true };

    if (tipo === 'nombre') {
      where.nombre = { contains: query, mode: 'insensitive' };
    } else {
      where.codigo = { contains: query, mode: 'insensitive' };
    }

    const productos = await prisma.producto.findMany({
      where,
      take: 10,
      orderBy: { nombre: 'asc' },
    });

    const sumas = await calcularStockPorProducto(productos.map((p) => p.id));
    const lotes = await lotesVigentesDe(productos.map((p) => p.id));
    const lotesPorProducto = new Map<string, Lote[]>();
    for (const l of lotes) {
      const arr = lotesPorProducto.get(l.producto_id) ?? [];
      arr.push(l);
      lotesPorProducto.set(l.producto_id, arr);
    }

    const data: Producto[] = productos.map((p) => ({
      ...p,
      cantidad_aviso: toNumber(p.cantidad_aviso),
      precio_venta: toNumber(p.precio_venta),
      unidad_medida: p.unidad_medida as Producto['unidad_medida'],
      vencimiento_preaviso_dias: p.vencimiento_preaviso_dias ?? undefined,
      stock_actual: sumas.get(p.id) ?? 0,
      lotes: lotesPorProducto.get(p.id) ?? [],
    }));

    return ok(data);
  } catch (error) {
    logger.error({ error, query }, 'Error al buscar productos');
    return err(databaseError('Error al buscar productos', error as Error));
  }
}
