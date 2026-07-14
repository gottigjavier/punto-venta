// src/application/use-cases/rubro.use-case.ts
// Rubro use cases
import { ok, err } from 'neverthrow';
import { prisma } from '../../infrastructure/database/prisma/client.js';
import type { AppResult } from '../../shared/types/result.js';
import { notFoundError, conflictError, databaseError } from '../../shared/types/result.js';
import type { Rubro, RubroWithCount } from '../../domain/entities/rubro.js';
import type { CreateRubroInput, UpdateRubroInput } from '../dto/rubro.dto.js';
import { logger } from '../../infrastructure/logging/logger.js';

// Get all rubros (no pagination, they are few)
export async function listRubros(): Promise<AppResult<RubroWithCount[]>> {
  try {
    const rubros = await prisma.rubro.findMany({
      include: {
        _count: {
          select: { productos: true },
        },
      },
      orderBy: { nombre: 'asc' },
    });

    return ok(rubros as RubroWithCount[]);
  } catch (error) {
    logger.error({ error }, 'Error al listar rubros');
    return err(databaseError('Error al listar rubros', error as Error));
  }
}

// Get rubro by ID
export async function getRubroById(
  id: string
): Promise<AppResult<Rubro>> {
  try {
    const rubro = await prisma.rubro.findUnique({
      where: { id },
    });

    if (!rubro) {
      return err(notFoundError('Rubro', id));
    }

    return ok(rubro as Rubro);
  } catch (error) {
    logger.error({ error, id }, 'Error al obtener rubro');
    return err(databaseError('Error al obtener rubro', error as Error));
  }
}

// Create rubro
export async function createRubro(
  input: CreateRubroInput
): Promise<AppResult<Rubro>> {
  try {
    // Check name uniqueness
    const existing = await prisma.rubro.findUnique({
      where: { nombre: input.nombre },
    });

    if (existing) {
      return err(conflictError('Rubro', `Nombre "${input.nombre}" ya existe`));
    }

    const rubro = await prisma.rubro.create({
      data: {
        nombre: input.nombre,
        descripcion: input.descripcion ?? null,
        activo: input.activo,
      },
    });

    logger.info({ rubroId: rubro.id, nombre: rubro.nombre }, 'Rubro creado');
    return ok(rubro as Rubro);
  } catch (error) {
    logger.error({ error, input }, 'Error al crear rubro');
    return err(databaseError('Error al crear rubro', error as Error));
  }
}

// Update rubro
export async function updateRubro(
  input: UpdateRubroInput
): Promise<AppResult<Rubro>> {
  try {
    const { id, ...data } = input;

    // Check if rubro exists
    const existing = await prisma.rubro.findUnique({
      where: { id },
    });

    if (!existing) {
      return err(notFoundError('Rubro', id));
    }

    // If name is being changed, check uniqueness
    if (data.nombre) {
      const nameExists = await prisma.rubro.findFirst({
        where: {
          nombre: data.nombre,
          id: { not: id },
        },
      });

      if (nameExists) {
        return err(conflictError('Rubro', `Nombre "${data.nombre}" ya existe`));
      }
    }

    // Build update data, converting undefined to null for nullable fields
    const updateData: Record<string, unknown> = {};
    if (data.nombre !== undefined) updateData.nombre = data.nombre;
    if (data.descripcion !== undefined) updateData.descripcion = data.descripcion ?? null;
    if (data.activo !== undefined) updateData.activo = data.activo;

    const rubro = await prisma.rubro.update({
      where: { id },
      data: updateData,
    });

    logger.info({ rubroId: rubro.id, nombre: rubro.nombre }, 'Rubro actualizado');
    return ok(rubro as Rubro);
  } catch (error) {
    logger.error({ error, id: input.id }, 'Error al actualizar rubro');
    return err(databaseError('Error al actualizar rubro', error as Error));
  }
}

// Delete rubro (only if no products)
export async function deleteRubro(
  id: string
): Promise<AppResult<{ success: boolean }>> {
  try {
    const existing = await prisma.rubro.findUnique({
      where: { id },
      include: {
        _count: {
          select: { productos: true },
        },
      },
    });

    if (!existing) {
      return err(notFoundError('Rubro', id));
    }

    // Check if rubro has products
    if (existing._count.productos > 0) {
      return err({
        code: 'VALIDATION_ERROR',
        message: 'No se puede eliminar rubro con productos asociados',
      });
    }

    await prisma.rubro.delete({
      where: { id },
    });

    logger.info({ rubroId: id, nombre: existing.nombre }, 'Rubro eliminado');
    return ok({ success: true });
  } catch (error) {
    logger.error({ error, id }, 'Error al eliminar rubro');
    return err(databaseError('Error al eliminar rubro', error as Error));
  }
}
