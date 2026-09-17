// src/adapters/http/utils/domain-error.ts
// Centralizes the DomainError → HTTP mapping and response body (Q1). Replaces
// the duplicated handleDomainError found in each controller, removing drift
// risk between the code→status map and the error response shape.

import type { FastifyReply } from "fastify";
import type { DomainError } from "../../../shared/types/result.js";

// Única fuente de verdad para el status code de cada error de dominio.
const STATUS_CODE_MAP: Record<DomainError["code"], number> = {
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

export function domainErrorToStatus(error: DomainError): number {
  return STATUS_CODE_MAP[error.code] ?? 500;
}

/**
 * Envía la respuesta de error estándar para un DomainError.
 *
 * `extra` permite a controllers específicos añadir campos al objeto `error`
 * (p. ej. producto añade producto_id/activo/restaurable en CONFLICT; venta
 * añade disponible/solicitado en STOCK_INSUFFICIENT). En el caso base no se
 * pasa y el body queda byte-idéntico al anterior handleDomainError local.
 */
export function sendDomainError(
  reply: FastifyReply,
  error: DomainError,
  extra?: Record<string, unknown>,
): void {
  reply.status(domainErrorToStatus(error)).send({
    success: false,
    error: {
      code: error.code,
      message: error.message,
      ...("details" in error ? { details: error.details } : {}),
      ...extra,
    },
  });
}