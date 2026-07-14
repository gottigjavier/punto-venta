// src/adapters/http/routes/proveedor.routes.ts
// Supplier routes - Fase 4: Documentación Swagger
import type { FastifyInstance } from 'fastify';
import {
  listProveedoresHandler,
  getProveedorByIdHandler,
  createProveedorHandler,
  updateProveedorHandler,
  deleteProveedorHandler,
} from '../controllers/proveedor.controller.js';
import { authorize } from '../middleware/auth.middleware.js';

export async function proveedorRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/proveedores
  fastify.get(
    '/',
    {
      preHandler: authorize('admin', 'gerente'),
      schema: {
        description: 'Listar proveedores con paginación y filtros.',
        tags: ['Proveedores'],
        // NOTE: querystring validation is handled by Zod (ProveedorQuerySchema) in
        // listProveedoresHandler. Single source of truth.
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
    listProveedoresHandler
  );

  // GET /api/v1/proveedores/:id
  fastify.get(
    '/:id',
    {
      preHandler: authorize('admin', 'gerente'),
      schema: {
        description: 'Obtener proveedor por ID.',
        tags: ['Proveedores'],
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
    getProveedorByIdHandler
  );

  // POST /api/v1/proveedores
  fastify.post(
    '/',
    {
      preHandler: authorize('admin', 'gerente'),
      schema: {
        description: 'Crear nuevo proveedor.',
        tags: ['Proveedores'],
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
    createProveedorHandler
  );

  // PUT /api/v1/proveedores/:id
  fastify.put(
    '/:id',
    {
      preHandler: authorize('admin', 'gerente'),
      schema: {
        description: 'Actualizar proveedor existente.',
        tags: ['Proveedores'],
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
    updateProveedorHandler
  );

  // DELETE /api/v1/proveedores/:id
  fastify.delete(
    '/:id',
    {
      preHandler: authorize('admin'),
      schema: {
        description: 'Eliminar proveedor. Solo administradores.',
        tags: ['Proveedores'],
        // NOTE: params validated by Zod (*IdParamSchema) in handler.
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: { message: { type: 'string', example: 'Proveedor eliminado exitosamente' } },
              },
            },
          },


        },
      },
    },
    deleteProveedorHandler
  );
}
