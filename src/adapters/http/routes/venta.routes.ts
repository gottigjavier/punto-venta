// src/adapters/http/routes/venta.routes.ts
// Sale routes - Fase 4: Documentación Swagger
import type { FastifyInstance } from 'fastify';
import {
  createVentaHandler,
  getVentaByIdHandler,
  listVentasHandler,
  getResumenDiaHandler,
  getUltimasVentasHandler,
} from '../controllers/venta.controller.js';
import { authorize } from '../middleware/auth.middleware.js';

export async function ventaRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/ventas/ultimas-ventas - Last sale per product (must be before /:id)
  fastify.get(
    '/ultimas-ventas',
    {
      preHandler: authorize('admin', 'gerente', 'despachador'),
      schema: {
        description:
          'Obtiene la última fecha de venta y cantidad vendida por producto. ' +
          'Usado para ordenar el catálogo del POS por productos más recientes.',
        tags: ['Ventas'],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    producto_id: { type: 'string' },
                    ultima_venta_at: { type: 'string', nullable: true },
                    ultima_cantidad: { type: 'number', nullable: true },
                  },
                },
              },
            },
          },
        },
      },
    },
    getUltimasVentasHandler
  );

  // GET /api/v1/ventas/resumen/dia - Daily summary (must be before /:id)
  fastify.get(
    '/resumen/dia',
    {
      preHandler: authorize('admin', 'gerente', 'despachador'),
      schema: {
        description:
          'Resumen diario de ventas. Incluye total de ventas, monto total, ' +
          'productos vendidos y ventas por usuario.',
        tags: ['Ventas'],
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
    getResumenDiaHandler
  );

  // GET /api/v1/ventas
  fastify.get(
    '/',
    {
      preHandler: authorize('admin', 'gerente', 'despachador'),
      schema: {
        description: 'Listar ventas con paginación y filtros.',
        tags: ['Ventas'],
        // NOTE: querystring validation is handled by Zod (VentaQuerySchema) in
        // listVentasHandler. Single source of truth.
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
    listVentasHandler
  );

  // GET /api/v1/ventas/:id
  fastify.get(
    '/:id',
    {
      preHandler: authorize('admin', 'gerente', 'despachador'),
      schema: {
        description: 'Obtener venta por ID con detalles completos.',
        tags: ['Ventas'],
        // NOTE: params validated by Zod (VentaIdParamSchema) in handler.
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
    getVentaByIdHandler
  );

  // POST /api/v1/ventas
  fastify.post(
    '/',
    {
      preHandler: authorize('admin', 'gerente', 'despachador'),
      schema: {
        description:
          'Crear nueva venta. Transacción atómica:\n' +
          '1. Verifica stock de todos los productos\n' +
          '2. Crea la venta con estado "completada"\n' +
          '3. Crea detalles de venta\n' +
          '4. Descuenta stock automáticamente\n\n' +
          'Si falla cualquier paso, se revierte todo.',
        tags: ['Ventas'],
        security: [{ bearerAuth: [] }],
        response: {
          201: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: { type: 'object', additionalProperties: true },
            },
          },

          409: {
            type: 'object',
            description: 'STOCK_INSUFFICIENT - Stock insuficiente para algún producto',
            properties: {
              success: { type: 'boolean', example: false },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string', example: 'STOCK_INSUFFICIENT' },
                  message: { type: 'string', example: 'Stock insuficiente para producto PAN-001' },
                  disponible: { type: 'number', example: 5 },
                  solicitado: { type: 'number', example: 10 },
                },
              },
            },
          },
        },
      },
    },
    createVentaHandler
  );
}
