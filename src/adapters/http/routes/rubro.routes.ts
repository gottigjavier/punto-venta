// src/adapters/http/routes/rubro.routes.ts
// Rubro routes - Fase 4: Documentación Swagger
import type { FastifyInstance } from 'fastify';
import {
  listRubrosHandler,
  getRubroByIdHandler,
  createRubroHandler,
  updateRubroHandler,
  deleteRubroHandler,
} from '../controllers/rubro.controller.js';
import { authorize } from '../middleware/auth.middleware.js';

export async function rubroRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/rubros
  fastify.get(
    '/',
    {
      preHandler: authorize('admin', 'gerente', 'despachador'),
      schema: {
        description: 'Listar todos los rubros/categorías activos.',
        tags: ['Rubros'],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: { type: 'array', items: { type: 'object', additionalProperties: true } },
            },
          },
        },
      },
    },
    listRubrosHandler
  );

  // GET /api/v1/rubros/:id
  fastify.get(
    '/:id',
    {
      preHandler: authorize('admin', 'gerente', 'despachador'),
      schema: {
        description: 'Obtener rubro por ID.',
        tags: ['Rubros'],
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
    getRubroByIdHandler
  );

  // POST /api/v1/rubros
  fastify.post(
    '/',
    {
      preHandler: authorize('admin', 'gerente'),
      schema: {
        description: 'Crear nuevo rubro/categoría.',
        tags: ['Rubros'],
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
    createRubroHandler
  );

  // PUT /api/v1/rubros/:id
  fastify.put(
    '/:id',
    {
      preHandler: authorize('admin', 'gerente'),
      schema: {
        description: 'Actualizar rubro existente.',
        tags: ['Rubros'],
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
    updateRubroHandler
  );

  // DELETE /api/v1/rubros/:id
  fastify.delete(
    '/:id',
    {
      preHandler: authorize('admin'),
      schema: {
        description: 'Eliminar rubro. Solo administradores.',
        tags: ['Rubros'],
        // NOTE: params validated by Zod (*IdParamSchema) in handler.
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: { message: { type: 'string', example: 'Rubro eliminado exitosamente' } },
              },
            },
          },


        },
      },
    },
    deleteRubroHandler
  );
}
