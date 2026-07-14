// src/adapters/http/controllers/stock.controller.ts
// Stock management HTTP controllers
import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  StockIngresoSchema,
  StockEditSchema,
  StockQuerySchema,
  StockAutocompleteSchema,
} from '../../../application/dto/stock.dto.js';
import {
  listStock,
  stockIngreso,
  stockEdit,
  searchProductos,
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

// GET /api/v1/stock
export async function listStockHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const parsed = StockQuerySchema.safeParse(request.query);

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

  const result = await listStock(parsed.data);

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

// POST /api/v1/stock/ingreso
export async function stockIngresoHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const parsed = StockIngresoSchema.safeParse(request.body);

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

  const result = await stockIngreso(parsed.data);

  if (result.isErr()) {
    return handleDomainError(reply, result.error);
  }

  reply.status(201).send({
    success: true,
    data: result.value,
  });
}

// PUT /api/v1/stock/:id
export async function stockEditHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const params = request.params as { id: string };
  const body = request.body as Record<string, unknown>;

  const parsed = StockEditSchema.safeParse({ ...body, id: params.id });

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

  const result = await stockEdit(parsed.data);

  if (result.isErr()) {
    return handleDomainError(reply, result.error);
  }

  reply.send({
    success: true,
    data: result.value,
  });
}

// GET /api/v1/stock/autocomplete?q=...
export async function stockAutocompleteHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const parsed = StockAutocompleteSchema.safeParse(request.query);

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

  const result = await searchProductos(parsed.data.query, parsed.data.tipo);

  if (result.isErr()) {
    return handleDomainError(reply, result.error);
  }

  reply.send({
    success: true,
    data: result.value,
  });
}
