// src/adapters/http/routes/cierre.routes.ts
// Cash closure routes — designed to be registered inside ventaRoutes
// to avoid prefix conflict with /:id route
import type { FastifyInstance } from 'fastify';
import {
  listCierresHandler,
  getCierreByIdHandler,
  exportCierreCsvHandler,
  cierreVentasHandler,
} from '../controllers/cierre.controller.js';
import { authorize } from '../middleware/auth.middleware.js';

/**
 * Register cierre routes on an existing FastifyInstance.
 * Must be called from ventaRoutes (which is mounted at /api/v1/ventas)
 * so routes become /api/v1/ventas/cierres, /api/v1/ventas/cierres/:id, etc.
 */
export async function registerCierreRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /cierres - List cash closures with filters and pagination
  fastify.get(
    '/cierres',
    {
      preHandler: authorize('admin', 'gerente'),
      schema: {
        description:
          'Lista paginada de cierres de caja con filtros por fecha, vendedor, ' +
          'producto, proveedor y monto. Solo admin/gerente.',
        tags: ['Cierres'],
        // NOTE: querystring validation is handled by Zod (ListCierresQuerySchema) in
        // listCierresHandler. Single source of truth.
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: { type: 'object', additionalProperties: true },
              },
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
    listCierresHandler
  );

  // GET /cierres/:id/csv - Export cash closure as CSV (must be before /:id)
  fastify.get(
    '/cierres/:id/csv',
    {
      preHandler: authorize('admin', 'gerente'),
      schema: {
        description:
          'Exporta el desglose de un cierre de caja como archivo CSV. ' +
          'Solo admin/gerente.',
        tags: ['Cierres'],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'string',
            description: 'Archivo CSV con el desglose del cierre',
          },
        },
      },
    },
    exportCierreCsvHandler
  );

  // GET /cierres/:id/ventas - Detailed sales rows for a cash closure (must be before /:id)
  fastify.get(
    '/cierres/:id/ventas',
    {
      preHandler: authorize('admin', 'gerente'),
      schema: {
        description:
          'Devuelve filas aplanadas de ventas de un cierre de caja, ' +
          'una por línea de producto. Filtros server-side: vendedor, ' +
          'producto, monto_min, monto_max. Orden: cantidad o monto. ' +
          'Solo admin/gerente.',
        tags: ['Cierres'],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  rows: { type: 'array', items: { type: 'object', additionalProperties: true } },
                  total_monto: { type: 'number' },
                  total_filas: { type: 'integer' },
                },
              },
            },
          },
        },
      },
    },
    cierreVentasHandler
  );

  // GET /cierres/:id - Get cash closure by ID with details
  fastify.get(
    '/cierres/:id',
    {
      preHandler: authorize('admin', 'gerente'),
      schema: {
        description:
          'Obtiene un cierre de caja por ID con todos sus detalles. ' +
          'Solo admin/gerente.',
        tags: ['Cierres'],
        // NOTE: params validated by Zod in handler.
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
    getCierreByIdHandler
  );
}
