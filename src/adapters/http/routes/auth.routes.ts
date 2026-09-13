// src/adapters/http/routes/auth.routes.ts
// Auth routes - Fase 4: Documentación Swagger
import type { FastifyInstance } from 'fastify';
import {
  loginHandler,
  refreshHandler,
  logoutHandler,
  unlockHandler,
} from '../controllers/auth.controller.js';
import { authorize } from '../middleware/auth.middleware.js';
import { env } from '../../../infrastructure/config/env.js';

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /api/v1/auth/login - Public
  fastify.post(
    '/login',
    {
      // Rate-limit por IP más estricto para /login (mitiga fuerza bruta y el
      // ataque de bloqueo por lockout). Solo aplica cuando el plugin global
      // está registrado (producción); se solapa config.rateLimit a este route.
      config: {
        rateLimit: {
          max: env.LOGIN_RATE_LIMIT_MAX,
          timeWindow: env.LOGIN_RATE_LIMIT_WINDOW_MS,
        },
      },
      schema: {
        description: 'Iniciar sesión. Retorna access token y refresh token.',
        tags: ['Auth'],
        // NOTE: body validation is handled by Zod (LoginRequestSchema) in
        // loginHandler. Single source of truth.
        response: {
          200: { $ref: 'LoginResponse' },
        },
      },
    },
    loginHandler,
  );

  // POST /api/v1/auth/refresh - Public (cookie)
  fastify.post(
    '/refresh',
    {
      schema: {
        description: 'Refrescar access token.',
        tags: ['Auth'],
        response: {
          200: { $ref: 'RefreshResponse' },
        },
      },
    },
    refreshHandler,
  );

  // POST /api/v1/auth/logout
  fastify.post(
    '/logout',
    {
      schema: {
        description: 'Cerrar sesión. Limpia el refresh token cookie.',
        tags: ['Auth'],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  message: {
                    type: 'string',
                    example: 'Sesión cerrada exitosamente',
                  },
                },
              },
            },
          },
        },
      },
    },
    logoutHandler,
  );

  // POST /api/v1/auth/unlock/:userId - Admin only
  fastify.post(
    '/unlock/:userId',
    {
      preHandler: authorize('admin'),
      schema: {
        description:
          'Desbloquear usuario bloqueado por intentos fallidos. Solo administradores.',
        tags: ['Auth'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: {
              type: 'string',
              format: 'uuid',
              description: 'ID del usuario a desbloquear',
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  message: {
                    type: 'string',
                    example: 'Usuario desbloqueado exitosamente',
                  },
                },
              },
            },
          },
          403: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: false },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string', example: 'FORBIDDEN' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    unlockHandler,
  );
}
