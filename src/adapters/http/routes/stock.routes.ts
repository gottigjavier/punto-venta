// src/adapters/http/routes/stock.routes.ts
// Stock management routes - Fase 4: Documentación Swagger
import type { FastifyInstance } from 'fastify';
import {
  listStockHandler,
  stockIngresoHandler,
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
          'Listar stock con UNA FILA POR LOTE (N° de Lote), con alertas de vencimiento y stock bajo. Dos vistas mutuamente excluyentes.\n\n' +
          '## Filtros\n' +
          '- `archivados`: (opcional) `true` → SOLO lotes terminales (`agotado`/`vencido`/`descartado`); ausente o `false` → SOLO lotes `activo`\n' +
          '- `search`: Búsqueda por nombre/código del producto o por N° de Lote (se compone con `archivados` y `rubro_id`)',
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
          'Ingreso de stock: crea un lote nuevo o SUMA a un lote existente del producto (N° de Lote).\n\n' +
          '## Comportamiento\n' +
          '- Mismo `producto_id` + mismo `numero_lote` + misma `fecha_vencimiento` → SUMA `cantidad` y promedia `precio_compra` ponderado por cantidad sobre el lote existente\n' +
          '- Mismo `numero_lote` con distinta `fecha_vencimiento` → crea lote SEPARADO\n' +
          '- `numero_lote` distinto o ausente (NULL) → siempre lote nuevo (nunca mergea)\n' +
          '- `cantidad_aviso` (opcional): si viene, actualiza el umbral de aviso del producto\n' +
          '- Si el producto estaba inactivo, el ingreso lo reactiva (`activo = true`)',
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
}
