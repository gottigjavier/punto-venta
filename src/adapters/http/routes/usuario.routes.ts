// src/adapters/http/routes/usuario.routes.ts
// User management routes (admin only) - Fase 4: Documentación Swagger
import type { FastifyInstance } from 'fastify';
import {
  listUsuariosHandler,
  getUsuarioByIdHandler,
  createUsuarioHandler,
  updateUsuarioHandler,
  deactivateUsuarioHandler,
} from '../controllers/usuario.controller.js';
import { authorize } from '../middleware/auth.middleware.js';

export async function usuarioRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require admin role
  fastify.addHook('preHandler', authorize('admin'));

  // GET /api/v1/usuarios
  fastify.get(
    '/',
    {
      schema: {
        description: 'Listar usuarios con paginación y filtros. Solo administradores.',
        tags: ['Usuarios'],
        // NOTE: querystring validation is handled by Zod (UsuarioQuerySchema) in
        // listUsuariosHandler. Single source of truth.
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: { type: 'array', items: { type: 'object', additionalProperties: true } },
              pagination: {
                type: 'object',
                properties: {
                  page: { type: 'integer' },
                  limit: { type: 'integer' },
                  total: { type: 'integer' },
                  totalPages: { type: 'integer' },
                },
              },
            },
          },
        },
      },
    },
    listUsuariosHandler
  );

  // GET /api/v1/usuarios/:id
  fastify.get(
    '/:id',
    {
      schema: {
        description: 'Obtener usuario por ID. Solo administradores.',
        tags: ['Usuarios'],
        // NOTE: params validated by Zod (*IdParamSchema) in handler.
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: { type: 'object', additionalProperties: true },
            },
          },

        },
      },
    },
    getUsuarioByIdHandler
  );

  // POST /api/v1/usuarios
  fastify.post(
    '/',
    {
      schema: {
        description:
          'Crear nuevo usuario. Solo administradores.\n\n' +
          '## Validación de contraseña\n' +
          'Mínimo 8 caracteres, al menos 1 mayúscula, 1 número y 1 carácter especial.',
        tags: ['Usuarios'],
        security: [{ bearerAuth: [] }],
        response: {
          201: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: { type: 'object', additionalProperties: true },
            },
          },


        },
      },
    },
    createUsuarioHandler
  );

  // PUT /api/v1/usuarios/:id
  fastify.put(
    '/:id',
    {
      schema: {
        description: 'Actualizar usuario existente. Solo administradores.',
        tags: ['Usuarios'],
        // NOTE: params validated by Zod (*IdParamSchema) in handler.
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: { type: 'object', additionalProperties: true },
            },
          },


        },
      },
    },
    updateUsuarioHandler
  );

  // DELETE /api/v1/usuarios/:id (deactivate, not delete)
  fastify.delete(
    '/:id',
    {
      schema: {
        description:
          'Desactivar usuario (no elimina). Solo administradores.\n\n' +
          'No puedes desactivar tu propio usuario.',
        tags: ['Usuarios'],
        // NOTE: params validated by Zod (*IdParamSchema) in handler.
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: { message: { type: 'string', example: 'Usuario desactivado exitosamente' } },
              },
            },
          },


        },
      },
    },
    deactivateUsuarioHandler
  );
}
