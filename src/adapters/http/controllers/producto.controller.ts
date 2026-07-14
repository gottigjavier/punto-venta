// src/adapters/http/controllers/producto.controller.ts
// Product HTTP controllers
import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  CreateProductoSchema,
  UpdateProductoSchema,
  ProductoQuerySchema,
  ProductoIdParamSchema,
} from '../../../application/dto/producto.dto.js';
import {
  getProductoById,
  listProductos,
  createProducto,
  updateProducto,
  deleteProducto,
  searchProductos,
} from '../../../application/use-cases/producto.use-case.js';
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

// GET /api/v1/productos
export async function listProductosHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const parsed = ProductoQuerySchema.safeParse(request.query);

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

  const result = await listProductos(parsed.data);

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

// GET /api/v1/productos/:id
export async function getProductoByIdHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const params = request.params as { id: string };
  const parsed = ProductoIdParamSchema.safeParse(params);

  if (!parsed.success) {
    return reply.status(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'ID de producto inválido',
      },
    });
  }

  const result = await getProductoById(parsed.data.id);

  if (result.isErr()) {
    return handleDomainError(reply, result.error);
  }

  reply.send({
    success: true,
    data: result.value,
  });
}

// POST /api/v1/productos
export async function createProductoHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const parsed = CreateProductoSchema.safeParse(request.body);

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

  const result = await createProducto(parsed.data);

  if (result.isErr()) {
    return handleDomainError(reply, result.error);
  }

  reply.status(201).send({
    success: true,
    data: result.value,
  });
}

// PUT /api/v1/productos/:id
export async function updateProductoHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const params = request.params as { id: string };
  const body = request.body as Record<string, unknown>;

  const parsed = UpdateProductoSchema.safeParse({ ...body, id: params.id });

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

  const result = await updateProducto(parsed.data);

  if (result.isErr()) {
    return handleDomainError(reply, result.error);
  }

  reply.send({
    success: true,
    data: result.value,
  });
}

// DELETE /api/v1/productos/:id
export async function deleteProductoHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const params = request.params as { id: string };
  const parsed = ProductoIdParamSchema.safeParse(params);

  if (!parsed.success) {
    return reply.status(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'ID de producto inválido',
      },
    });
  }

  const result = await deleteProducto(parsed.data.id);

  if (result.isErr()) {
    return handleDomainError(reply, result.error);
  }

  reply.send({
    success: true,
    data: { message: 'Producto eliminado exitosamente' },
  });
}

// GET /api/v1/productos/search?q=...
export async function searchProductosHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const query = request.query as { q?: string; tipo?: string };

  if (!query.q || query.q.length < 3) {
    return reply.status(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Mínimo 3 caracteres para búsqueda',
      },
    });
  }

  const tipo = (query.tipo as 'nombre' | 'codigo') ?? 'nombre';
  const result = await searchProductos(query.q, tipo);

  if (result.isErr()) {
    return handleDomainError(reply, result.error);
  }

  reply.send({
    success: true,
    data: result.value,
  });
}
