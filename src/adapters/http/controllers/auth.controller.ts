// src/adapters/http/controllers/auth.controller.ts
// Auth HTTP controllers
import type { FastifyRequest, FastifyReply } from 'fastify';
import { LoginRequestSchema } from '../../../application/dto/auth.dto.js';
import {
  loginUseCase,
  refreshTokenUseCase,
  unlockUserUseCase,
} from '../../../application/use-cases/auth.use-case.js';
import { env } from '../../../infrastructure/config/env.js';
import type { DomainError } from '../../../shared/types/result.js';

// Helper to handle domain errors
function handleDomainError(reply: FastifyReply, error: DomainError): void {
  const statusCodeMap: Record<DomainError['code'], number> = {
    VALIDATION_ERROR: 400,
    NOT_FOUND: 404,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    CONFLICT: 409,
    ACCOUNT_LOCKED: 423,
    INVALID_CREDENTIALS: 401,
    STOCK_INSUFFICIENT: 409,
    DATABASE_ERROR: 500,
  };

  const statusCode = statusCodeMap[error.code] ?? 500;

  reply.status(statusCode).send({
    success: false,
    error: {
      code: error.code,
      message: error.message,
      details: 'details' in error ? error.details : undefined,
    },
  });
}

// POST /api/v1/auth/login
export async function loginHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const parsed = LoginRequestSchema.safeParse(request.body);

  if (!parsed.success) {
    return reply.status(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Datos de entrada inválidos',
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  const result = await loginUseCase(parsed.data);

  if (result.isErr()) {
    return handleDomainError(reply, result.error);
  }

  const { tokens, user } = result.value;

  // Set refresh token as httpOnly cookie
  reply.setCookie('refreshToken', tokens.refreshToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/v1/auth/refresh',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });

  reply.send({
    success: true,
    data: {
      accessToken: tokens.accessToken,
      user: {
        id: user.id,
        nombre_usuario: user.nombre_usuario,
        nik_usuario: user.nik_usuario,
        email: user.email,
        rol: user.rol,
      },
    },
  });
}

// POST /api/v1/auth/refresh
export async function refreshHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const refreshToken = request.cookies['refreshToken'] as string | undefined;

  if (!refreshToken) {
    return reply.status(401).send({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Refresh token requerido',
      },
    });
  }

  const result = await refreshTokenUseCase(refreshToken);

  if (result.isErr()) {
    return handleDomainError(reply, result.error);
  }

  reply.send({
    success: true,
    data: {
      accessToken: result.value.accessToken,
    },
  });
}

// POST /api/v1/auth/logout
export async function logoutHandler(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Clear refresh token cookie
  reply.clearCookie('refreshToken', {
    path: '/api/v1/auth/refresh',
  });

  reply.send({
    success: true,
    data: { message: 'Sesión cerrada exitosamente' },
  });
}

// POST /api/v1/auth/unlock/:userId
export async function unlockHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const params = request.params as { userId: string };
  const { userId } = params;

  // Validate UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(userId)) {
    return reply.status(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'ID de usuario inválido',
      },
    });
  }

  const result = await unlockUserUseCase(userId);

  if (result.isErr()) {
    return handleDomainError(reply, result.error);
  }

  reply.send({
    success: true,
    data: { message: 'Usuario desbloqueado exitosamente' },
  });
}
