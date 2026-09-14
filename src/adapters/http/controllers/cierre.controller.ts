// src/adapters/http/controllers/cierre.controller.ts
// Cash closure HTTP controllers
import type { FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { ListCierresQuerySchema } from "../../../application/dto/cierre.dto.js";
import { VentaCierreQuerySchema } from "../../../application/dto/venta.dto.js";
import {
  listCierres,
  getCierreById,
  exportCierreCsv,
  listVentasByCierreConDetalles,
} from "../../../application/use-cases/cierre.use-case.js";
import { sendDomainError } from "../utils/domain-error.js";

// Helper to handle domain errors (same pattern as venta.controller.ts)

// GET /api/v1/ventas/cierres - List cash closures with filters and pagination
export async function listCierresHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parsed = ListCierresQuerySchema.safeParse(request.query);

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

  const result = await listCierres(parsed.data);

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

// GET /api/v1/ventas/cierres/:id - Get cash closure by ID with details
export async function getCierreByIdHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parsedId = z
    .object({ id: z.string().min(1) })
    .safeParse(request.params);

  if (!parsedId.success) {
    return reply.status(400).send({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "ID de cierre requerido",
      },
    });
  }
  const { id } = parsedId.data;

  const result = await getCierreById(id);

  if (result.isErr()) {
    return sendDomainError(reply, result.error);
  }

  reply.send({
    success: true,
    data: result.value,
  });
}

// GET /api/v1/ventas/cierres/:id/csv - Export cash closure details as CSV
export async function exportCierreCsvHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parsedId = z
    .object({ id: z.string().min(1) })
    .safeParse(request.params);

  if (!parsedId.success) {
    return reply.status(400).send({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "ID de cierre requerido",
      },
    });
  }
  const { id } = parsedId.data;

  const result = await exportCierreCsv(id);

  if (result.isErr()) {
    return sendDomainError(reply, result.error);
  }

  reply
    .header("Content-Type", "text/csv; charset=utf-8")
    .header("Content-Disposition", `attachment; filename="cierre-${id}.csv"`)
    .send(result.value.csv);
}

// GET /api/v1/ventas/cierres/:id/ventas - Detailed sales rows for a cash closure (flat)
export async function cierreVentasHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parsedId = z
    .object({ id: z.string().min(1) })
    .safeParse(request.params);

  if (!parsedId.success) {
    return reply.status(400).send({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "ID de cierre requerido",
      },
    });
  }
  const { id } = parsedId.data;

  const parsed = VentaCierreQuerySchema.safeParse(request.query);

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

  const result = await listVentasByCierreConDetalles(id, parsed.data);

  if (result.isErr()) {
    return sendDomainError(reply, result.error);
  }

  reply.send({
    success: true,
    data: result.value,
  });
}
