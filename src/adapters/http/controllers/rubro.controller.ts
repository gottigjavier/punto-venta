// src/adapters/http/controllers/rubro.controller.ts
// Rubro HTTP controllers
import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  CreateRubroSchema,
  UpdateRubroSchema,
  RubroIdParamSchema,
} from '../../../application/dto/rubro.dto.js';
import {
  listRubros,
  getRubroById,
  createRubro,
  updateRubro,
  deleteRubro,
} from '../../../application/use-cases/rubro.use-case.js';
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

// GET /api/v1/rubros
export async function listRubrosHandler(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const result = await listRubros();

  if (result.isErr()) {
    return handleDomainError(reply, result.error);
  }

  reply.send({
    success: true,
    data: result.value,
  });
}

// GET /api/v1/rubros/:id
export async function getRubroByIdHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const params = request.params as { id: string };
  const parsed = RubroIdParamSchema.safeParse(params);

  if (!parsed.success) {
    return reply.status(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'ID de rubro inválido',
      },
    });
  }

  const result = await getRubroById(parsed.data.id);

  if (result.isErr()) {
    return handleDomainError(reply, result.error);
  }

  reply.send({
    success: true,
    data: result.value,
  });
}

// POST /api/v1/rubros
export async function createRubroHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const parsed = CreateRubroSchema.safeParse(request.body);

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

  const result = await createRubro(parsed.data);

  if (result.isErr()) {
    return handleDomainError(reply, result.error);
  }

  reply.status(201).send({
    success: true,
    data: result.value,
  });
}

// PUT /api/v1/rubros/:id
export async function updateRubroHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const params = request.params as { id: string };
  const body = request.body as Record<string, unknown>;

  const parsed = UpdateRubroSchema.safeParse({ ...body, id: params.id });

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

  const result = await updateRubro(parsed.data);

  if (result.isErr()) {
    return handleDomainError(reply, result.error);
  }

  reply.send({
    success: true,
    data: result.value,
  });
}

// DELETE /api/v1/rubros/:id
export async function deleteRubroHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const params = request.params as { id: string };
  const parsed = RubroIdParamSchema.safeParse(params);

  if (!parsed.success) {
    return reply.status(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'ID de rubro inválido',
      },
    });
  }

  const result = await deleteRubro(parsed.data.id);

  if (result.isErr()) {
    return handleDomainError(reply, result.error);
  }

  reply.send({
    success: true,
    data: { message: 'Rubro eliminado exitosamente' },
  });
}
