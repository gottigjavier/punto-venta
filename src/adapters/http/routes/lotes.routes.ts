// src/adapters/http/routes/lotes.routes.ts
// Lote routes — CRUD de lotes (N° de Lote). El stock vive en Lote tras el
// split Producto/Lote; estos endpoints administran lotes directamente.
import type { FastifyInstance } from 'fastify';
import {
  crearLoteHandler,
  editarLoteHandler,
  retirarLoteHandler,
  eliminarLoteHandler,
} from '../controllers/lote.controller.js';
import { authorize } from '../middleware/auth.middleware.js';

export async function loteRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /api/v1/lotes
  fastify.post(
    '/',
    {
      preHandler: authorize('admin', 'gerente'),
      schema: {
        description:
          'Crear un lote nuevo para un producto existente.\n\n' +
          '## Comportamiento\n' +
          '- Crea un lote con `cantidad` inicial (estado `activo`)\n' +
          '- El N° de Lote es opcional; sin él no hay merge (lote siempre nuevo)\n' +
          '- NO actualiza `cantidad_aviso` del producto (para eso usar POST /stock/ingreso)',
        tags: ['Lotes'],
        // NOTE: body validation is handled by Zod (CrearLoteSchema) in
        // crearLoteHandler. Single source of truth — do not duplicate here.
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
    crearLoteHandler
  );

  // PUT /api/v1/lotes/:id
  fastify.put(
    '/:id',
    {
      preHandler: authorize('admin', 'gerente'),
      schema: {
        description:
          'Editar un lote. Solo modifica `numero_lote`, `fecha_compra`, ' +
          '`fecha_vencimiento` y `precio_compra`.\n\n' +
          '## Restricciones\n' +
          '- NUNCA modifica `cantidad_disponible` (el stock solo cambia por ingreso/venta)\n' +
          '- Si el par (N° de Lote, fecha de vencimiento) queda igual a OTRO lote del mismo producto → CONFLICT',
        tags: ['Lotes'],
        // NOTE: params/body validation is handled by Zod (LoteIdParamSchema +
        // EditarLoteSchema) in editarLoteHandler. Single source of truth.
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
    editarLoteHandler
  );

  // POST /api/v1/lotes/:id/retirar
  fastify.post(
    '/:id/retirar',
    {
      preHandler: authorize('admin', 'gerente'),
      schema: {
        description:
          'Retirar un lote (marcar como descartado). Solo desde estado ' +
          'activo/agotado.\n\n' +
          '## Comportamiento\n' +
          '- El lote pasa a `descartado` y se excluye del disponible para siempre\n' +
          '- Conserva su historial de ventas (no se borra físicamente)',
        tags: ['Lotes'],
        // NOTE: params validation is handled by Zod (LoteIdParamSchema) in
        // retirarLoteHandler. Single source of truth.
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
    retirarLoteHandler
  );

  // DELETE /api/v1/lotes/:id
  fastify.delete(
    '/:id',
    {
      preHandler: authorize('admin', 'gerente'),
      schema: {
        description:
          'Eliminar un lote físicamente.\n\n' +
          '## Restricciones\n' +
          '- Solo si el lote NO tiene ventas asociadas (DetalleVenta con su lote_id)\n' +
          '- Si tiene ventas → CONFLICT: solo puede retirarse (POST /lotes/:id/retirar)',
        tags: ['Lotes'],
        // NOTE: params validation is handled by Zod (LoteIdParamSchema) in
        // eliminarLoteHandler. Single source of truth.
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
    eliminarLoteHandler
  );
}