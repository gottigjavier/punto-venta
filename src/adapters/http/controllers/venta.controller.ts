// src/adapters/http/controllers/venta.controller.ts
// Sale HTTP controllers
import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  CreateVentaSchema,
  VentaQuerySchema,
  VentaIdParamSchema,
  CerrarCajaSchema,
} from '../../../application/dto/venta.dto.js';
import {
  createVenta,
  getVentaById,
  listVentas,
  getResumenDia,
  getUltimasVentasPorProducto,
  getMasVendidosPorProducto,
  deleteVenta,
  cerrarCaja,
} from '../../../application/use-cases/venta.use-case.js';
import type { DomainError } from '../../../shared/types/result.js';

// Helper to handle domain errors
function handleDomainError(reply: FastifyReply, error: DomainError): void {
  const statusCodeMap: Record<DomainError['code'], number> = {
    VALIDATION_ERROR: 400,
    NOT_FOUND: 404,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    CONFLICT: 409,
    ACCOUNT_LOCKED: 423,
    INVALID_CREDENTIALS: 401,
    STOCK_INSUFFICIENT: 409,
    DATABASE_ERROR: 500,
  };

  const statusCode = statusCodeMap[error.code] ?? 500;

  const body: {
    success: false;
    error: {
      code: string;
      message: string;
      details?: Record<string, unknown>;
      disponible?: number;
      solicitado?: number;
    };
  } = {
    success: false,
    error: {
      code: error.code,
      message: error.message,
    },
  };

  if (error.code === 'STOCK_INSUFFICIENT') {
    body.error.disponible = error.disponible;
    body.error.solicitado = error.solicitado;
  } else if ('details' in error) {
    body.error.details = error.details as Record<string, unknown>;
  }

  reply.status(statusCode).send(body);
}

// POST /api/v1/ventas/cierre-caja - Close cash period (admin/gerente)
export async function cerrarCajaHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const parsed = CerrarCajaSchema.safeParse(request.body);

  if (!parsed.success) {
    return reply.status(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Datos de entrada inválidos',
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  const user = request.user;
  if (!user) {
    return reply.status(401).send({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Usuario no autenticado',
      },
    });
  }

  const result = await cerrarCaja(user.userId, parsed.data.password);

  if (result.isErr()) {
    return handleDomainError(reply, result.error);
  }

  reply.status(200).send({
    success: true,
    data: result.value,
  });
}

// POST /api/v1/ventas - Create sale
export async function createVentaHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const parsed = CreateVentaSchema.safeParse(request.body);

  if (!parsed.success) {
    return reply.status(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Datos de entrada inválidos',
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  const user = request.user;
  if (!user) {
    return reply.status(401).send({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Usuario no autenticado',
      },
    });
  }

  const result = await createVenta(parsed.data, user.userId);

  if (result.isErr()) {
    return handleDomainError(reply, result.error);
  }

  reply.status(201).send({
    success: true,
    data: result.value,
  });
}

// GET /api/v1/ventas/:id - Get sale by ID
export async function getVentaByIdHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const params = request.params as { id: string };
  const parsed = VentaIdParamSchema.safeParse(params);

  if (!parsed.success) {
    return reply.status(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'ID de venta inválido',
      },
    });
  }

  const result = await getVentaById(parsed.data.id);

  if (result.isErr()) {
    return handleDomainError(reply, result.error);
  }

  reply.send({
    success: true,
    data: result.value,
  });
}

// GET /api/v1/ventas - List sales with pagination
export async function listVentasHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const parsed = VentaQuerySchema.safeParse(request.query);

  if (!parsed.success) {
    return reply.status(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Parámetros de consulta inválidos',
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  const result = await listVentas(parsed.data);

  if (result.isErr()) {
    return handleDomainError(reply, result.error);
  }

  const { data, pagination } = result.value;

  reply.send({
    success: true,
    data,
    pagination,
  });
}

// GET /api/v1/ventas/resumen/dia - Daily summary
export async function getResumenDiaHandler(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const result = await getResumenDia();

  if (result.isErr()) {
    return handleDomainError(reply, result.error);
  }

  reply.send({
    success: true,
    data: result.value,
  });
}

// DELETE /api/v1/ventas/:id - Delete a completed sale (admin/gerente)
export async function deleteVentaHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const params = request.params as { id: string };
  const parsed = VentaIdParamSchema.safeParse(params);

  if (!parsed.success) {
    return reply.status(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'ID de venta inválido',
      },
    });
  }

  const result = await deleteVenta(parsed.data.id);

  if (result.isErr()) {
    return handleDomainError(reply, result.error);
  }

  reply.send({
    success: true,
    data: result.value,
  });
}

// GET /api/v1/ventas/ultimas-ventas - Last sale per product
export async function getUltimasVentasHandler(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const result = await getUltimasVentasPorProducto();

  if (result.isErr()) {
    return handleDomainError(reply, result.error);
  }

  reply.send({
    success: true,
    data: result.value,
  });
}

// GET /api/v1/ventas/mas-vendidos - Total quantity sold per product (all-time)
export async function getMasVendidosHandler(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const result = await getMasVendidosPorProducto();

  if (result.isErr()) {
    return handleDomainError(reply, result.error);
  }

  reply.send({
    success: true,
    data: result.value,
  });
}
