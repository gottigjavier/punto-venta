// src/application/use-cases/proveedor.use-case.ts
// Supplier use cases
import { ok, err } from 'neverthrow';
import { prisma } from '../../infrastructure/database/prisma/client.js';
import type { AppResult } from '../../shared/types/result.js';
import { notFoundError, conflictError, databaseError } from '../../shared/types/result.js';
import type { Proveedor, ProveedorWithCount } from '../../domain/entities/proveedor.js';
import type {
  CreateProveedorInput,
  UpdateProveedorInput,
  ProveedorQueryInput,
} from '../dto/proveedor.dto.js';
import { logger } from '../../infrastructure/logging/logger.js';

// Get supplier by ID
export async function getProveedorById(
  id: string
): Promise<AppResult<Proveedor>> {
  try {
    const proveedor = await prisma.proveedor.findUnique({
      where: { id },
    });

    if (!proveedor) {
      return err(notFoundError('Proveedor', id));
    }

    return ok(proveedor as Proveedor);
  } catch (error) {
    logger.error({ error, id }, 'Error al obtener proveedor');
    return err(databaseError('Error al obtener proveedor', error as Error));
  }
}

// List suppliers with pagination
export async function listProveedores(
  query: ProveedorQueryInput
): Promise<AppResult<{ data: ProveedorWithCount[]; pagination: {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
} }>> {
  try {
    const { search, sort, order, page, limit } = query;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { razon_social: { contains: search, mode: 'insensitive' } },
        { cuit: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Build orderBy
    const orderBy: Record<string, string> = { [sort]: order };

    // Execute query
    const [proveedores, total] = await Promise.all([
      prisma.proveedor.findMany({
        where,
        include: {
          _count: {
            select: { productos: true },
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.proveedor.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return ok({
      data: proveedores as ProveedorWithCount[],
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error) {
    logger.error({ error, query }, 'Error al listar proveedores');
    return err(databaseError('Error al listar proveedores', error as Error));
  }
}

// Create supplier
export async function createProveedor(
  input: CreateProveedorInput
): Promise<AppResult<Proveedor>> {
  try {
    // Check CUIT uniqueness
    if (input.cuit) {
      const existing = await prisma.proveedor.findUnique({
        where: { cuit: input.cuit },
      });

      if (existing) {
        return err(conflictError('Proveedor', `CUIT ${input.cuit} ya registrado`));
      }
    }

    const proveedor = await prisma.proveedor.create({
      data: {
        razon_social: input.razon_social,
        representante: input.representante ?? null,
        cuit: input.cuit ?? null,
        direccion_postal: input.direccion_postal ?? null,
        email: input.email ?? null,
        telefonos: input.telefonos ?? [],
      },
    });

    logger.info({ proveedorId: proveedor.id, razon_social: proveedor.razon_social }, 'Proveedor creado');
    return ok(proveedor as Proveedor);
  } catch (error) {
    logger.error({ error, input }, 'Error al crear proveedor');
    return err(databaseError('Error al crear proveedor', error as Error));
  }
}

// Update supplier
export async function updateProveedor(
  input: UpdateProveedorInput
): Promise<AppResult<Proveedor>> {
  try {
    const { id, ...data } = input;

    // Check if supplier exists
    const existing = await prisma.proveedor.findUnique({
      where: { id },
    });

    if (!existing) {
      return err(notFoundError('Proveedor', id));
    }

    // If CUIT is being changed, check uniqueness
    if (data.cuit) {
      const cuitExists = await prisma.proveedor.findFirst({
        where: {
          cuit: data.cuit,
          id: { not: id },
        },
      });

      if (cuitExists) {
        return err(conflictError('Proveedor', `CUIT ${data.cuit} ya registrado`));
      }
    }

    // Build update data, converting undefined to null for nullable fields
    const updateData: Record<string, unknown> = {};
    if (data.razon_social !== undefined) updateData.razon_social = data.razon_social;
    if (data.representante !== undefined) updateData.representante = data.representante ?? null;
    if (data.cuit !== undefined) updateData.cuit = data.cuit ?? null;
    if (data.direccion_postal !== undefined) updateData.direccion_postal = data.direccion_postal ?? null;
    if (data.email !== undefined) updateData.email = data.email ?? null;
    if (data.telefonos !== undefined) updateData.telefonos = data.telefonos ?? [];

    const proveedor = await prisma.proveedor.update({
      where: { id },
      data: updateData,
    });

    logger.info({ proveedorId: proveedor.id, razon_social: proveedor.razon_social }, 'Proveedor actualizado');
    return ok(proveedor as Proveedor);
  } catch (error) {
    logger.error({ error, id: input.id }, 'Error al actualizar proveedor');
    return err(databaseError('Error al actualizar proveedor', error as Error));
  }
}

// Delete supplier
export async function deleteProveedor(
  id: string
): Promise<AppResult<{ success: boolean }>> {
  try {
    const existing = await prisma.proveedor.findUnique({
      where: { id },
      include: {
        _count: {
          select: { productos: true },
        },
      },
    });

    if (!existing) {
      return err(notFoundError('Proveedor', id));
    }

    // Check if supplier has products
    if (existing._count.productos > 0) {
      return err({
        code: 'VALIDATION_ERROR',
        message: 'No se puede eliminar proveedor con productos asociados',
      });
    }

    await prisma.proveedor.delete({
      where: { id },
    });

    logger.info({ proveedorId: id, razon_social: existing.razon_social }, 'Proveedor eliminado');
    return ok({ success: true });
  } catch (error) {
    logger.error({ error, id }, 'Error al eliminar proveedor');
    return err(databaseError('Error al eliminar proveedor', error as Error));
  }
}
