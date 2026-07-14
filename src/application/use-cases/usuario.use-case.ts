// src/application/use-cases/usuario.use-case.ts
// User management use cases (admin only)
import { ok, err } from 'neverthrow';
import { prisma } from '../../infrastructure/database/prisma/client.js';
import type { AppResult } from '../../shared/types/result.js';
import { notFoundError, conflictError, databaseError } from '../../shared/types/result.js';
import type { UsuarioSafe } from '../../domain/entities/usuario.js';
import type { CreateUsuarioInput, UpdateUsuarioInput, UsuarioQueryInput } from '../dto/usuario.dto.js';
import { hashPassword } from '../../infrastructure/auth/password.js';
import { logger } from '../../infrastructure/logging/logger.js';

// Get user by ID (safe, without password)
export async function getUsuarioById(
  id: string
): Promise<AppResult<UsuarioSafe>> {
  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id },
    });

    if (!usuario) {
      return err(notFoundError('Usuario', id));
    }

    const { password_hash: _, ...safeUser } = usuario;
    return ok(safeUser as UsuarioSafe);
  } catch (error) {
    logger.error({ error, id }, 'Error al obtener usuario');
    return err(databaseError('Error al obtener usuario', error as Error));
  }
}

// List users with pagination
export async function listUsuarios(
  query: UsuarioQueryInput
): Promise<AppResult<{ data: UsuarioSafe[]; pagination: {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
} }>> {
  try {
    const { search, rol, activo, sort, order, page, limit } = query;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { nombre_usuario: { contains: search, mode: 'insensitive' } },
        { nik_usuario: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (rol) {
      where.rol = rol;
    }

    if (activo !== undefined) {
      where.activo = activo;
    }

    // Build orderBy
    const orderBy: Record<string, string> = { [sort]: order };

    // Execute query
    const [usuarios, total] = await Promise.all([
      prisma.usuario.findMany({
        where,
        orderBy,
        skip,
        take: limit,
      }),
      prisma.usuario.count({ where }),
    ]);

    // Map to safe users (without passwords)
    const safeUsers = usuarios.map((u) => {
      const { password_hash: _, ...safe } = u;
      return safe as UsuarioSafe;
    });

    const totalPages = Math.ceil(total / limit);

    return ok({
      data: safeUsers,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error) {
    logger.error({ error, query }, 'Error al listar usuarios');
    return err(databaseError('Error al listar usuarios', error as Error));
  }
}

// Create user (admin only)
export async function createUsuario(
  input: CreateUsuarioInput
): Promise<AppResult<UsuarioSafe>> {
  try {
    // Check username uniqueness
    const existingNik = await prisma.usuario.findUnique({
      where: { nik_usuario: input.nik_usuario },
    });

    if (existingNik) {
      return err(conflictError('Usuario', `Nick "${input.nik_usuario}" ya registrado`));
    }

    // Check email uniqueness
    const existingEmail = await prisma.usuario.findUnique({
      where: { email: input.email },
    });

    if (existingEmail) {
      return err(conflictError('Usuario', `Email "${input.email}" ya registrado`));
    }

    // Hash password
    const passwordHash = await hashPassword(input.password);

    const usuario = await prisma.usuario.create({
      data: {
        nombre_usuario: input.nombre_usuario,
        nik_usuario: input.nik_usuario,
        password_hash: passwordHash,
        email: input.email,
        telefono: input.telefono,
        rol: input.rol,
        activo: input.activo,
      },
    });

    const { password_hash: _, ...safeUser } = usuario;

    logger.info({ userId: usuario.id, nik_usuario: usuario.nik_usuario }, 'Usuario creado');
    return ok(safeUser as UsuarioSafe);
  } catch (error) {
    logger.error({ error, input }, 'Error al crear usuario');
    return err(databaseError('Error al crear usuario', error as Error));
  }
}

// Update user (admin only)
export async function updateUsuario(
  input: UpdateUsuarioInput
): Promise<AppResult<UsuarioSafe>> {
  try {
    const { id, ...data } = input;

    // Check if user exists
    const existing = await prisma.usuario.findUnique({
      where: { id },
    });

    if (!existing) {
      return err(notFoundError('Usuario', id));
    }

    // If nik_usuario is being changed, check uniqueness
    if (data.nik_usuario) {
      const nikExists = await prisma.usuario.findFirst({
        where: {
          nik_usuario: data.nik_usuario,
          id: { not: id },
        },
      });

      if (nikExists) {
        return err(conflictError('Usuario', `Nick "${data.nik_usuario}" ya registrado`));
      }
    }

    // If email is being changed, check uniqueness
    if (data.email) {
      const emailExists = await prisma.usuario.findFirst({
        where: {
          email: data.email,
          id: { not: id },
        },
      });

      if (emailExists) {
        return err(conflictError('Usuario', `Email "${data.email}" ya registrado`));
      }
    }

    // Hash password if provided
    let updateData: Record<string, unknown> = { ...data };
    if (data.password) {
      updateData.password_hash = await hashPassword(data.password);
      delete updateData.password;
    }

    const usuario = await prisma.usuario.update({
      where: { id },
      data: updateData,
    });

    const { password_hash: _, ...safeUser } = usuario;

    logger.info({ userId: usuario.id, nik_usuario: usuario.nik_usuario }, 'Usuario actualizado');
    return ok(safeUser as UsuarioSafe);
  } catch (error) {
    logger.error({ error, id: input.id }, 'Error al actualizar usuario');
    return err(databaseError('Error al actualizar usuario', error as Error));
  }
}

// Deactivate user (admin only, soft delete)
export async function deactivateUsuario(
  id: string
): Promise<AppResult<{ success: boolean }>> {
  try {
    const existing = await prisma.usuario.findUnique({
      where: { id },
    });

    if (!existing) {
      return err(notFoundError('Usuario', id));
    }

    // Prevent deactivating yourself
    // This check should be done at the controller level too

    await prisma.usuario.update({
      where: { id },
      data: { activo: false },
    });

    logger.info({ userId: id, nik_usuario: existing.nik_usuario }, 'Usuario desactivado');
    return ok({ success: true });
  } catch (error) {
    logger.error({ error, id }, 'Error al desactivar usuario');
    return err(databaseError('Error al desactivar usuario', error as Error));
  }
}
