// src/adapters/http/controllers/lote.controller.ts
// Lote (stock) HTTP controllers — CRUD de lotes tras el split Producto/Lote.
// El alta de lotes vive en POST /stock/ingreso (loteIngreso, ver stock.routes.ts).
// Acá: PUT /lotes/:id edita metadatos (NUNCA cantidad),
// POST /lotes/:id/retirar descarta y
// DELETE /lotes/:id borra físicamente solo si no tiene DetalleVenta.
import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  EditarLoteSchema,
  LoteIdParamSchema,
} from '../../../application/dto/stock.dto.js';
import {
  loteEdit,
  loteRetirar,
  loteDelete,
} from '../../../application/use-cases/stock.use-case.js';
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

  reply.status(statusCode).send({
    success: false,
    error: {
      code: error.code,
      message: error.message,
      details: 'details' in error ? error.details : undefined,
    },
  });
}

// NOTE: El alta de lotes (POST) vive en POST /stock/ingreso (loteIngreso).
// Este archivo solo expone editar / retirar / eliminar.

// PUT /api/v1/lotes/:id
// Edita SOLO numero_lote, fecha_compra, fecha_vencimiento, precio_compra.
// NUNCA toca cantidad_disponible (el stock solo cambia por ingreso/venta).
export async function editarLoteHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const parsedParams = LoteIdParamSchema.safeParse(request.params);
  const parsedBody = EditarLoteSchema.safeParse(request.body);

  if (!parsedParams.success) {
    return reply.status(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'ID de lote inválido',
      },
    });
  }

  if (!parsedBody.success) {
    return reply.status(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Datos de entrada inválidos',
        details: parsedBody.error.flatten().fieldErrors,
      },
    });
  }

  const result = await loteEdit(parsedParams.data.id, parsedBody.data);

  if (result.isErr()) {
    return handleDomainError(reply, result.error);
  }

  reply.send({
    success: true,
    data: result.value,
  });
}

// POST /api/v1/lotes/:id/retirar
// Marca el lote como descartado (solo desde activo/agotado). Se excluye del
// disponible para siempre; conserva historial de ventas.
export async function retirarLoteHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const parsed = LoteIdParamSchema.safeParse(request.params);

  if (!parsed.success) {
    return reply.status(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'ID de lote inválido',
      },
    });
  }

  const result = await loteRetirar(parsed.data.id);

  if (result.isErr()) {
    return handleDomainError(reply, result.error);
  }

  reply.send({
    success: true,
    data: result.value,
  });
}

// DELETE /api/v1/lotes/:id
// Borrado físico SOLO si el lote no tiene DetalleVenta que lo referencie;
// si tiene ventas asociadas → CONFLICT ("solo puede retirarse").
export async function eliminarLoteHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const parsed = LoteIdParamSchema.safeParse(request.params);

  if (!parsed.success) {
    return reply.status(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'ID de lote inválido',
      },
    });
  }

  const result = await loteDelete(parsed.data.id);

  if (result.isErr()) {
    return handleDomainError(reply, result.error);
  }

  reply.send({
    success: true,
    data: result.value,
  });
}