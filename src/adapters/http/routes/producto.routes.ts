// src/adapters/http/routes/producto.routes.ts
// Product routes - Fase 4: Documentación Swagger
import type { FastifyInstance } from 'fastify';
import {
  listProductosHandler,
  getProductoByIdHandler,
  createProductoHandler,
  updateProductoHandler,
  deleteProductoHandler,
  restoreProductoHandler,
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
        description:
          'Soft delete: desactiva el producto (activo = false). No borra la fila; ' +
          'conserva historial de ventas y lotes.\n\n' +
          '## Restricciones\n' +
          '- Bloqueado con VALIDATION_ERROR si el producto tiene al menos un lote activo (retirar o agotar lotes primero)\n' +
          '- El producto inactivo se oculta de listados y búsquedas',
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
                  success: { type: 'boolean', example: true },
                },
              },
            },
          },


        },
      },
    },
    deleteProductoHandler
  );

  // POST /api/v1/productos/:id/restore
  // Restaurar producto inactivo (activo=false → true).
  // Idempotente: si ya está activo → 200 no-op (no toca DB).
  // Bloqueado con VALIDATION_ERROR (400) si tiene lote activo: "El producto tiene stock activo: retirar o agotar lotes primero".
  // Requiere rol admin o gerente (coherente con create/update).
  fastify.post(
    '/:id/restore',
    {
      preHandler: authorize('admin', 'gerente'),
      schema: {
        description:
          'Restaurar un producto inactivo (activo = true).\n\n' +
          '## Comportamiento\n' +
          '- **Idempotente**: si el producto ya está activo, retorna 200 OK sin modificar la base de datos.\n' +
          '- **Validación**: bloqueado con 400 VALIDATION_ERROR si el producto tiene al menos un lote con estado \'activo\'. Mensaje: "El producto tiene stock activo: retirar o agotar lotes primero".\n' +
          '- **No encontrado**: 404 si el ID no existe.\n' +
          '- **Historial intacto**: no modifica ventas, cierres, lotes, precios ni ningún dato existente — solo cambia `activo` de false a true.\n\n' +
          '## Respuestas\n' +
          '- 200: Producto restaurado (o no-op si ya estaba activo).\n' +
          '- 400: Producto tiene stock activo (lotes activos sin retirar).\n' +
          '- 404: Producto no encontrado.\n' +
          '- 403: Sin permisos (requiere admin o gerente).',
        tags: ['Productos'],
        // NOTE: params validation is handled by Zod (ProductoIdParamSchema) in the
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
    restoreProductoHandler
  );
}
