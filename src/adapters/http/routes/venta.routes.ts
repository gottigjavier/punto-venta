// src/adapters/http/routes/venta.routes.ts
// Sale routes - Fase 4: Documentación Swagger
import type { FastifyInstance } from 'fastify';
import {
  createVentaHandler,
  getVentaByIdHandler,
  listVentasHandler,
  getResumenDiaHandler,
  getUltimasVentasHandler,
  getMasVendidosHandler,
  deleteVentaHandler,
  cerrarCajaHandler,
  crearMovimientoHandler,
  listarMovimientosHandler,
  historialHandler,
} from '../controllers/venta.controller.js';
import { authorize } from '../middleware/auth.middleware.js';
import { registerCierreRoutes } from './cierre.routes.js';

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

  // GET /api/v1/ventas/mas-vendidos - Total quantity sold per product (must be before /:id)
  fastify.get(
    '/mas-vendidos',
    {
      preHandler: authorize('admin', 'gerente', 'despachador'),
      schema: {
        description:
          'Obtiene la frecuencia de venta (nº de ventas distintas) y monto total por producto en todo el historial. ' +
          'Solo cuenta ventas con estado "completada". Usado para ordenar el catálogo del POS por productos más vendidos.',
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
                    veces_vendido: { type: 'number' },
                    monto_total: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      },
    },
    getMasVendidosHandler
  );

  // GET /api/v1/ventas/resumen/dia - Daily summary (must be before /:id)
  fastify.get(
    '/resumen/dia',
    {
      preHandler: authorize('admin', 'gerente'),
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

  // GET /api/v1/ventas/movimientos - List movements of active period (all roles)
  fastify.get(
    '/movimientos',
    {
      preHandler: authorize('admin', 'gerente', 'despachador'),
      schema: {
        description:
          'Lista los movimientos de caja (ingresos/egresos) del periodo activo, ' +
          'ordenados por fecha/hora, con resumen de ingresos, egresos y total. ' +
          'Accesible a todos los roles con acceso a ventas.',
        tags: ['Ventas'],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'array',
                items: { type: 'object', additionalProperties: true },
              },
              resumen: {
                type: 'object',
                properties: {
                  ingresos: { type: 'number' },
                  egresos: { type: 'number' },
                  total: { type: 'number' },
                },
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
    listarMovimientosHandler
  );

  // POST /api/v1/ventas/movimientos - Create movement (all roles, password confirmed)
  fastify.post(
    '/movimientos',
    {
      preHandler: authorize('admin', 'gerente', 'despachador'),
      schema: {
        description:
          'Registra un movimiento de caja (ingreso/egreso) en el periodo activo, ' +
          'con confirmación por password del usuario logueado. ' +
          'El movimiento queda asociado al usuario y con cierre_caja_id null (periodo activo). ' +
          'Accesible a todos los roles con acceso a ventas.',
        tags: ['Ventas'],
        // NOTE: body validated by Zod (CrearMovimientoSchema) in handler.
        security: [{ bearerAuth: [] }],
        response: {
          201: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: { type: 'object', additionalProperties: true },
            },
          },
          401: {
            type: 'object',
            description: 'UNAUTHORIZED - Contraseña incorrecta o usuario no autenticado',
            properties: {
              success: { type: 'boolean', example: false },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string', example: 'UNAUTHORIZED' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    crearMovimientoHandler
  );

  // GET /api/v1/ventas/historial - Unified history (sales + cash movements)
  fastify.get(
    '/historial',
    {
      preHandler: authorize('admin', 'gerente'),
      schema: {
        description:
          'Historial unificado del periodo activo: ventas y movimientos de caja, ' +
          'mergeados en memoria y ordenados globalmente por fecha o monto. ' +
          'Solo admin/gerente.',
        tags: ['Ventas'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer' },
            limit: { type: 'integer' },
            sort: { type: 'string', enum: ['created_at', 'monto'] },
            order: { type: 'string', enum: ['asc', 'desc'] },
            fecha_desde: { type: 'string', description: 'ISO date (inclusive)' },
            fecha_hasta: { type: 'string', description: 'ISO date (inclusive)' },
            usuario_id: { type: 'string', description: 'UUID de usuario' },
            tipo_fila: { type: 'string', enum: ['venta', 'movimiento'] },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    tipo_fila: { type: 'string', enum: ['venta', 'movimiento'] },
                    created_at: { type: 'string' },
                    usuario_nombre: { type: 'string' },
                    monto: { type: 'number' },
                    estado: { type: 'string', enum: ['Venta', 'Ingreso', 'Egreso'] },
                    cantidad_items: { type: 'integer', nullable: true },
                    referencia_id: { type: 'string', nullable: true },
                  },
                },
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
    historialHandler
  );

  // GET /api/v1/ventas
  fastify.get(
    '/',
    {
      preHandler: authorize('admin', 'gerente'),
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

  // Register cierre routes (cierres, cierres/:id, cierres/:id/csv)
  await registerCierreRoutes(fastify);

  // POST /api/v1/ventas/cierre-caja - Close cash period (must be before /)
  fastify.post(
    '/cierre-caja',
    {
      preHandler: authorize('admin', 'gerente'),
      schema: {
        description:
          'Cierra la caja del período actual. Archiva (sin borrar) todas las ' +
          'ventas completadas sin cerrar en un CierreCaja, genera detalles por ' +
          'vendedor y por producto, y reinicia el resumen del día. Solo admin/gerente.',
        tags: ['Ventas'],
        // NOTE: body validated by Zod (CerrarCajaSchema) in handler. Single source of truth.
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  monto_total: { type: 'number' },
                  cantidad_ventas: { type: 'integer' },
                  fecha_cierre: { type: 'string' },
                },
              },
            },
          },
          409: {
            type: 'object',
            description: 'CONFLICT - No hay ventas completadas para cerrar',
            properties: {
              success: { type: 'boolean', example: false },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string', example: 'CONFLICT' },
                  message: { type: 'string', example: 'No hay ventas completadas para cerrar' },
                },
              },
            },
          },
        },
      },
    },
    cerrarCajaHandler
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

  // DELETE /api/v1/ventas/:id - Delete completed sale (admin/gerente only)
  fastify.delete(
    '/:id',
    {
      preHandler: authorize('admin', 'gerente'),
      schema: {
        description:
          'Eliminar una venta completada. Restituye el stock al inventario. ' +
          'Solo administradores y gerentes. El ID debe ser un UUID válido.',
        tags: ['Ventas'],
        // NOTE: params validated by Zod (VentaIdParamSchema) in handler. Single source of truth.
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: { type: 'object', properties: { id: { type: 'string' } } },
            },
          },
        },
      },
    },
    deleteVentaHandler
  );
}
