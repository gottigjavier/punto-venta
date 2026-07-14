// src/adapters/http/routes/stock.routes.ts
// Stock management routes - Fase 4: Documentación Swagger
import type { FastifyInstance } from 'fastify';
import {
  listStockHandler,
  stockIngresoHandler,
  stockEditHandler,
  stockAutocompleteHandler,
} from '../controllers/stock.controller.js';
import { authorize } from '../middleware/auth.middleware.js';

export async function stockRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/stock
  fastify.get(
    '/',
    {
      preHandler: authorize('admin', 'gerente', 'despachador'),
      schema: {
        description:
          'Listar inventario con alertas de vencimiento y stock bajo.\n\n' +
          '## Filtros de alertas\n' +
          '- `vencimiento_dias`: Días para alerta de vencimiento (default: 30)\n' +
          '- `stock_bajo`: Filtrar solo stock bajo (< 10 unidades)\n' +
          '- `vencidos`: Filtrar solo productos vencidos',
        tags: ['Stock'],
        // NOTE: querystring validation is handled by Zod (StockQuerySchema) in
        // listStockHandler. Do NOT duplicate it here — single source of truth.
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
    listStockHandler
  );

  // GET /api/v1/stock/autocomplete
  fastify.get(
    '/autocomplete',
    {
      preHandler: authorize('admin', 'gerente', 'despachador'),
      schema: {
        description: 'Buscar productos para autocompletado en módulo de stock.',
        tags: ['Stock'],
        // NOTE: querystring validation is handled by Zod (StockAutocompleteSchema)
        // in stockAutocompleteHandler. Single source of truth.
        security: [{ bearerAuth: [] }],
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
    stockAutocompleteHandler
  );

  // POST /api/v1/stock/ingreso
  fastify.post(
    '/ingreso',
    {
      preHandler: authorize('admin', 'gerente'),
      schema: {
        description:
          'Ingreso de stock. Crea nuevo producto o actualiza existente.\n\n' +
          '## Comportamiento\n' +
          '- Si el código + proveedor coinciden con un producto existente y TODOS los campos coinciden → Error (no se permite duplicar)\n' +
          '- Si el código + proveedor coinciden pero hay diferencias → Actualiza el producto existente\n' +
          '- Si no existe → Crea un nuevo producto',
        tags: ['Stock'],
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
    stockIngresoHandler
  );

  // PUT /api/v1/stock/:id
  fastify.put(
    '/:id',
    {
      preHandler: authorize('admin', 'gerente'),
      schema: {
        description: 'Editar producto existente en stock. Solo campos enviados serán actualizados.',
        tags: ['Stock'],
        // NOTE: params validated by Zod (StockIdParamSchema) in handler.
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
    stockEditHandler
  );
}
