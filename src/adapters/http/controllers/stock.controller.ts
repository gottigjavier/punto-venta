// src/adapters/http/controllers/stock.controller.ts
// Stock management HTTP controllers
import type { FastifyRequest, FastifyReply } from "fastify";
import {
  StockIngresoSchema,
  StockQuerySchema,
  StockAutocompleteSchema,
} from "../../../application/dto/stock.dto.js";
import {
  loteList,
  loteIngreso,
  searchProductos,
} from "../../../application/use-cases/stock.use-case.js";
import { sendDomainError } from "../utils/domain-error.js";

// Helper to handle domain errors


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
        code: "VALIDATION_ERROR",
        message: "Parámetros de consulta inválidos",
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  const result = await loteList(parsed.data);

  if (result.isErr()) {
    return sendDomainError(reply, result.error);
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
        code: "VALIDATION_ERROR",
        message: "Datos de entrada inválidos",
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  const result = await loteIngreso(parsed.data);

  if (result.isErr()) {
    return sendDomainError(reply, result.error);
  }

  const { esNuevo, lote } = result.value;
  reply.status(esNuevo ? 201 : 200).send({
    success: true,
    data: lote,
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
        code: "VALIDATION_ERROR",
        message: "Parámetros de consulta inválidos",
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  const result = await searchProductos(parsed.data.query, parsed.data.tipo);

  if (result.isErr()) {
    return sendDomainError(reply, result.error);
  }

  reply.send({
    success: true,
    data: result.value,
  });
}
