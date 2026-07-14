// src/shared/types/result.ts
// Functional error handling with neverthrow
import { Result, ok, err } from 'neverthrow';

// Domain error types
export type DomainError =
  | { code: 'VALIDATION_ERROR'; message: string; details?: Record<string, unknown> }
  | { code: 'NOT_FOUND'; message: string; resource?: string }
  | { code: 'UNAUTHORIZED'; message: string }
  | { code: 'FORBIDDEN'; message: string }
  | { code: 'CONFLICT'; message: string; resource?: string }
  | { code: 'ACCOUNT_LOCKED'; message: string; lockedUntil?: Date }
  | { code: 'INVALID_CREDENTIALS'; message: string }
  | { code: 'STOCK_INSUFFICIENT'; message: string; disponible?: number; solicitado?: number }
  | { code: 'DATABASE_ERROR'; message: string; originalError?: Error };

// Helper functions
export const createOk = ok;
export const createErr = err;

// Type-safe result helpers
export type AppResult<T> = Result<T, DomainError>;

// Validation helpers
export function validationError(message: string, details?: Record<string, unknown>): DomainError {
  const error: DomainError = { code: 'VALIDATION_ERROR', message };
  if (details !== undefined) {
    error.details = details;
  }
  return error;
}

export function notFoundError(resource: string, id?: string): DomainError {
  return {
    code: 'NOT_FOUND',
    message: `${resource} no encontrado${id ? ` con ID: ${id}` : ''}`,
    resource,
  };
}

export function conflictError(resource: string, detail?: string): DomainError {
  return {
    code: 'CONFLICT',
    message: `${resource} ya existe${detail ? `: ${detail}` : ''}`,
    resource,
  };
}

export function databaseError(message: string, originalError?: Error): DomainError {
  const error: DomainError = { code: 'DATABASE_ERROR', message };
  if (originalError !== undefined) {
    error.originalError = originalError;
  }
  return error;
}
