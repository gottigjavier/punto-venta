// src/application/use-cases/stock.use-case.ts
// Stock management use cases
// Tras el split Producto/Lote, el stock vive en Lote. El "ingreso" opera sobre
// lotes (merge-a-sumar con promedio ponderado) y el listado devuelve UNA FILA
// POR LOTE. El retiro de vencidos es LAZY (se marca al leer).
import { ok, err } from 'neverthrow';
import { Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma/client.js';
import type { AppResult } from '../../shared/types/result.js';
import { notFoundError, conflictError, databaseError } from '../../shared/types/result.js';
import type { Producto } from '../../domain/entities/producto.js';
import type { LoteWithRelations } from '../../domain/entities/lote.js';
import type {
  StockIngresoInput,
  StockQueryInput,
  EditarLoteInput,
} from '../dto/stock.dto.js';
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

// Helper: round a number to 2 decimals (money)
function round2(val: number): number {
  return Math.round(val * 100) / 100;
}

// Helper: get YYYY-MM-DD string of a Date in UTC-3 (America/Argentina/Buenos_Aires)
// Shifts -3h from UTC to get the UTC-3 local date, using pure ms arithmetic.
// Used ONLY for "now" (Date.now() is in UTC). Product dates from the DB use
// toISOString().slice(0,10) directly since they're stored as UTC midnight
// representing the local date the user entered.
export function toUTC3DateString(date: Date): string {
  const UTC3_OFFSET_MS = 3 * 60 * 60 * 1000;
  const ms = date.getTime() - UTC3_OFFSET_MS; // subtract to go from UTC to UTC-3
  // Days since Unix epoch
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  // Civil date from day count (Howard Hinnant algorithm)
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - Math.floor((365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100)));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  const yr = m <= 2 ? y + 1 : y;
  return `${yr}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Prisma include compartido por todas las consultas de lote con relaciones.
// Lote NO tiene rubro/proveedor directos: se obtienen vía producto y se "suben"
// al nivel superior en el mapeo (shape del LoteWithRelations).
const loteInclude = {
  producto: {
    include: {
      rubro: {
        select: { id: true, nombre: true },
      },
      proveedor: {
        select: { id: true, razon_social: true },
      },
    },
  },
} satisfies Prisma.LoteInclude;

// Convierte un lote (con Decimales y relaciones) a LoteWithRelations tipado
function mapLote(loteRaw: unknown): LoteWithRelations {
  const l = loteRaw as {
    id: string;
    producto_id: string;
    numero_lote: string | null;
    cantidad_disponible: unknown;
    fecha_compra: Date | null;
    fecha_vencimiento: Date | null;
    precio_compra: unknown;
    estado: 'activo' | 'agotado' | 'vencido' | 'descartado';
    created_at: Date;
    producto: {
      id: string;
      nombre: string;
      codigo: string;
      unidad_medida: string;
      precio_venta: unknown;
      cantidad_aviso: unknown;
      rubro: { id: string; nombre: string };
      proveedor: { id: string; razon_social: string };
    };
  };
  return {
    id: l.id,
    producto_id: l.producto_id,
    numero_lote: l.numero_lote,
    cantidad_disponible: toNumber(l.cantidad_disponible),
    fecha_compra: l.fecha_compra,
    fecha_vencimiento: l.fecha_vencimiento,
    precio_compra: toNumber(l.precio_compra),
    estado: l.estado,
    created_at: l.created_at,
    producto: {
      id: l.producto.id,
      nombre: l.producto.nombre,
      codigo: l.producto.codigo,
      unidad_medida: l.producto.unidad_medida as LoteWithRelations['producto']['unidad_medida'],
      precio_venta: toNumber(l.producto.precio_venta),
      cantidad_aviso: toNumber(l.producto.cantidad_aviso),
    },
    rubro: l.producto.rubro,
    proveedor: l.producto.proveedor,
  };
}

// ==== Helper compartido: retiro lazy de lotes vencidos ====
// Marca vencidos TODOS los lotes activos cuya fecha_vencimiento < hoy (UTC-3).
// Se ejecuta al inicio de toda lectura de stock y de createVenta.
// Idempotente: solo cambia activo → vencido.
export async function retirarLotesVencidos(tx?: Prisma.TransactionClient): Promise<void> {
  const hoyStr = toUTC3DateString(new Date());
  await (tx ?? prisma).lote.updateMany({
    where: {
      estado: 'activo',
      fecha_vencimiento: { lt: new Date(hoyStr + 'T00:00:00.000Z') },
    },
    data: { estado: 'vencido' },
  });
}

// Filas del listado de stock: UNA FILA POR LOTE con alertas del producto
export interface StockLoteRow extends LoteWithRelations {
  estado_vencimiento: 'vencido' | 'por_vencer' | 'ok';
  stock_bajo: boolean;
}

// Ingreso de stock sobre un lote del producto (antes stockIngreso).
// Merge: mismo (producto_id, numero_lote, fecha_vencimiento) → SUMA cantidad y
// promedia precio_compra ponderado. numero_lote NULL NUNCA mergea (lote nuevo).
export async function loteIngreso(
  input: StockIngresoInput
): Promise<AppResult<{ lote: LoteWithRelations; esNuevo: boolean }>> {
  try {
    // Verificar que el producto exista
    const producto = await prisma.producto.findUnique({
      where: { id: input.producto_id },
    });

    if (!producto) {
      return err(notFoundError('Producto', input.producto_id));
    }

    // Buscar lote existente con la merge-key (numero_lote NULL jamás mergea)
    let existing: { id: string; cantidad_disponible: unknown; precio_compra: unknown } | null = null;
    if (input.numero_lote != null) {
      existing = await prisma.lote.findFirst({
        where: {
          producto_id: input.producto_id,
          numero_lote: input.numero_lote,
          fecha_vencimiento: input.fecha_vencimiento
            ? new Date(input.fecha_vencimiento)
            : null,
        },
      });
    }

    let loteRaw: unknown;
    let esNuevo = false;

    if (existing) {
      // Merge: sumar cantidad + promedio ponderado de precio_compra
      const qOld = toNumber(existing.cantidad_disponible);
      const qNew = input.cantidad;
      const pOld = toNumber(existing.precio_compra);
      const pNew = input.precio_compra;
      const precioPromedio = round2((qOld * pOld + qNew * pNew) / (qOld + qNew));

      loteRaw = await prisma.lote.update({
        where: { id: existing.id },
        data: {
          cantidad_disponible: { increment: input.cantidad },
          precio_compra: precioPromedio,
          // Re-aporte: vuelve a activo aunque estuviera descartado/agotado
          estado: 'activo',
          ...(input.fecha_compra ? { fecha_compra: new Date(input.fecha_compra) } : {}),
        },
        include: loteInclude,
      });

      logger.info(
        { loteId: existing.id, productoId: input.producto_id, numeroLote: input.numero_lote },
        'Stock sumado a lote existente via ingreso'
      );
    } else {
      esNuevo = true;
      loteRaw = await prisma.lote.create({
        data: {
          producto_id: input.producto_id,
          numero_lote: input.numero_lote ?? null,
          cantidad_disponible: input.cantidad,
          fecha_compra: input.fecha_compra ? new Date(input.fecha_compra) : null,
          fecha_vencimiento: input.fecha_vencimiento ? new Date(input.fecha_vencimiento) : null,
          precio_compra: input.precio_compra,
          estado: 'activo',
        },
        include: loteInclude,
      });

      logger.info(
        { loteId: (loteRaw as { id: string }).id, productoId: input.producto_id, numeroLote: input.numero_lote ?? null },
        'Lote creado via ingreso'
      );
    }

    // Actualizar umbral de aviso si viene
    if (input.cantidad_aviso !== undefined) {
      await prisma.producto.update({
        where: { id: input.producto_id },
        data: { cantidad_aviso: input.cantidad_aviso },
      });
    }

    // Reactivar producto si estaba inactivo (el ingreso de stock lo reactiva)
    if (!producto.activo) {
      await prisma.producto.update({
        where: { id: input.producto_id },
        data: { activo: true },
      });
    }

    if (esNuevo) {
      logger.info({ productoId: input.producto_id }, 'Producto inactivo reactivado por ingreso');
    }

    return ok({ lote: mapLote(loteRaw), esNuevo });
  } catch (error) {
    logger.error({ error, input }, 'Error en ingreso de stock');
    return err(databaseError('Error en ingreso de stock', error as Error));
  }
}

// Listado de stock (antes listStock) — UNA FILA POR LOTE.
export async function loteList(
  query: StockQueryInput
): Promise<AppResult<{ data: StockLoteRow[]; pagination: {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
} }>> {
  try {
    // Lazy pass: marcar vencidos antes de calcular
    await retirarLotesVencidos();

    const { search, rubro_id, archivados, sort, order, page, limit } = query;
    const skip = (page - 1) * limit;

    const ahora = new Date(Date.now());
    const hoyStr = toUTC3DateString(ahora);
    const limiteVencidos = new Date(hoyStr + 'T00:00:00.000Z');

    // Construir cláusula where (sobre Lote, con producto.activo == true)
    const and: Prisma.LoteWhereInput[] = [];
    and.push({ producto: { activo: true } });

    if (search) {
      and.push({
        OR: [
          {
            producto: {
              OR: [
                { nombre: { contains: search, mode: 'insensitive' } },
                { codigo: { contains: search, mode: 'insensitive' } },
              ],
            },
          },
          { numero_lote: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    if (rubro_id) {
      and.push({ producto: { rubro_id } });
    }

    // Filtro de estado: dos vistas mutuamente excluyentes.
    //   archivados === 'true' → SOLO terminales (agotado|vencido|descartado)
    //   ausente o 'false'     → SOLO 'activo'
    // Se compone (AND) con search/rubro sin cambios extra (RF-04/RF-05).
    if (archivados === 'true') {
      and.push({ estado: { in: ['agotado', 'vencido', 'descartado'] } });
    } else {
      and.push({ estado: 'activo' });
    }

    const where: Prisma.LoteWhereInput = { AND: and };

    // orderBy según sort key de lote (producto.nombre es anidado)
    const orderBy =
      sort === 'producto.nombre'
        ? [{ producto: { nombre: order } }]
        : [{ [sort]: order }];

    const [lotes, total] = await Promise.all([
      prisma.lote.findMany({
        where,
        include: loteInclude,
        orderBy,
        skip,
        take: limit,
      }),
      prisma.lote.count({ where }),
    ]);

    // stock_bajo: SUM de cantidad_disponible de lotes activos NO vencidos del producto
    // Debemos agregar por producto sobre la página (no hardcode lt:10).
    const productoIds = [...new Set((lotes as Array<{ producto_id: string }>).map((l) => l.producto_id))];
    let sumasPorProducto = new Map<string, number>();

    if (productoIds.length > 0) {
      const lotesActivos = await prisma.lote.findMany({
        where: {
          producto_id: { in: productoIds },
          estado: 'activo',
          OR: [
            { fecha_vencimiento: null },
            { fecha_vencimiento: { gte: limiteVencidos } },
          ],
        },
        select: { producto_id: true, cantidad_disponible: true },
      });

      sumasPorProducto = lotesActivos.reduce<Map<string, number>>((acc, l) => {
        acc.set(l.producto_id, (acc.get(l.producto_id) ?? 0) + toNumber(l.cantidad_disponible));
        return acc;
      }, new Map());
    }

    const data: StockLoteRow[] = (lotes as Array<{
      id: string;
      producto_id: string;
      numero_lote: string | null;
      cantidad_disponible: unknown;
      fecha_compra: Date | null;
      fecha_vencimiento: Date | null;
      precio_compra: unknown;
      estado: 'activo' | 'agotado' | 'vencido' | 'descartado';
      created_at: Date;
      producto: {
        id: string;
        nombre: string;
        codigo: string;
        unidad_medida: string;
        precio_venta: unknown;
        cantidad_aviso: unknown;
        vencimiento_preaviso_dias: number | null;
        rubro: { id: string; nombre: string };
        proveedor: { id: string; razon_social: string };
      };
    }>).map((l) => {
      // D por producto con fallback 30 (null en DB = usa default global)
      const preavisoDias = l.producto.vencimiento_preaviso_dias ?? 30;
      const fechalimitePorVencer = new Date(limiteVencidos.getTime() + preavisoDias * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

      let estado_vencimiento: 'vencido' | 'por_vencer' | 'ok' = 'ok';
      if (l.fecha_vencimiento) {
        const vencStr = new Date(l.fecha_vencimiento).toISOString().slice(0, 10);
        if (vencStr < hoyStr) {
          estado_vencimiento = 'vencido';
        } else if (vencStr <= fechalimitePorVencer) {
          estado_vencimiento = 'por_vencer';
        }
      }

      const sumaDisponible = sumasPorProducto.get(l.producto_id) ?? 0;
      const cantidadAviso = toNumber(l.producto.cantidad_aviso);
      const stockBajo = sumaDisponible < cantidadAviso;

      return {
        id: l.id,
        producto_id: l.producto_id,
        numero_lote: l.numero_lote,
        cantidad_disponible: toNumber(l.cantidad_disponible),
        fecha_compra: l.fecha_compra,
        fecha_vencimiento: l.fecha_vencimiento,
        precio_compra: toNumber(l.precio_compra),
        estado: l.estado,
        created_at: l.created_at,
        producto: {
          id: l.producto.id,
          nombre: l.producto.nombre,
          codigo: l.producto.codigo,
          unidad_medida: l.producto.unidad_medida as LoteWithRelations['producto']['unidad_medida'],
          precio_venta: toNumber(l.producto.precio_venta),
          cantidad_aviso: cantidadAviso,
        },
        rubro: l.producto.rubro,
        proveedor: l.producto.proveedor,
        estado_vencimiento,
        stock_bajo: stockBajo,
      };
    });

    // El filtro por estado ya se aplicó a nivel de query (findMany + count), por lo que
    // `data` y `total` solo contienen la vista correspondiente (activo o terminales).
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
    logger.error({ error, query }, 'Error al listar stock');
    return err(databaseError('Error al listar stock', error as Error));
  }
}

// Editar un lote — NUNCA toca cantidad_disponible.
export async function loteEdit(
  id: string,
  input: EditarLoteInput
): Promise<AppResult<LoteWithRelations>> {
  try {
    const lote = await prisma.lote.findUnique({ where: { id } });

    if (!lote) {
      return err(notFoundError('Lote', id));
    }

    const nuevoNumero = input.numero_lote !== undefined ? input.numero_lote : lote.numero_lote;
    const nuevoVenc = input.fecha_vencimiento !== undefined
      ? (input.fecha_vencimiento ? new Date(input.fecha_vencimiento) : null)
      : lote.fecha_vencimiento;

    // Conflicto: si el par (numero_lote, fecha_vencimiento) queda igual a OTRO lote del producto
    if (nuevoNumero != null) {
      const duplicado = await prisma.lote.findFirst({
        where: {
          producto_id: lote.producto_id,
          numero_lote: nuevoNumero,
          fecha_vencimiento: nuevoVenc,
          id: { not: id },
        },
      });

      if (duplicado) {
        return err(conflictError('Lote', 'Existe otro lote con el mismo N° de Lote y fecha de vencimiento'));
      }
    }

    const updated = await prisma.lote.update({
      where: { id },
      data: {
        ...(input.numero_lote !== undefined ? { numero_lote: input.numero_lote } : {}),
        ...(input.fecha_compra !== undefined
          ? { fecha_compra: input.fecha_compra ? new Date(input.fecha_compra) : null }
          : {}),
        ...(input.fecha_vencimiento !== undefined
          ? { fecha_vencimiento: input.fecha_vencimiento ? new Date(input.fecha_vencimiento) : null }
          : {}),
        ...(input.precio_compra !== undefined ? { precio_compra: input.precio_compra } : {}),
      },
      include: loteInclude,
    });

    logger.info({ loteId: id, productoId: lote.producto_id }, 'Lote editado');
    return ok(mapLote(updated));
  } catch (error) {
    logger.error({ error, id }, 'Error al editar lote');
    return err(databaseError('Error al editar lote', error as Error));
  }
}

// Retirar un lote (marcar descartado) — solo desde activo/agotado.
export async function loteRetirar(id: string): Promise<AppResult<LoteWithRelations>> {
  try {
    const lote = await prisma.lote.findUnique({ where: { id } });

    if (!lote) {
      return err(notFoundError('Lote', id));
    }

    if (lote.estado !== 'activo' && lote.estado !== 'agotado') {
      return err({
        code: 'CONFLICT',
        message: 'Solo se puede retirar un lote desde estado activo/agotado',
        resource: 'Lote',
      });
    }

    const updated = await prisma.lote.update({
      where: { id },
      data: { estado: 'descartado' },
      include: loteInclude,
    });

    logger.info({ loteId: id, productoId: lote.producto_id }, 'Lote retirado (descartado)');
    return ok(mapLote(updated));
  } catch (error) {
    logger.error({ error, id }, 'Error al retirar lote');
    return err(databaseError('Error al retirar lote', error as Error));
  }
}

// Borrado físico de lote — SOLO si no tiene DetalleVenta que lo referencie.
export async function loteDelete(id: string): Promise<AppResult<{ success: boolean }>> {
  try {
    const lote = await prisma.lote.findUnique({ where: { id } });

    if (!lote) {
      return err(notFoundError('Lote', id));
    }

    const detalle = await prisma.detalleVenta.findFirst({ where: { lote_id: id } });

    if (detalle) {
      return err({
        code: 'CONFLICT',
        message: 'El lote tiene ventas asociadas: solo puede retirarse',
        resource: 'Lote',
      });
    }

    try {
      await prisma.lote.delete({ where: { id } });
    } catch (e) {
      // La FK RESTRICT es la red de seguridad final (ruta de carrera)
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
        return err({
          code: 'CONFLICT',
          message: 'El lote tiene ventas asociadas: solo puede retirarse',
          resource: 'Lote',
        });
      }
      throw e;
    }

    logger.info({ loteId: id }, 'Lote eliminado fisicamente');
    return ok({ success: true });
  } catch (error) {
    logger.error({ error, id }, 'Error al eliminar lote');
    return err(databaseError('Error al eliminar lote', error as Error));
  }
}

// Buscar productos activos para autocomplete (con stock_actual)
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

    const data = await mapProductosConStock(productos, limiteVencidos());
    return ok(data);
  } catch (error) {
    logger.error({ error, query }, 'Error al buscar productos');
    return err(databaseError('Error al buscar productos', error as Error));
  }
}

// ==== Helpers compartidos de producto con stock_actual ====

function limiteVencidos(): Date {
  const hoyStr = toUTC3DateString(new Date());
  return new Date(hoyStr + 'T00:00:00.000Z');
}

// Toma productos crudos (Prisma) y agrega stock_actual = SUM(lotes activos NO vencidos)
async function mapProductosConStock(
  productos: Array<{
    id: string;
    nombre: string;
    codigo: string;
    cantidad_aviso: unknown;
    precio_venta: unknown;
    rubro_id: string;
    proveedor_id: string;
    unidad_medida: string;
    activo: boolean;
    created_at: Date;
    updated_at: Date | null;
  }>,
  limite: Date
): Promise<Producto[]> {
  const ids = productos.map((p) => p.id);
  const lotesActivos = ids.length
    ? await prisma.lote.findMany({
        where: {
          producto_id: { in: ids },
          estado: 'activo',
          OR: [
            { fecha_vencimiento: null },
            { fecha_vencimiento: { gte: limite } },
          ],
        },
        select: { producto_id: true, cantidad_disponible: true },
      })
    : [];

  const sumas = lotesActivos.reduce<Map<string, number>>((acc, l) => {
    acc.set(l.producto_id, (acc.get(l.producto_id) ?? 0) + toNumber(l.cantidad_disponible));
    return acc;
  }, new Map());

  return productos.map((p) => ({
    ...p,
    cantidad_aviso: toNumber(p.cantidad_aviso),
    precio_venta: toNumber(p.precio_venta),
    unidad_medida: p.unidad_medida as Producto['unidad_medida'],
    stock_actual: sumas.get(p.id) ?? 0,
    lotes: [],
  }));
}

// ==== Aliases de compatibilidad (hasta Batch 4 actualice los controllers) ====
// Deprecado: el stock ahora se lista por lote. Punto de entrada nuevo: loteList.
export const listStock = loteList;
// Deprecado: el ingreso ahora opera sobre lotes. Punto de entrada nuevo: loteIngreso.
export const stockIngreso = loteIngreso;
