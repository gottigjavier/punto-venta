// src/adapters/http/controllers/rubro.controller.ts
// Rubro HTTP controllers
import type { FastifyRequest, FastifyReply } from "fastify";
import {
  CreateRubroSchema,
  UpdateRubroSchema,
  RubroIdParamSchema,
} from "../../../application/dto/rubro.dto.js";
import {
  listRubros,
  getRubroById,
  createRubro,
  updateRubro,
  deleteRubro,
} from "../../../application/use-cases/rubro.use-case.js";
import { sendDomainError } from "../utils/domain-error.js";

// Helper to handle domain errors

// GET /api/v1/rubros
export async function listRubrosHandler(
  _request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const result = await listRubros();

  if (result.isErr()) {
    return sendDomainError(reply, result.error);
  }

  reply.send({
    success: true,
    data: result.value,
  });
}

// GET /api/v1/rubros/:id
export async function getRubroByIdHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parsed = RubroIdParamSchema.safeParse(request.params);

  if (!parsed.success) {
    return reply.status(400).send({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "ID de rubro inválido",
      },
    });
  }

  const result = await getRubroById(parsed.data.id);

  if (result.isErr()) {
    return sendDomainError(reply, result.error);
  }

  reply.send({
    success: true,
    data: result.value,
  });
}

// POST /api/v1/rubros
export async function createRubroHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parsed = CreateRubroSchema.safeParse(request.body);

  if (!parsed.success) {
    return reply.status(400).send({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Datos de entrada inválidos",
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  const result = await createRubro(parsed.data);

  if (result.isErr()) {
    return sendDomainError(reply, result.error);
  }

  reply.status(201).send({
    success: true,
    data: result.value,
  });
}

// PUT /api/v1/rubros/:id
export async function updateRubroHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parsedParams = RubroIdParamSchema.safeParse(request.params);
  const parsedBody = UpdateRubroSchema.omit({ id: true }).safeParse(
    request.body,
  );

  if (!parsedParams.success) {
    return reply.status(400).send({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "ID de rubro inválido",
      },
    });
  }

  if (!parsedBody.success) {
    return reply.status(400).send({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Datos de entrada inválidos",
        details: parsedBody.error.flatten().fieldErrors,
      },
    });
  }

  const result = await updateRubro({
    ...parsedBody.data,
    id: parsedParams.data.id,
  });

  if (result.isErr()) {
    return sendDomainError(reply, result.error);
  }

  reply.send({
    success: true,
    data: result.value,
  });
}

// DELETE /api/v1/rubros/:id
export async function deleteRubroHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parsed = RubroIdParamSchema.safeParse(request.params);

  if (!parsed.success) {
    return reply.status(400).send({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "ID de rubro inválido",
      },
    });
  }

  const result = await deleteRubro(parsed.data.id);

  if (result.isErr()) {
    return sendDomainError(reply, result.error);
  }

  reply.send({
    success: true,
    data: { message: "Rubro eliminado exitosamente" },
  });
}
