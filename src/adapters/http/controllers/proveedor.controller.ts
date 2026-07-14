// src/adapters/http/controllers/proveedor.controller.ts
// Supplier HTTP controllers
import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  CreateProveedorSchema,
  UpdateProveedorSchema,
  ProveedorQuerySchema,
  ProveedorIdParamSchema,
} from '../../../application/dto/proveedor.dto.js';
import {
  getProveedorById,
  listProveedores,
  createProveedor,
  updateProveedor,
  deleteProveedor,
} from '../../../application/use-cases/proveedor.use-case.js';
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

// GET /api/v1/proveedores
export async function listProveedoresHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const parsed = ProveedorQuerySchema.safeParse(request.query);

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

  const result = await listProveedores(parsed.data);

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

// GET /api/v1/proveedores/:id
export async function getProveedorByIdHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const params = request.params as { id: string };
  const parsed = ProveedorIdParamSchema.safeParse(params);

  if (!parsed.success) {
    return reply.status(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'ID de proveedor inválido',
      },
    });
  }

  const result = await getProveedorById(parsed.data.id);

  if (result.isErr()) {
    return handleDomainError(reply, result.error);
  }

  reply.send({
    success: true,
    data: result.value,
  });
}

// POST /api/v1/proveedores
export async function createProveedorHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const parsed = CreateProveedorSchema.safeParse(request.body);

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

  const result = await createProveedor(parsed.data);

  if (result.isErr()) {
    return handleDomainError(reply, result.error);
  }

  reply.status(201).send({
    success: true,
    data: result.value,
  });
}

// PUT /api/v1/proveedores/:id
export async function updateProveedorHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const params = request.params as { id: string };
  const body = request.body as Record<string, unknown>;

  const parsed = UpdateProveedorSchema.safeParse({ ...body, id: params.id });

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

  const result = await updateProveedor(parsed.data);

  if (result.isErr()) {
    return handleDomainError(reply, result.error);
  }

  reply.send({
    success: true,
    data: result.value,
  });
}

// DELETE /api/v1/proveedores/:id
export async function deleteProveedorHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const params = request.params as { id: string };
  const parsed = ProveedorIdParamSchema.safeParse(params);

  if (!parsed.success) {
    return reply.status(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'ID de proveedor inválido',
      },
    });
  }

  const result = await deleteProveedor(parsed.data.id);

  if (result.isErr()) {
    return handleDomainError(reply, result.error);
  }

  reply.send({
    success: true,
    data: { message: 'Proveedor eliminado exitosamente' },
  });
}
