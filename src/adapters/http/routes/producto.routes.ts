// src/adapters/http/routes/producto.routes.ts
// Product routes - Fase 4: Documentación Swagger
import type { FastifyInstance } from 'fastify';
import {
  listProductosHandler,
  getProductoByIdHandler,
  createProductoHandler,
  updateProductoHandler,
  deleteProductoHandler,
  searchProductosHandler,
} from '../controllers/producto.controller.js';
import { authorize } from '../middleware/auth.middleware.js';

export async function productoRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/productos
  fastify.get(
    '/',
    {
      preHandler: authorize('admin', 'gerente', 'despachador'),
      schema: {
        description:
          'Listar productos con paginación, filtros y ordenamiento.\n\n' +
          '## Filtros disponibles\n' +
          '- `search`: Búsqueda por nombre o código\n' +
          '- `rubro_id`: Filtrar por rubro\n' +
          '- `proveedor_id`: Filtrar por proveedor\n' +
          '- `sort`: Campo de ordenamiento (nombre, codigo, precio_venta, precio_compra, created_at)\n' +
          '- `order`: asc o desc\n' +
          '- `page` / `limit`: Paginación',
        tags: ['Productos'],
        security: [{ bearerAuth: [] }],
        // NOTE: querystring validation is handled by Zod (ProductoQuerySchema)
        // inside listProductosHandler. Do NOT duplicate it here — keeping two
        // sources of truth (Fastify schema + Zod) caused a divergence where the
        // Fastify limit was raised but Zod still capped at 100, silently
        // rejecting the frontend's limit=1000 request.
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
    listProductosHandler
  );

  // GET /api/v1/productos/search
  fastify.get(
    '/search',
    {
      preHandler: authorize('admin', 'gerente', 'despachador'),
      schema: {
        description: 'Buscar productos para autocompletado. Mínimo 3 caracteres.',
        tags: ['Productos'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          required: ['q'],
          properties: {
            q: { type: 'string', minLength: 3, description: 'Texto de búsqueda (mínimo 3 caracteres)' },
            tipo: { type: 'string', enum: ['nombre', 'codigo'], default: 'nombre' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: { type: 'array', items: { type: 'object', additionalProperties: true } },
            },
          },
        },
      },
    },
    searchProductosHandler
  );

  // GET /api/v1/productos/:id
  fastify.get(
    '/:id',
    {
      preHandler: authorize('admin', 'gerente', 'despachador'),
      schema: {
        description: 'Obtener producto por ID con información completa.',
        tags: ['Productos'],
        // NOTE: params validation is handled by Zod (*IdParamSchema) in the
        // handler. Single source of truth — do not duplicate here.
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
    getProductoByIdHandler
  );

  // POST /api/v1/productos
  fastify.post(
    '/',
    {
      preHandler: authorize('admin', 'gerente'),
      schema: {
        description: 'Crear nuevo producto. Requiere rol admin o gerente.',
        tags: ['Productos'],
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
    createProductoHandler
  );

  // PUT /api/v1/productos/:id
  fastify.put(
    '/:id',
    {
      preHandler: authorize('admin', 'gerente'),
      schema: {
        description: 'Actualizar producto existente. Solo campos enviados serán actualizados.',
        tags: ['Productos'],
        // NOTE: params validation is handled by Zod (*IdParamSchema) in the
        // handler. Single source of truth — do not duplicate here.
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
    updateProductoHandler
  );

  // DELETE /api/v1/productos/:id
  fastify.delete(
    '/:id',
    {
      preHandler: authorize('admin'),
      schema: {
        description: 'Eliminar producto. Solo administradores.',
        tags: ['Productos'],
        // NOTE: params validation is handled by Zod (*IdParamSchema) in the
        // handler. Single source of truth — do not duplicate here.
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  message: { type: 'string', example: 'Producto eliminado exitosamente' },
                },
              },
            },
          },


        },
      },
    },
    deleteProductoHandler
  );
}
