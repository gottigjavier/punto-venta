// src/application/use-cases/auth.use-case.ts
// Authentication use cases
import type { Result } from 'neverthrow';
import { ok, err } from 'neverthrow';
import { prisma } from '../../infrastructure/database/prisma/client.js';
import { verifyPassword } from '../../infrastructure/auth/password.js';
import { generateTokenPair } from '../../infrastructure/auth/jwt.js';
import type { TokenPair } from '../../infrastructure/auth/jwt.js';
import { env } from '../../infrastructure/config/env.js';
import type { DomainError } from '../../shared/types/result.js';
import type { UsuarioSafe } from '../../domain/entities/usuario.js';
import { logger } from '../../infrastructure/logging/logger.js';

interface LoginInput {
  nik_usuario: string;
  password: string;
}

interface LoginResult {
  tokens: TokenPair;
  user: UsuarioSafe;
}

// Login use case
export async function loginUseCase(input: LoginInput): Promise<Result<LoginResult, DomainError>> {
  const { nik_usuario, password } = input;

  // Find user
  const user = await prisma.usuario.findUnique({
    where: { nik_usuario },
  });

  if (!user) {
    return err({
      code: 'INVALID_CREDENTIALS',
      message: 'Credenciales inválidas',
    });
  }

  // Check if account is locked
  if (user.bloqueado_hasta && user.bloqueado_hasta > new Date()) {
    return err({
      code: 'ACCOUNT_LOCKED',
      message: `Cuenta bloqueada hasta ${user.bloqueado_hasta.toISOString()}`,
      lockedUntil: user.bloqueado_hasta,
    });
  }

  // Check if account is active
  if (!user.activo) {
    return err({
      code: 'UNAUTHORIZED',
      message: 'Cuenta desactivada',
    });
  }

  // Verify password
  const isPasswordValid = await verifyPassword(password, user.password_hash);

  if (!isPasswordValid) {
    // Increment failed attempts
    const newAttempts = user.intentos_fallidos + 1;
    const updateData: {
      intentos_fallidos: number;
      bloqueado_hasta?: Date;
    } = {
      intentos_fallidos: newAttempts,
    };

    // Lock account after max attempts
    if (newAttempts >= env.MAX_LOGIN_ATTEMPTS) {
      const lockUntil = new Date(Date.now() + env.LOCKOUT_DURATION_MINUTES * 60 * 1000);
      updateData.bloqueado_hasta = lockUntil;

      logger.warn(
        {
          userId: user.id,
          nik_usuario: user.nik_usuario,
          attempts: newAttempts,
          lockedUntil: lockUntil,
        },
        'Cuenta bloqueada por intentos fallidos'
      );
    }

    await prisma.usuario.update({
      where: { id: user.id },
      data: updateData,
    });

    return err({
      code: 'INVALID_CREDENTIALS',
      message: 'Credenciales inválidas',
    });
  }

  // Reset failed attempts on successful login
  if (user.intentos_fallidos > 0 || user.bloqueado_hasta) {
    await prisma.usuario.update({
      where: { id: user.id },
      data: {
        intentos_fallidos: 0,
        bloqueado_hasta: null,
      },
    });
  }

  // Generate tokens
  const tokens = generateTokenPair({
    userId: user.id,
    nik_usuario: user.nik_usuario,
    rol: user.rol,
  });

  // Return safe user (without password)
  const { password_hash: _, ...safeUser } = user;

  logger.info({ userId: user.id, nik_usuario: user.nik_usuario }, 'Login exitoso');

  return ok({
    tokens,
    user: safeUser as UsuarioSafe,
  });
}

// Refresh token use case
export async function refreshTokenUseCase(
  refreshToken: string
): Promise<Result<{ accessToken: string }, DomainError>> {
  const { verifyRefreshToken } = await import('../../infrastructure/auth/jwt.js');

  const payload = verifyRefreshToken(refreshToken);

  if (payload.isErr()) {
    return err({
      code: 'UNAUTHORIZED',
      message: 'Refresh token inválido',
    });
  }

  // Verify user still exists and is active
  const user = await prisma.usuario.findUnique({
    where: { id: payload.value.userId },
  });

  if (!user || !user.activo) {
    return err({
      code: 'UNAUTHORIZED',
      message: 'Usuario no encontrado o inactivo',
    });
  }

  // Generate new access token
  const { generateAccessToken } = await import('../../infrastructure/auth/jwt.js');
  const accessToken = generateAccessToken({
    userId: user.id,
    nik_usuario: user.nik_usuario,
    rol: user.rol,
  });

  return ok({ accessToken });
}

// Unlock user use case (admin only)
export async function unlockUserUseCase(
  userId: string
): Promise<Result<{ success: boolean }, DomainError>> {
  const user = await prisma.usuario.findUnique({
    where: { id: userId },
  });

  if (!user) {
    return err({
      code: 'NOT_FOUND',
      message: 'Usuario no encontrado',
      resource: 'Usuario',
    });
  }

  await prisma.usuario.update({
    where: { id: userId },
    data: {
      intentos_fallidos: 0,
      bloqueado_hasta: null,
    },
  });

  logger.info({ userId, nik_usuario: user.nik_usuario }, 'Usuario desbloqueado');

  return ok({ success: true });
}
